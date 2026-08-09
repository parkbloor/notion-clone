import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.routers import vault_preferences


class VaultPreferencesTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault_dir = Path(self.temp_dir.name)
        self.vault_patch = patch.object(
            vault_preferences,
            "get_vault_dir",
            return_value=self.vault_dir,
        )
        self.vault_patch.start()

    def tearDown(self):
        self.vault_patch.stop()
        self.temp_dir.cleanup()

    def test_missing_or_invalid_file_uses_visible_defaults(self):
        self.assertEqual(
            vault_preferences.get_vault_preferences(),
            {
                "planner": {
                    "todayShortcut": True,
                    "planMenu": True,
                    "reviews": True,
                    "calendar": True,
                    "timeline": True,
                    "routines": True,
                    "slashPlannerBlocks": True,
                }
            },
        )

        (self.vault_dir / vault_preferences.PREFERENCES_FILE).write_text(
            "not-json",
            encoding="utf-8",
        )
        self.assertTrue(
            vault_preferences.get_vault_preferences()["planner"]["planMenu"]
        )

    def test_update_is_saved_in_current_vault_and_preserves_other_values(self):
        saved = vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(
                    todayShortcut=False,
                    reviews=False,
                )
            )
        )

        self.assertEqual(
            saved["planner"],
            {
                "todayShortcut": False,
                "planMenu": True,
                "reviews": False,
                "calendar": True,
                "timeline": True,
                "routines": True,
                "slashPlannerBlocks": True,
            },
        )
        persisted = json.loads(
            (self.vault_dir / vault_preferences.PREFERENCES_FILE).read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(persisted, saved)


if __name__ == "__main__":
    unittest.main()
