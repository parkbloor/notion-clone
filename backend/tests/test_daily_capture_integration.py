import json
import unittest
from unittest.mock import patch

from backend.daily_capture import (
    daily_capture_to_html,
    daily_capture_to_markdown,
    daily_capture_to_plain_text,
)
from backend.routers.export_import import _blocks_to_html, _blocks_to_markdown
from backend.routers.search import block_plain_text, search_pages


class DailyCaptureIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.content = json.dumps({
            "version": 1,
            "date": "2026-08-22",
            "body": "- [ ] test #idea\n**important** <script>alert(1)</script>",
        })

    def test_export_formats_show_record_body_not_storage_json(self):
        markdown = daily_capture_to_markdown(self.content)
        html = _blocks_to_html([{"type": "dailycapture", "content": self.content}])

        self.assertIn("2026-08-22", markdown)
        self.assertIn("- [ ] test #idea", markdown)
        self.assertNotIn('"version": 1', markdown)
        self.assertIn('type="checkbox"', html)
        self.assertIn("test", html)
        self.assertNotIn('"version": 1', html)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_search_text_uses_date_and_body(self):
        block = {"type": "dailycapture", "content": self.content}
        plain = block_plain_text(block)
        self.assertEqual(plain, daily_capture_to_plain_text(self.content))
        self.assertIn("2026-08-22", plain)
        self.assertIn("test #idea", plain)
        self.assertNotIn('"body"', plain)

    def test_malformed_content_is_preserved_without_crashing(self):
        self.assertIn("legacy text", daily_capture_to_html("legacy text"))

    def test_search_finds_daily_capture_nested_more_than_one_level(self):
        page = {
            "title": "월간 기록",
            "icon": "📝",
            "blocks": [{
                "id": "outer",
                "type": "toggle",
                "content": '{"header":"8월"}',
                "children": [{
                    "id": "inner",
                    "type": "toggle",
                    "content": '{"header":"넷째 주"}',
                    "children": [{
                        "id": "capture",
                        "type": "dailycapture",
                        "content": self.content.replace("test", "needle"),
                    }],
                }],
            }],
        }

        with patch("backend.routers.search.load_index", return_value={"pageOrder": ["page-1"]}), \
             patch("backend.routers.search.load_page", return_value=page):
            results = search_pages("needle")["results"]

        self.assertEqual([result["blockId"] for result in results], ["capture"])
        self.assertIn("needle #idea", results[0]["snippet"])

    def test_markdown_export_includes_deep_daily_capture_without_storage_json(self):
        blocks = [{
            "id": "outer",
            "type": "toggle",
            "content": '{"header":"<strong>8월</strong>"}',
            "children": [{
                "id": "inner",
                "type": "toggle",
                "content": '{"header":"넷째 주"}',
                "children": [{
                    "id": "capture",
                    "type": "dailycapture",
                    "content": self.content,
                }],
            }],
        }]

        markdown = _blocks_to_markdown(blocks)

        self.assertIn("#### 8월", markdown)
        self.assertIn("#### 넷째 주", markdown)
        self.assertIn("2026-08-22", markdown)
        self.assertIn("- [ ] test #idea", markdown)
        self.assertNotIn('"header"', markdown)
        self.assertNotIn('"version"', markdown)


if __name__ == "__main__":
    unittest.main()
