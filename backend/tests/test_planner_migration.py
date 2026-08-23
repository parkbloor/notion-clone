import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend.routers import planner_migration, planner_recovery, planner_store


def event(event_id: str, title: str) -> dict:
    return {
        "id": event_id, "title": title, "start": "09:00", "end": "10:00",
        "color": "blue", "done": False,
    }


class PlannerMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.life = self.root / "Life"
        self.life.mkdir()
        (self.life / "_index.nct").write_text("{}", encoding="utf-8")
        (self.life / "_vault_preferences.json").write_text(json.dumps({
            "planner": {"mode": "daily", "homePageId": "home"},
        }), encoding="utf-8")
        self.patches = [
            patch.object(planner_migration, "get_vaults_root", return_value=self.root),
            patch.object(planner_recovery, "get_vaults_root", return_value=self.root),
            patch.object(planner_store, "get_vaults_root", return_value=self.root),
            patch.object(planner_store, "list_vaults", return_value=[{"name": "Life"}]),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def write_page(self, folder: str, page_id: str, payload: dict) -> Path:
        page_dir = self.life / folder
        page_dir.mkdir()
        path = page_dir / "content.nct"
        path.write_text(json.dumps({
            "id": page_id, "title": folder,
            "blocks": [{"id": f"block-{folder}", "type": "dayplanner", "content": json.dumps(payload)}],
        }), encoding="utf-8")
        return path

    def configure_target(self):
        planner_store.put_planner_data_settings(
            planner_store.PlannerDataSettingsBody(plannerVaultName="Life")
        )

    def test_preview_requires_current_matching_backup(self):
        self.write_page("home", "home", {"eventsByDate": {"2026-08-23": [event("one", "One")]}})
        self.configure_target()

        preview, _, _ = planner_migration.build_migration_preview(["Life"])

        self.assertFalse(preview["readyToMigrate"])
        self.assertIsNone(preview["backup"])
        self.assertEqual(preview["totals"]["uniqueEvents"], 1)

    def test_mixed_schema_keeps_legacy_only_events_and_prefers_current_duplicate(self):
        self.write_page("home", "home", {
            "date": "2026-08-23",
            "events": [event("same", "Legacy"), event("legacy-only", "Legacy only")],
            "eventsByDate": {"2026-08-23": [event("same", "Current")]},
        })
        self.configure_target()
        planner_recovery.create_recovery_backup()

        preview, winners, _ = planner_migration.build_migration_preview(["Life"])

        self.assertEqual(preview["totals"]["uniqueEvents"], 2)
        titles = {winner["event"]["title"] for winner in winners}
        self.assertEqual(titles, {"Current", "Legacy only"})

    def test_preview_reports_duplicates_and_conflicts_without_changing_sources(self):
        home = self.write_page("home", "home", {
            "eventsByDate": {"2026-08-23": [event("same", "Home")]},
            "reviewByDate": {"2026-08-23": "Home review"},
        })
        other = self.write_page("other", "other", {
            "date": "2026-08-23", "events": [event("same", "Other")],
            "reviewByDate": {"2026-08-23": "Other review"},
        })
        before = {path: path.read_bytes() for path in (home, other)}
        self.configure_target()
        planner_recovery.create_recovery_backup()

        preview, winners, reviews = planner_migration.build_migration_preview(["Life"])

        self.assertTrue(preview["readyToMigrate"])
        self.assertEqual(preview["totals"]["eventOccurrences"], 2)
        self.assertEqual(preview["totals"]["uniqueEvents"], 1)
        self.assertEqual(preview["totals"]["duplicateEvents"], 1)
        self.assertEqual(preview["totals"]["eventConflicts"], 1)
        self.assertEqual(preview["totals"]["reviewConflicts"], 1)
        self.assertEqual(winners[0]["event"]["title"], "Home")
        self.assertEqual(reviews[0]["content"], "Home review")
        self.assertEqual(before, {path: path.read_bytes() for path in (home, other)})

    def test_execute_is_idempotent_and_preserves_originals(self):
        source = self.write_page("home", "home", {
            "eventsByDate": {"2026-08-23": [event("one", "One")]},
            "reviewByDate": {"2026-08-23": "Review"},
        })
        original = source.read_bytes()
        self.configure_target()
        backup = planner_recovery.create_recovery_backup()
        preview, _, _ = planner_migration.build_migration_preview(["Life"])
        body = planner_migration.MigrationExecuteBody(
            sourceVaults=["Life"], backupFile=backup["backupFile"],
            previewFingerprint=preview["previewFingerprint"], confirmation="MIGRATE",
        )

        first = planner_migration.execute_migration(body)
        second = planner_migration.execute_migration(body)

        self.assertEqual(first["importedEvents"], 1)
        self.assertEqual(first["importedReviews"], 1)
        self.assertEqual(second["importedEvents"], 0)
        self.assertEqual(second["importedReviews"], 0)
        self.assertEqual(len(planner_store.list_events()), 1)
        self.assertTrue(planner_store.get_store_status()["migrationComplete"])
        self.assertEqual(planner_store.get_store_status()["writeMode"], "sqlite")
        self.assertEqual(source.read_bytes(), original)

    def test_source_change_after_backup_blocks_execution(self):
        source = self.write_page("home", "home", {
            "eventsByDate": {"2026-08-23": [event("one", "One")]},
        })
        self.configure_target()
        backup = planner_recovery.create_recovery_backup()
        preview, _, _ = planner_migration.build_migration_preview(["Life"])
        payload = json.loads(source.read_text(encoding="utf-8"))
        payload["blocks"][0]["content"] = json.dumps({
            "eventsByDate": {"2026-08-23": [event("one", "Changed")]},
        })
        source.write_text(json.dumps(payload), encoding="utf-8")

        with self.assertRaises(HTTPException) as blocked:
            planner_migration.execute_migration(planner_migration.MigrationExecuteBody(
                sourceVaults=["Life"], backupFile=backup["backupFile"],
                previewFingerprint=preview["previewFingerprint"], confirmation="MIGRATE",
            ))
        self.assertEqual(blocked.exception.status_code, 409)
        self.assertEqual(planner_store.list_events(), [])


if __name__ == "__main__":
    unittest.main()
