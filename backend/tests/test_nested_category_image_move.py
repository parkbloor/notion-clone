import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import core
from backend.routers import pages
from backend.core import MoveCategoryBody


class NestedCategoryImageMoveTests(unittest.TestCase):
    def test_move_from_nested_category_to_uncategorized_root(self):
        """미분류 이동은 페이지 폴더와 이미지 URL을 vault 루트로 옮겨야 한다."""
        page_id = "11111111-1111-4111-8111-111111111111"
        page_folder = "desk-items_11111111"
        category_id = "22222222-2222-4222-8222-222222222222"
        parent_id = "33333333-3333-4333-8333-333333333333"
        old_url = (
            "http://127.0.0.1:8000/static/work_log/2026년/"
            f"{page_folder}/images/example.png"
        )
        new_url = f"http://127.0.0.1:8000/static/{page_folder}/images/example.png"
        index = {
            "folderMap": {page_id: page_folder},
            "categoryMap": {page_id: category_id},
            "categories": [
                {"id": parent_id, "folderName": "work_log", "parentId": None},
                {"id": category_id, "folderName": "2026년", "parentId": parent_id},
            ],
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
                source_dir = vault_dir / "work_log" / "2026년" / page_folder
                source_dir.mkdir(parents=True)
                (source_dir / "content.nct").write_text(
                    json.dumps(page_data, ensure_ascii=False), encoding="utf-8"
                )

                with patch("backend.routers.pages.load_index", return_value=index), patch(
                    "backend.routers.pages.save_index"
                ):
                    result = pages.move_page_to_category(
                        page_id, MoveCategoryBody(categoryId=None)
                    )

                target_file = vault_dir / page_folder / "content.nct"
                self.assertTrue(result["moved"])
                self.assertFalse(source_dir.exists())
                self.assertTrue(target_file.exists())
                self.assertNotIn(page_id, index["categoryMap"])
                saved = json.loads(target_file.read_text(encoding="utf-8"))
                self.assertIn(new_url, saved["blocks"][0]["content"])
                self.assertNotIn(old_url, saved["blocks"][0]["content"])
        finally:
            core._vault_state["dir"] = previous_vault

    def test_move_uses_full_nested_category_path_for_files_and_image_urls(self):
        """같은 이름의 하위/최상위 카테고리를 혼동하면 안 된다."""
        page_id = "11111111-1111-4111-8111-111111111111"
        page_folder = "desk-items_11111111"
        old_url = (
            "http://127.0.0.1:8000/static/work_log/2026년/"
            f"{page_folder}/images/example.png"
        )
        new_url = (
            "http://127.0.0.1:8000/static/2026년/"
            f"{page_folder}/images/example.png"
        )
        index = {
            "folderMap": {page_id: page_folder},
            "categoryMap": {page_id: "22222222-2222-4222-8222-222222222222"},
            "categories": [
                {"id": "33333333-3333-4333-8333-333333333333", "folderName": "work_log", "parentId": None},
                {"id": "22222222-2222-4222-8222-222222222222", "folderName": "2026년", "parentId": "33333333-3333-4333-8333-333333333333"},
                {"id": "44444444-4444-4444-8444-444444444444", "folderName": "2026년", "parentId": None},
            ],
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
                source_dir = vault_dir / "work_log" / "2026년" / page_folder
                source_dir.mkdir(parents=True)
                (source_dir / "content.nct").write_text(
                    json.dumps(page_data, ensure_ascii=False), encoding="utf-8"
                )

                with patch("backend.routers.pages.load_index", return_value=index), patch(
                    "backend.routers.pages.save_index"
                ):
                    result = pages.move_page_to_category(
                        page_id, MoveCategoryBody(categoryId="44444444-4444-4444-8444-444444444444")
                    )

                target_file = vault_dir / "2026년" / page_folder / "content.nct"
                self.assertTrue(result["moved"])
                self.assertFalse(source_dir.exists())
                self.assertTrue(target_file.exists())
                saved = json.loads(target_file.read_text(encoding="utf-8"))
                self.assertIn(new_url, saved["blocks"][0]["content"])
                self.assertNotIn(old_url, saved["blocks"][0]["content"])
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
