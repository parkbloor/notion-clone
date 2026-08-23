import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import planner_store


class PlannerStoreHttpRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.vault = self.root / "Life"
        self.vault.mkdir()
        self.patches = [
            patch.object(planner_store, "get_vaults_root", return_value=self.root),
            patch.object(planner_store, "list_vaults", return_value=[{"name": "Life"}]),
        ]
        for item in self.patches:
            item.start()
        self.app = FastAPI()
        self.app.include_router(planner_store.router)

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def client(self) -> TestClient:
        return TestClient(self.app)

    def payload(self, title: str = "Original") -> dict:
        return {
            "id": "shared-event", "date": "2026-08-23", "title": title,
            "start": "09:00", "end": "10:00", "color": "blue", "done": False,
        }

    def test_reconnect_conflict_soft_delete_and_restore_through_http_routes(self):
        with self.client() as first_client:
            configured = first_client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"})
            self.assertEqual(configured.status_code, 200)
            created = first_client.post("/api/planner/store/events", json=self.payload())
            self.assertEqual(created.status_code, 201)
            self.assertEqual(created.json()["revision"], 1)

        # A fresh HTTP client simulates reconnecting after frontend HMR/app restart.
        with self.client() as reconnected:
            persisted = reconnected.get("/api/planner/store/events?start_date=2026-08-23&end_date=2026-08-23")
            self.assertEqual(persisted.status_code, 200)
            self.assertEqual(persisted.json()[0]["title"], "Original")

            editor_a = {**self.payload("Editor A"), "expectedRevision": 1}
            editor_b = {**self.payload("Editor B"), "expectedRevision": 1}
            accepted = reconnected.put("/api/planner/store/events/shared-event", json=editor_a)
            rejected = reconnected.put("/api/planner/store/events/shared-event", json=editor_b)
            self.assertEqual(accepted.status_code, 200)
            self.assertEqual(rejected.status_code, 409)
            self.assertEqual(reconnected.get("/api/planner/store/events").json()[0]["title"], "Editor A")

            deleted = reconnected.request(
                "DELETE", "/api/planner/store/events/shared-event", json={"expectedRevision": 2}
            )
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(reconnected.get("/api/planner/store/events").json(), [])
            self.assertEqual(deleted.json()["revision"], 3)

            stale_restore = reconnected.post(
                "/api/planner/store/events/shared-event/restore", json={"expectedRevision": 2}
            )
            restored = reconnected.post(
                "/api/planner/store/events/shared-event/restore", json={"expectedRevision": 3}
            )
            self.assertEqual(stale_restore.status_code, 409)
            self.assertEqual(restored.status_code, 200)
            self.assertIsNone(restored.json()["deletedAt"])
            self.assertEqual(restored.json()["revision"], 4)


if __name__ == "__main__":
    unittest.main()
