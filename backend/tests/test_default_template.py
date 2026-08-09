import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.routers import templates


class DefaultTemplateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.templates_dir = Path(self.temp_dir.name)
        self.template_id = "11111111-1111-4111-8111-111111111111"
        (self.templates_dir / f"{self.template_id}.json").write_text(
            json.dumps({
                "id": self.template_id,
                "name": "기록 템플릿",
                "icon": "📌",
                "description": "",
                "content": ":::record",
            }, ensure_ascii=False),
            encoding="utf-8",
        )
        self.dir_patch = patch.object(templates, "get_templates_dir", return_value=self.templates_dir)
        self.dir_patch.start()

    def tearDown(self):
        self.dir_patch.stop()
        self.temp_dir.cleanup()

    def test_default_template_is_saved_and_cleared_per_vault_directory(self):
        saved = templates.set_default_template(
            templates.DefaultTemplateBody(templateId=self.template_id)
        )
        self.assertEqual(saved, {"templateId": self.template_id})
        self.assertEqual(templates.get_default_template(), {"templateId": self.template_id})

        cleared = templates.set_default_template(templates.DefaultTemplateBody(templateId=None))
        self.assertEqual(cleared, {"templateId": None})
        self.assertEqual(templates.get_default_template(), {"templateId": None})

    def test_deleting_active_template_clears_default(self):
        templates.set_default_template(templates.DefaultTemplateBody(templateId=self.template_id))
        templates.delete_template(self.template_id)

        self.assertEqual(templates.get_default_template(), {"templateId": None})


if __name__ == "__main__":
    unittest.main()
