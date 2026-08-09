import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import core
from backend.core import MoveFolderBody
from backend.routers import categories


class CategoryMoveFilesystemTests(unittest.TestCase):
    def test_move_category_moves_page_folder_and_rewrites_image_url(self):
        category_id = "22222222-2222-4222-8222-222222222222"
        parent_id = "33333333-3333-4333-8333-333333333333"
        page_id = "11111111-1111-4111-8111-111111111111"
        page_folder = "desk-items_11111111"
        old_url = f"http://127.0.0.1:8000/static/2026년/{page_folder}/images/example.png"
        new_url = f"http://127.0.0.1:8000/static/work_log/2026년/{page_folder}/images/example.png"
        index = {
            "categories": [
                {"id": category_id, "folderName": "2026년", "parentId": None},
                {"id": parent_id, "folderName": "work_log", "parentId": None},
            ],
            "categoryOrder": [category_id, parent_id],
            "categoryChildOrder": {},
            "folderMap": {page_id: page_folder},
            "categoryMap": {page_id: category_id},
        }
        page_data = {
            "id": page_id,
            "title": "desk items",
            "blocks": [{"type": "image", "content": json.dumps({"images": [{"src": old_url}]}, ensure_ascii=False)}],
        }

        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault_dir = Path(temp_dir)
                core._vault_state["dir"] = vault_dir
                source_dir = vault_dir / "2026년" / page_folder
                source_dir.mkdir(parents=True)
                (source_dir / "content.nct").write_text(
                    json.dumps(page_data, ensure_ascii=False), encoding="utf-8"
                )

                with patch("backend.routers.categories.load_index", return_value=index), patch(
                    "backend.routers.categories.save_index"
                ):
                    categories.move_category(category_id, MoveFolderBody(parentId=parent_id))

                target_file = vault_dir / "work_log" / "2026년" / page_folder / "content.nct"
                self.assertFalse((vault_dir / "2026년").exists())
                self.assertTrue(target_file.exists())
                self.assertEqual(index["categories"][0]["parentId"], parent_id)
                self.assertIn(new_url, target_file.read_text(encoding="utf-8"))
                self.assertNotIn(old_url, target_file.read_text(encoding="utf-8"))
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
