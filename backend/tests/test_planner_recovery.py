import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend.routers import planner_recovery


def event(event_id: str, title: str = "Private title") -> dict:
    return {
        "id": event_id,
        "title": title,
        "start": "09:00",
        "end": "10:00",
        "color": "blue",
        "done": False,
    }


def page(page_id: str, title: str, blocks: list[dict]) -> dict:
    return {
        "id": page_id,
        "title": title,
        "icon": "",
        "blocks": blocks,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }


class PlannerRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.vault = self.root / "Life"
        self.vault.mkdir()
        (self.vault / planner_recovery.INDEX_FILE).write_text("{}", encoding="utf-8")
        self.root_patch = patch.object(planner_recovery, "get_vaults_root", return_value=self.root)
        self.root_patch.start()

    def tearDown(self):
        self.root_patch.stop()
        self.temp_dir.cleanup()

    def write_page(self, folder: str, payload: dict) -> Path:
        page_dir = self.vault / folder
        page_dir.mkdir(parents=True)
        path = page_dir / planner_recovery.CONTENT_FILE
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def test_audit_is_read_only_and_reports_current_legacy_duplicates_and_home_gap(self):
        current = event("same-id")
        current_path = self.write_page("current", page("page-current", "Current", [{
            "id": "block-current",
            "type": "dayplanner",
            "content": json.dumps({"eventsByDate": {"2026-08-23": [current]}}),
        }]))
        legacy_path = self.write_page("legacy", page("page-legacy", "Legacy", [{
            "id": "block-legacy",
            "type": "dayplanner",
            "content": json.dumps({"date": "2026-08-23", "events": [current, event("legacy-only")]}),
        }]))
        (self.vault / "_vault_preferences.json").write_text(json.dumps({
            "planner": {"mode": "daily", "homePageId": "missing-home"},
        }), encoding="utf-8")
        before = {path: path.read_bytes() for path in (current_path, legacy_path)}

        audit = planner_recovery.build_recovery_audit()

        self.assertEqual(audit["totals"]["sourceCount"], 2)
        self.assertEqual(audit["totals"]["liveEventOccurrences"], 3)
        self.assertEqual(audit["totals"]["uniqueEventCount"], 2)
        self.assertEqual(audit["totals"]["duplicateOccurrences"], 1)
        self.assertEqual({source["schema"] for source in audit["sources"]}, {"current", "legacy"})
        self.assertFalse(audit["vaults"][0]["scheduleHomeFound"])
        self.assertFalse((self.root / planner_recovery.BACKUP_DIR).exists())
        self.assertEqual(before, {path: path.read_bytes() for path in (current_path, legacy_path)})

    def test_invalid_page_and_planner_content_are_reported_without_rewrite(self):
        invalid_page = self.vault / "broken" / planner_recovery.CONTENT_FILE
        invalid_page.parent.mkdir()
        invalid_page.write_text("{broken", encoding="utf-8")
        planner_path = self.write_page("planner", page("page", "Planner", [{
            "id": "block",
            "type": "dayplanner",
            "content": "{broken",
        }]))

        audit = planner_recovery.build_recovery_audit()

        self.assertEqual(audit["totals"]["errorCount"], 1)
        self.assertEqual(audit["sources"][0]["schema"], "invalid")
        self.assertTrue(audit["sources"][0]["issues"])
        self.assertEqual(invalid_page.read_text(encoding="utf-8"), "{broken")
        self.assertIn("{broken", planner_path.read_text(encoding="utf-8"))

    def test_backup_preserves_sources_and_contains_verified_manifest(self):
        content_path = self.write_page("planner", page("page", "Planner", [{
            "id": "block",
            "type": "dayplanner",
            "content": json.dumps({"eventsByDate": {"2026-08-23": [event("one")]}}),
        }]))
        routines_path = self.vault / "_planner_routines.json"
        routines_path.write_text("[]", encoding="utf-8")
        before = {path: path.read_bytes() for path in (content_path, routines_path)}

        result = planner_recovery.create_recovery_backup()

        backup_path = self.root / planner_recovery.BACKUP_DIR / result["backupFile"]
        self.assertTrue(backup_path.is_file())
        self.assertGreaterEqual(result["fileCount"], 3)
        with zipfile.ZipFile(backup_path) as archive:
            self.assertIsNone(archive.testzip())
            manifest = json.loads(archive.read("manifest.json"))
            archived_paths = {entry["relativePath"] for entry in manifest["files"]}
            self.assertIn("Life/planner/content.nct", archived_paths)
            self.assertIn("Life/_planner_routines.json", archived_paths)
            self.assertEqual(
                archive.read("vaults/Life/planner/content.nct"),
                content_path.read_bytes(),
            )
        self.assertEqual(before, {path: path.read_bytes() for path in (content_path, routines_path)})


if __name__ == "__main__":
    unittest.main()
