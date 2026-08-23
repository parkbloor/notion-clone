import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from backend import core
from backend.routers import system


class DiarySettingsTests(unittest.TestCase):
    def setUp(self):
        self.previous_root = core._vault_state["root"]
        self.previous_dir = core._vault_state["dir"]
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.current = self.root / "Current"
        self.current.mkdir()
        (self.root / "Diary").mkdir()
        (self.root / "Work").mkdir()
        core._vault_state["root"] = self.root
        core._vault_state["dir"] = self.current

    def tearDown(self):
        core._vault_state["root"] = self.previous_root
        core._vault_state["dir"] = self.previous_dir
        self.temp_dir.cleanup()

    def test_diary_vault_can_be_designated_and_cleared(self):
        saved = system.put_diary_settings(system.DiarySettingsBody(diaryVaultName="Diary"))

        self.assertEqual(saved["diaryVaultName"], "Diary")
        self.assertEqual(saved["status"], "ready")
        self.assertEqual(set(saved["availableVaults"]), {"Current", "Diary", "Work"})

        config_path = self.root / system.DIARY_CONFIG_FILENAME
        self.assertEqual(json.loads(config_path.read_text(encoding="utf-8"))["diaryVaultName"], "Diary")

        cleared = system.put_diary_settings(system.DiarySettingsBody(diaryVaultName=None))
        self.assertIsNone(cleared["diaryVaultName"])
        self.assertEqual(cleared["status"], "unconfigured")

    def test_missing_vault_is_rejected_without_replacing_current_setting(self):
        system.put_diary_settings(system.DiarySettingsBody(diaryVaultName="Diary"))

        with self.assertRaises(HTTPException) as raised:
            system.put_diary_settings(system.DiarySettingsBody(diaryVaultName="Missing"))

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(system.get_diary_settings()["diaryVaultName"], "Diary")

    def test_renaming_designated_vault_updates_diary_reference(self):
        system.put_diary_settings(system.DiarySettingsBody(diaryVaultName="Diary"))

        system.rename_vault("Diary", system.RenameVaultBody(new_name="Journal"))

        loaded = system.get_diary_settings()
        self.assertEqual(loaded["diaryVaultName"], "Journal")
        self.assertEqual(loaded["status"], "ready")

    def test_corrupt_config_is_not_overwritten_while_reading(self):
        config_path = self.root / system.DIARY_CONFIG_FILENAME
        config_path.write_text("{broken", encoding="utf-8")

        loaded = system.get_diary_settings()

        self.assertIsNone(loaded["diaryVaultName"])
        self.assertEqual(loaded["status"], "unconfigured")
        self.assertEqual(config_path.read_text(encoding="utf-8"), "{broken")


if __name__ == "__main__":
    unittest.main()
