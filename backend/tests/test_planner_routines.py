import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend.routers import planner


class PlannerRoutineValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault_dir = Path(self.temp_dir.name)
        self.vault_patch = patch.object(planner, "get_vault_dir", return_value=self.vault_dir)
        self.assert_patch = patch.object(planner, "assert_inside_vault")
        self.vault_patch.start()
        self.assert_patch.start()

    def tearDown(self):
        self.assert_patch.stop()
        self.vault_patch.stop()
        self.temp_dir.cleanup()

    def test_valid_routine_is_persisted(self):
        body = [{
            "id": "morning",
            "title": "Morning routine",
            "start": "09:00",
            "end": "10:30",
            "color": "blue",
            "days": [1, 2, 3, 4, 5],
        }]

        result = asyncio.run(planner.save_routines(body))

        self.assertEqual(result["status"], "ok")
        saved = json.loads((self.vault_dir / planner.ROUTINES_FILE).read_text(encoding="utf-8"))
        self.assertEqual(saved, body)

    def test_invalid_time_or_weekday_is_rejected(self):
        invalid = [{
            "id": "broken",
            "title": "Broken routine",
            "start": "25:00",
            "end": "10:00",
            "color": "blue",
            "days": [7],
        }]

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(planner.save_routines(invalid))

        self.assertEqual(raised.exception.status_code, 422)
        self.assertFalse((self.vault_dir / planner.ROUTINES_FILE).exists())

    def test_invalid_update_does_not_replace_existing_routines(self):
        path = self.vault_dir / planner.ROUTINES_FILE
        existing = [{
            "id": "existing",
            "title": "Existing routine",
            "start": "09:00",
            "end": "10:00",
            "color": "blue",
            "days": [1],
        }]
        path.write_text(json.dumps(existing), encoding="utf-8")

        with self.assertRaises(HTTPException):
            asyncio.run(planner.save_routines([{
                "id": "bad",
                "title": "Bad routine",
                "start": "24:00",
                "end": "10:00",
                "color": "blue",
                "days": [1],
            }]))

        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), existing)


if __name__ == "__main__":
    unittest.main()
