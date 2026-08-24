import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import export_import, planner_store


class PlannerStoreHttpRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.vault = self.root / "Life"
        self.vault.mkdir()
        self.restore_vault = self.root / "Restore"
        self.restore_vault.mkdir()
        self.patches = [
            patch.object(planner_store, "get_vaults_root", return_value=self.root),
            patch.object(planner_store, "list_vaults", return_value=[{"name": "Life"}, {"name": "Restore"}]),
        ]
        for item in self.patches:
            item.start()
        self.app = FastAPI()
        self.app.include_router(planner_store.router)
        self.app.include_router(export_import.router)

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

    def test_http_crud_validates_time_range_and_keeps_deleted_events_restorable(self):
        with self.client() as client:
            self.assertEqual(
                client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code,
                200,
            )
            self.assertEqual(client.post("/api/planner/store/events", json=self.payload(title="   ")).status_code, 422)
            self.assertEqual(
                client.post("/api/planner/store/events", json={**self.payload(), "start": "10:00", "end": "09:00"}).status_code,
                422,
            )

            created = client.post("/api/planner/store/events", json=self.payload())
            self.assertEqual(created.status_code, 201)
            invalid_update = client.put(
                "/api/planner/store/events/shared-event",
                json={**self.payload("Changed"), "start": "11:00", "end": "11:00", "expectedRevision": 1},
            )
            self.assertEqual(invalid_update.status_code, 422)
            self.assertEqual(client.get("/api/planner/store/events").json()[0]["title"], "Original")

            updated = client.put(
                "/api/planner/store/events/shared-event",
                json={**self.payload("Edited"), "date": "2026-08-24", "start": "11:00", "end": "12:00", "color": "green", "expectedRevision": 1},
            )
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.json()["revision"], 2)
            deleted = client.request("DELETE", "/api/planner/store/events/shared-event", json={"expectedRevision": 2})
            self.assertEqual(deleted.status_code, 200)
            trashed = client.get("/api/planner/store/events?start_date=2026-08-24&end_date=2026-08-24&include_deleted=true")
            self.assertEqual(trashed.status_code, 200)
            self.assertEqual(trashed.json()[0]["deletedAt"] is not None, True)
            restored = client.post("/api/planner/store/events/shared-event/restore", json={"expectedRevision": 3})
            self.assertEqual(restored.status_code, 200)
            self.assertEqual(restored.json()["title"], "Edited")

    def test_bulk_schedule_and_malformed_backup_revision_are_safe(self):
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            for index in range(120):
                day = 1 + (index % 28)
                response = client.post("/api/planner/store/events", json={
                    **self.payload(f"Bulk {index}"), "id": f"bulk-{index}", "date": f"2026-09-{day:02d}",
                })
                self.assertEqual(response.status_code, 201)

            # 새 클라이언트는 대량 일정도 동일한 SQLite 원본에서 다시 읽는다.
            # Python으로 치면: assert reconnect.list_events() == created_events
            with self.client() as reconnected:
                events = reconnected.get("/api/planner/store/events?start_date=2026-09-01&end_date=2026-09-28")
                self.assertEqual((events.status_code, len(events.json())), (200, 120))
                backup = reconnected.get("/api/planner/store/backup").json()
                malformed = {**backup, "events": [{**backup["events"][0], "revision": "not-an-int"}, *backup["events"][1:]]}
                malformed["checksum"] = planner_store._portable_digest(malformed)
                self.assertEqual(reconnected.post("/api/planner/store/import/preview", json={"payload": malformed}).status_code, 422)
                self.assertEqual(len(reconnected.get("/api/planner/store/events").json()), 120)

    def test_timeline_drag_and_resize_each_make_one_revisioned_update(self):
        with self.client() as client:
            self.assertEqual(
                client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code,
                200,
            )
            created = client.post("/api/planner/store/events", json=self.payload("Timeline event"))
            self.assertEqual(created.status_code, 201)

            # Drag preview commits once when the pointer is released.
            dragged = client.put(
                "/api/planner/store/events/shared-event",
                json={**self.payload("Timeline event"), "start": "10:00", "end": "11:00", "expectedRevision": 1},
            )
            self.assertEqual(dragged.status_code, 200)
            self.assertEqual(dragged.json()["revision"], 2)

            # Resize preview is another single commit against the newest revision.
            resized = client.put(
                "/api/planner/store/events/shared-event",
                json={**self.payload("Timeline event"), "start": "10:00", "end": "11:30", "expectedRevision": 2},
            )
            self.assertEqual(resized.status_code, 200)
            self.assertEqual(resized.json()["revision"], 3)
            persisted = client.get("/api/planner/store/events?start_date=2026-08-23&end_date=2026-08-23").json()
            self.assertEqual(len(persisted), 1)
            self.assertEqual((persisted[0]["start"], persisted[0]["end"], persisted[0]["revision"]), ("10:00", "11:30", 3))

            stale = client.put(
                "/api/planner/store/events/shared-event",
                json={**self.payload("Stale"), "start": "12:00", "end": "13:00", "expectedRevision": 1},
            )
            self.assertEqual(stale.status_code, 409)
            self.assertEqual(client.get("/api/planner/store/events").json()[0]["title"], "Timeline event")

    def test_ai_batch_is_atomic_and_rejects_a_stale_reviewed_diff(self):
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            self.assertEqual(client.post("/api/planner/store/events", json=self.payload("Keep or replace")).status_code, 201)
            batch = {
                "deletes": [{"id": "shared-event", "expectedRevision": 1}],
                "creates": [{**self.payload("AI proposal"), "id": "ai-created", "start": "11:00", "end": "12:00"}],
            }
            applied = client.post("/api/planner/store/batch", json=batch)
            self.assertEqual((applied.status_code, applied.json()["deleted"], applied.json()["created"][0]["id"]), (200, ["shared-event"], "ai-created"))
            self.assertEqual([event["id"] for event in client.get("/api/planner/store/events").json()], ["ai-created"])

            self.assertEqual(client.put("/api/planner/store/events/ai-created", json={
                **self.payload("Changed after preview"), "id": "ai-created", "start": "11:00", "end": "12:00", "expectedRevision": 1,
            }).status_code, 200)

            stale = client.post("/api/planner/store/batch", json={
                "deletes": [{"id": "ai-created", "expectedRevision": 1}],
                "creates": [{**self.payload("Must not exist"), "id": "blocked-created", "start": "13:00", "end": "14:00"}],
            })
            self.assertEqual(stale.status_code, 409)
            self.assertEqual([event["id"] for event in client.get("/api/planner/store/events").json()], ["ai-created"])

    def test_routine_http_crud_policy_and_date_application_are_revision_safe(self):
        routine = {
            "id": "weekday", "title": "Weekday routine", "start": "08:00", "end": "09:00",
            "color": "green", "days": [1], "active": True,
        }
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            created = client.post("/api/planner/store/routines", json=routine)
            self.assertEqual(created.status_code, 201)
            self.assertEqual(created.json()["revision"], 1)

            policy = client.get("/api/planner/store/routine-policy").json()
            disabled = client.put("/api/planner/store/routine-policy", json={"autoApply": False, "expectedRevision": policy["revision"]})
            self.assertEqual(disabled.status_code, 200)
            self.assertEqual(client.post("/api/planner/store/routines/apply/2026-08-24?automatic=true").json()["skipped"], "policy-disabled")
            enabled = client.put("/api/planner/store/routine-policy", json={"autoApply": True, "expectedRevision": disabled.json()["revision"]})
            self.assertEqual(enabled.status_code, 200)

            first = client.post("/api/planner/store/routines/apply/2026-08-24")
            second = client.post("/api/planner/store/routines/apply/2026-08-24")
            self.assertEqual((first.status_code, len(first.json()["created"])), (200, 1))
            self.assertEqual(second.json()["created"], [])
            events = client.get("/api/planner/store/events?start_date=2026-08-24&end_date=2026-08-24").json()
            self.assertEqual((len(events), events[0]["routineId"]), (1, "weekday"))

            updated = client.put("/api/planner/store/routines/weekday", json={**routine, "title": "Updated", "expectedRevision": 1})
            stale = client.put("/api/planner/store/routines/weekday", json={**routine, "title": "Stale", "expectedRevision": 1})
            self.assertEqual((updated.status_code, updated.json()["revision"], stale.status_code), (200, 2, 409))

    def test_timer_http_uses_server_clock_and_prevents_multiple_active_events(self):
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            self.assertEqual(client.post("/api/planner/store/events", json=self.payload()).status_code, 201)
            self.assertEqual(client.post("/api/planner/store/events", json={**self.payload("Second"), "id": "second-event", "start": "11:00", "end": "12:00"}).status_code, 201)
            running = client.post("/api/planner/store/events/shared-event/clock-in", json={"expectedRevision": 1})
            blocked = client.post("/api/planner/store/events/second-event/clock-in", json={"expectedRevision": 1})
            self.assertEqual((running.status_code, running.json()["revision"], blocked.status_code), (200, 2, 409))
            self.assertIn("T", running.json()["clockIn"])
            stopped = client.post("/api/planner/store/events/shared-event/clock-out", json={"expectedRevision": 2})
            self.assertEqual((stopped.status_code, stopped.json()["revision"]), (200, 3))
            self.assertGreaterEqual(stopped.json()["elapsed"], 0)

    def test_daily_review_http_reloads_latest_revision_before_reapply(self):
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            first = client.put("/api/planner/store/reviews/2026-08-24", json={"content": "First"})
            self.assertEqual((first.status_code, first.json()["revision"]), (200, 1))
            accepted = client.put("/api/planner/store/reviews/2026-08-24", json={"content": "Latest", "expectedRevision": 1})
            stale = client.put("/api/planner/store/reviews/2026-08-24", json={"content": "My draft", "expectedRevision": 1})
            self.assertEqual((accepted.status_code, accepted.json()["revision"], stale.status_code), (200, 2, 409))
            latest = client.get("/api/planner/store/reviews/2026-08-24")
            self.assertEqual((latest.status_code, latest.json()["content"], latest.json()["revision"]), (200, "Latest", 2))
            reapplied = client.put("/api/planner/store/reviews/2026-08-24", json={"content": "My draft", "expectedRevision": latest.json()["revision"]})
            self.assertEqual((reapplied.status_code, reapplied.json()["content"], reapplied.json()["revision"]), (200, "My draft", 3))

    def test_portable_backup_preview_atomic_restore_exports_and_archive(self):
        routine = {
            "id": "backup-routine", "title": "Backed routine", "start": "08:00", "end": "09:00",
            "color": "green", "days": [1, 2, 3, 4, 5], "active": True,
        }
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            self.assertEqual(client.post("/api/planner/store/events", json={**self.payload("Backup event"), "done": True, "routineId": "backup-routine"}).status_code, 201)
            self.assertEqual(client.post("/api/planner/store/routines", json=routine).status_code, 201)
            self.assertEqual(client.put("/api/planner/store/reviews/2026-08-23", json={"content": "Backup review"}).status_code, 200)

            backup = client.get("/api/planner/store/backup")
            self.assertEqual(backup.status_code, 200)
            payload = backup.json()
            self.assertEqual((payload["format"], payload["version"], len(payload["events"]), len(payload["reviews"]), len(payload["routines"])), ("notion-clone-planner", 1, 1, 1, 1))
            self.assertEqual(len(payload["checksum"]), 64)

            # A changed backup must be rejected before any write is attempted.
            tampered = {**payload, "events": [{**payload["events"][0], "title": "Tampered"}]}
            self.assertEqual(client.post("/api/planner/store/import/preview", json={"payload": tampered}).status_code, 422)

            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Restore"}).status_code, 200)
            preview = client.post("/api/planner/store/import/preview", json={"payload": payload})
            self.assertEqual((preview.status_code, preview.json()["totals"]), (200, {"additions": 3, "duplicates": 0, "conflicts": 0}))
            committed = client.post("/api/planner/store/import", json={"payload": payload, "previewFingerprint": preview.json()["previewFingerprint"]})
            self.assertEqual(committed.status_code, 200)
            self.assertEqual(client.get("/api/planner/store/events").json()[0]["title"], "Backup event")
            self.assertEqual(client.get("/api/planner/store/reviews/2026-08-23").json()["content"], "Backup review")
            self.assertEqual(client.get("/api/planner/store/routines").json()[0]["id"], "backup-routine")

            duplicate = client.post("/api/planner/store/import/preview", json={"payload": payload})
            self.assertEqual(duplicate.json()["totals"], {"additions": 0, "duplicates": 3, "conflicts": 0})
            conflict_payload = {**payload, "events": [{**payload["events"][0], "title": "Different"}]}
            conflict_payload["checksum"] = planner_store._portable_digest(conflict_payload)
            conflict = client.post("/api/planner/store/import/preview", json={"payload": conflict_payload})
            self.assertEqual((conflict.status_code, conflict.json()["totals"]["conflicts"]), (200, 1))

            csv_export = client.get("/api/planner/store/export.csv?start_date=2026-08-23&end_date=2026-08-23")
            with patch.object(export_import, "_load_all_export_pages", return_value=[]):
                html_export = client.get("/api/export/planner-period?start_date=2026-08-23&end_date=2026-08-23")
            self.assertIn("Backup event", csv_export.text)
            self.assertIn("Backup review", html_export.text)

            event = client.get("/api/planner/store/events").json()[0]
            self.assertEqual(client.request("DELETE", "/api/planner/store/events/shared-event", json={"expectedRevision": event["revision"]}).status_code, 200)
            archive = client.get("/api/planner/store/archive?start_date=2026-08-23&end_date=2026-08-23")
            self.assertEqual((archive.status_code, archive.json()[0]["id"]), (200, "shared-event"))

    def test_range_query_and_cross_day_move_keep_one_event_revisioned(self):
        with self.client() as client:
            self.assertEqual(client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code, 200)
            self.assertEqual(client.post("/api/planner/store/events", json=self.payload("Week event")).status_code, 201)
            self.assertEqual(client.post("/api/planner/store/events", json={**self.payload("Outside"), "id": "outside", "date": "2026-09-01"}).status_code, 201)
            week = client.get("/api/planner/store/events?start_date=2026-08-17&end_date=2026-08-23")
            self.assertEqual(([event["id"] for event in week.json()], week.status_code), (["shared-event"], 200))
            moved = client.put("/api/planner/store/events/shared-event", json={**self.payload("Week event"), "date": "2026-08-24", "expectedRevision": 1})
            self.assertEqual((moved.status_code, moved.json()["revision"], moved.json()["date"]), (200, 2, "2026-08-24"))
            destination = client.get("/api/planner/store/events?start_date=2026-08-24&end_date=2026-08-24").json()
            self.assertEqual((len(destination), destination[0]["id"]), (1, "shared-event"))

    def test_activate_empty_requires_confirmation_preserves_sources_and_rejects_existing_data(self):
        legacy_page = self.vault / "legacy" / "content.nct"
        routine_file = self.vault / "_planner_routines.json"
        legacy_page.parent.mkdir()
        legacy_page.write_text('{"eventsByDate":{"2026-08-23":["legacy"]}}', encoding="utf-8")
        routine_file.write_text('{"routines":["legacy"]}', encoding="utf-8")
        source_hashes = {
            path: sha256(path.read_bytes()).hexdigest()
            for path in (legacy_page, routine_file)
        }

        with self.client() as client:
            self.assertEqual(
                client.post("/api/planner/store/activate-empty", json={"confirmation": "START_EMPTY"}).status_code,
                409,
            )
            self.assertEqual(
                client.put("/api/settings/planner-data", json={"plannerVaultName": "Life"}).status_code,
                200,
            )
            before = client.get("/api/planner/store/status").json()
            self.assertTrue(before["canStartFresh"])
            self.assertIsNone(before["activationMode"])
            self.assertEqual(before["writeMode"], "legacy")

            self.assertEqual(
                client.post("/api/planner/store/activate-empty", json={"confirmation": "WRONG"}).status_code,
                422,
            )
            activated = client.post("/api/planner/store/activate-empty", json={"confirmation": "START_EMPTY"})
            self.assertEqual(activated.status_code, 200)
            self.assertEqual(activated.json()["activationMode"], "fresh")
            self.assertFalse(activated.json()["canStartFresh"])
            self.assertEqual(activated.json()["writeMode"], "sqlite")
            self.assertEqual(
                client.post("/api/planner/store/activate-empty", json={"confirmation": "START_EMPTY"}).status_code,
                200,
            )

            self.assertEqual(client.post("/api/planner/store/events", json=self.payload()).status_code, 201)
            blocked = client.post("/api/planner/store/activate-empty", json={"confirmation": "START_EMPTY"})
            self.assertEqual(blocked.status_code, 409)
            self.assertEqual(client.get("/api/planner/store/events").json()[0]["title"], "Original")

        self.assertEqual(
            {path: sha256(path.read_bytes()).hexdigest() for path in source_hashes},
            source_hashes,
        )


if __name__ == "__main__":
    unittest.main()
