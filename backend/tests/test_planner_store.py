import tempfile
import unittest
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
        self.assertEqual(planner_store.get_store_status()["schemaVersion"], 1)

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

    def test_selected_vault_isolated_and_rename_reference_updates(self):
        self.configure("Work")
        planner_store.create_event(self.event())
        self.assertFalse((self.life / planner_store.STORE_DIRECTORY).exists())
        self.assertTrue((self.work / planner_store.STORE_DIRECTORY / planner_store.DATABASE_FILENAME).is_file())

        planner_store.replace_planner_vault_name("Work", "Renamed")
        self.assertEqual(planner_store._load_planner_vault_name(), "Renamed")


if __name__ == "__main__":
    unittest.main()
