import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend.routers import planner_store


class PlannerStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.life = self.root / "Life"
        self.work = self.root / "Work"
        self.life.mkdir()
        self.work.mkdir()
        self.root_patch = patch.object(planner_store, "get_vaults_root", return_value=self.root)
        self.list_patch = patch.object(
            planner_store,
            "list_vaults",
            return_value=[{"name": "Life"}, {"name": "Work"}],
        )
        self.root_patch.start()
        self.list_patch.start()

    def tearDown(self):
        self.list_patch.stop()
        self.root_patch.stop()
        self.temp_dir.cleanup()

    def configure(self, name: str = "Life") -> None:
        result = planner_store.put_planner_data_settings(
            planner_store.PlannerDataSettingsBody(plannerVaultName=name)
        )
        self.assertEqual(result["status"], "ready")

    def event(self, **changes):
        data = {
            "id": "event-one",
            "date": "2026-08-23",
            "title": "Plan safely",
            "start": "09:00",
            "end": "10:00",
            "subtasks": [{"id": "sub", "title": "verify", "done": False}],
        }
        data.update(changes)
        return planner_store.PlannerEventBody(**data)

    def test_configuration_initializes_database_without_touching_existing_pages(self):
        legacy = self.life / "page" / "content.nct"
        legacy.parent.mkdir()
        legacy.write_text("legacy planner data", encoding="utf-8")

        self.configure()

        database = self.life / planner_store.STORE_DIRECTORY / planner_store.DATABASE_FILENAME
        self.assertTrue(database.is_file())
        self.assertEqual(legacy.read_text(encoding="utf-8"), "legacy planner data")
        self.assertEqual(planner_store.get_store_status()["schemaVersion"], 2)

    def test_event_crud_uses_revision_conflicts_and_soft_delete(self):
        self.configure()
        created = planner_store.create_event(self.event())
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["subtasks"][0]["title"], "verify")

        update = planner_store.PlannerEventUpdateBody(
            **self.event(title="Updated").model_dump(), expectedRevision=1
        )
        updated = planner_store.update_event("event-one", update)
        self.assertEqual(updated["title"], "Updated")
        self.assertEqual(updated["revision"], 2)

        with self.assertRaises(HTTPException) as conflict:
            planner_store.update_event("event-one", update)
        self.assertEqual(conflict.exception.status_code, 409)
        self.assertEqual(planner_store.list_events()[0]["title"], "Updated")

        deleted = planner_store.delete_event(
            "event-one", planner_store.PlannerEventDeleteBody(expectedRevision=2)
        )
        self.assertIsNotNone(deleted["deletedAt"])
        self.assertEqual(planner_store.list_events(), [])
        self.assertEqual(len(planner_store.list_events(include_deleted=True)), 1)

    def test_reviews_require_expected_revision_after_creation(self):
        self.configure()
        created = planner_store.put_review(
            "2026-08-23", planner_store.PlannerReviewBody(content="First")
        )
        self.assertEqual(created["revision"], 1)
        with self.assertRaises(HTTPException) as conflict:
            planner_store.put_review(
                "2026-08-23", planner_store.PlannerReviewBody(content="Stale", expectedRevision=2)
            )
        self.assertEqual(conflict.exception.status_code, 409)
        updated = planner_store.put_review(
            "2026-08-23", planner_store.PlannerReviewBody(content="Second", expectedRevision=1)
        )
        self.assertEqual(updated["revision"], 2)

    def test_event_rejects_blank_titles_and_non_increasing_time_ranges(self):
        self.configure()
        with self.assertRaises(HTTPException) as blank_title:
            planner_store.create_event(self.event(id="blank-title", title="   "))
        self.assertEqual(blank_title.exception.status_code, 422)

        with self.assertRaises(HTTPException) as backwards_time:
            planner_store.create_event(self.event(id="backwards-time", start="10:00", end="09:00"))
        self.assertEqual(backwards_time.exception.status_code, 422)
        self.assertEqual(planner_store.list_events(), [])

    def test_selected_vault_isolated_and_rename_reference_updates(self):
        self.configure("Work")
        planner_store.create_event(self.event())
        self.assertFalse((self.life / planner_store.STORE_DIRECTORY).exists())
        self.assertTrue((self.work / planner_store.STORE_DIRECTORY / planner_store.DATABASE_FILENAME).is_file())

        planner_store.replace_planner_vault_name("Work", "Renamed")
        self.assertEqual(planner_store._load_planner_vault_name(), "Renamed")

    def test_routines_use_revision_policy_and_idempotent_date_application(self):
        self.configure()
        routine = planner_store.PlannerRoutineBody(
            id="weekday-morning", title="Morning", start="09:00", end="10:00",
            color="blue", days=[1], active=True,
        )
        created = planner_store.create_routine(routine)
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["days"], [1])

        updated = planner_store.update_routine(
            "weekday-morning",
            planner_store.PlannerRoutineUpdateBody(**{**routine.model_dump(), "title": "Updated morning"}, expectedRevision=1),
        )
        self.assertEqual(updated["revision"], 2)
        with self.assertRaises(HTTPException) as conflict:
            planner_store.update_routine(
                "weekday-morning",
                planner_store.PlannerRoutineUpdateBody(**routine.model_dump(), expectedRevision=1),
            )
        self.assertEqual(conflict.exception.status_code, 409)

        policy = planner_store.get_routine_policy()
        self.assertTrue(policy["autoApply"])
        disabled = planner_store.update_routine_policy(
            planner_store.PlannerRoutinePolicyBody(autoApply=False, expectedRevision=policy["revision"])
        )
        self.assertFalse(disabled["autoApply"])
        self.assertEqual(planner_store.apply_routines("2026-08-24", automatic=True)["skipped"], "policy-disabled")
        planner_store.update_routine_policy(
            planner_store.PlannerRoutinePolicyBody(autoApply=True, expectedRevision=disabled["revision"])
        )

        first = planner_store.apply_routines("2026-08-24")
        second = planner_store.apply_routines("2026-08-24")
        self.assertEqual(len(first["created"]), 1)
        self.assertEqual(second["created"], [])
        event = planner_store.list_events("2026-08-24", "2026-08-24")[0]
        self.assertEqual((event["source"], event["routineId"], event["title"]), ("routine", "weekday-morning", "Updated morning"))

    def test_legacy_routines_copy_requires_verified_backup_and_preserves_source(self):
        self.configure()
        source = self.life / "_planner_routines.json"
        legacy = [{"id": "legacy", "title": "Legacy routine", "start": "08:00", "end": "09:00", "color": "green", "days": []}]
        source.write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")
        source_hash = sha256(source.read_bytes()).hexdigest()
        body = planner_store.PlannerRoutineLegacyImportBody(confirmation="COPY_LEGACY_ROUTINES")

        with self.assertRaises(HTTPException) as no_backup:
            planner_store.import_legacy_routines(body)
        self.assertEqual(no_backup.exception.status_code, 409)

        with patch.object(planner_store.planner_recovery, "find_matching_verified_backup", return_value={"backupFile": "verified.zip"}):
            imported = planner_store.import_legacy_routines(body)
            repeated = planner_store.import_legacy_routines(body)
        self.assertEqual((imported["imported"], repeated["imported"], repeated["skipped"]), (1, 0, 1))
        self.assertEqual(sha256(source.read_bytes()).hexdigest(), source_hash)
        self.assertEqual(planner_store.list_routines()[0]["id"], "legacy")

    def test_server_clock_allows_one_active_event_and_persists_actual_elapsed(self):
        self.configure()
        planner_store.create_event(self.event(id="first"))
        planner_store.create_event(self.event(id="second", start="11:00", end="12:00"))
        running = planner_store.clock_in_event("first", planner_store.PlannerEventClockBody(expectedRevision=1))
        self.assertIn("T", running["clockIn"])
        self.assertIsNone(running["clockOut"])
        self.assertEqual(running["revision"], 2)

        with self.assertRaises(HTTPException) as another_active:
            planner_store.clock_in_event("second", planner_store.PlannerEventClockBody(expectedRevision=1))
        self.assertEqual(another_active.exception.status_code, 409)

        stopped = planner_store.clock_out_event("first", planner_store.PlannerEventClockBody(expectedRevision=2))
        self.assertIsNotNone(stopped["clockOut"])
        self.assertGreaterEqual(stopped["elapsed"], 0)
        self.assertEqual(stopped["revision"], 3)
        with self.assertRaises(HTTPException) as stale:
            planner_store.clock_out_event("first", planner_store.PlannerEventClockBody(expectedRevision=2))
        self.assertEqual(stale.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
