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
        self.get_vault_dir = self.vault_patch.start()

    def tearDown(self):
        self.vault_patch.stop()
        self.temp_dir.cleanup()

    def test_missing_or_invalid_file_uses_visible_defaults(self):
        self.assertEqual(
            vault_preferences.get_vault_preferences(),
            {
                "planner": {
                    "mode": "off",
                    "homePageId": None,
                    "dailyNoteTemplate": "standard",
                    "dailyCustomTemplateId": None,
                    "todayShortcut": True,
                    "planMenu": True,
                    "reviews": True,
                    "calendar": True,
                    "timeline": True,
                    "routines": True,
                    "slashPlannerBlocks": True,
                    "captureDestinations": [],
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
                    mode="daily",
                    homePageId="planner-home",
                    dailyNoteTemplate="postit",
                    dailyCustomTemplateId="daily-template-1",
                    todayShortcut=False,
                    reviews=False,
                    captureDestinations=[
                        vault_preferences.CaptureDestination(
                            id="stock-ideas",
                            pageId="stock-ideas-page",
                            kind="note",
                        )
                    ],
                )
            )
        )

        self.assertEqual(
            saved["planner"],
            {
                "mode": "daily",
                "homePageId": "planner-home",
                "dailyNoteTemplate": "postit",
                "dailyCustomTemplateId": "daily-template-1",
                "todayShortcut": False,
                "planMenu": True,
                "reviews": False,
                "calendar": True,
                "timeline": True,
                "routines": True,
                "slashPlannerBlocks": True,
                "captureDestinations": [
                    {"id": "stock-ideas", "pageId": "stock-ideas-page", "kind": "note"}
                ],
            },
        )
        persisted = json.loads(
            (self.vault_dir / vault_preferences.PREFERENCES_FILE).read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(persisted, saved)

        # 명시적인 null 요청은 기존 홈 메모 연결만 해제해야 한다.
        cleared = vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(homePageId=None)
            )
        )
        self.assertEqual(cleared["planner"]["mode"], "daily")
        self.assertIsNone(cleared["planner"]["homePageId"])
        self.assertEqual(cleared["planner"]["dailyNoteTemplate"], "postit")
        self.assertEqual(cleared["planner"]["dailyCustomTemplateId"], "daily-template-1")

        # 빈 문자열은 전역 기본값으로 되돌아가는 값이 아니라 이 볼트의 명시적인 '사용 안 함'이다.
        without_custom = vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(dailyCustomTemplateId="")
            )
        )
        self.assertEqual(without_custom["planner"]["dailyCustomTemplateId"], "")

        cleared_destinations = vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(captureDestinations=[])
            )
        )
        self.assertEqual(cleared_destinations["planner"]["captureDestinations"], [])

    def test_capture_destinations_are_normalized_without_touching_other_preferences(self):
        (self.vault_dir / vault_preferences.PREFERENCES_FILE).write_text(
            json.dumps({
                "planner": {
                    "mode": "daily",
                    "captureDestinations": [
                        {"id": " task ", "pageId": " task-page ", "kind": "task"},
                        {"id": "same-id", "pageId": "notes-page", "kind": "note"},
                        {"id": "same-id", "pageId": "other-page", "kind": "note"},
                        {"id": "other", "pageId": "notes-page", "kind": "note"},
                        {"id": "invalid", "pageId": "bad", "kind": "unknown"},
                    ],
                }
            }),
            encoding="utf-8",
        )

        preferences = vault_preferences.get_vault_preferences()["planner"]
        self.assertEqual(preferences["mode"], "daily")
        self.assertEqual(
            preferences["captureDestinations"],
            [
                {"id": "task", "pageId": "task-page", "kind": "task"},
                {"id": "same-id", "pageId": "notes-page", "kind": "note"},
            ],
        )

    def test_diary_template_is_preserved_for_the_current_vault(self):
        saved = vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(
                    dailyNoteTemplate="diary"
                )
            )
        )

        self.assertEqual(saved["planner"]["dailyNoteTemplate"], "diary")
        self.assertEqual(
            vault_preferences.get_vault_preferences()["planner"]["dailyNoteTemplate"],
            "diary",
        )

    def test_capture_destinations_do_not_cross_vaults(self):
        vault_preferences.update_vault_preferences(
            vault_preferences.VaultPreferencesUpdate(
                planner=vault_preferences.PlannerFeatureUpdate(
                    captureDestinations=[
                        vault_preferences.CaptureDestination(
                            id="current-only",
                            pageId="current-page",
                            kind="note",
                        )
                    ]
                )
            )
        )

        other_vault = tempfile.TemporaryDirectory()
        try:
            self.get_vault_dir.return_value = Path(other_vault.name)
            self.assertEqual(
                vault_preferences.get_vault_preferences()["planner"]["captureDestinations"],
                [],
            )
        finally:
            other_vault.cleanup()


if __name__ == "__main__":
    unittest.main()
