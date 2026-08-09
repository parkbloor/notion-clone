import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import core
from backend.routers import pages


class PageDeleteTests(unittest.TestCase):
    def test_delete_page_moves_category_page_to_trash_and_updates_index(self):
        page_id = "11111111-1111-4111-8111-111111111111"
        category_id = "22222222-2222-4222-8222-222222222222"
        folder_name = "memo_11111111"
        index = {
            "categories": [
                {
                    "id": category_id,
                    "folderName": "notes",
                    "parentId": None,
                }
            ],
            "pageOrder": [page_id],
            "folderMap": {page_id: folder_name},
            "categoryMap": {page_id: category_id},
            "pages": [{"id": page_id}],
            "currentPageId": page_id,
        }
        page_data = {"id": page_id, "title": "memo", "icon": "📄", "blocks": []}

        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault = Path(temp_dir)
                core._vault_state["dir"] = vault
                page_dir = vault / "notes" / folder_name
                page_dir.mkdir(parents=True)
                (page_dir / "content.nct").write_text(
                    json.dumps(page_data, ensure_ascii=False), encoding="utf-8"
                )

                with patch("backend.routers.pages.load_index", return_value=index), patch(
                    "backend.routers.pages.save_index"
                ) as save_index:
                    result = pages.delete_page(page_id)

                self.assertEqual(result, {"ok": True})
                self.assertFalse(page_dir.exists())
                self.assertTrue((vault / "_vault_trash" / folder_name / "content.nct").exists())
                self.assertEqual(index["pageOrder"], [])
                self.assertNotIn(page_id, index["folderMap"])
                self.assertNotIn(page_id, index["categoryMap"])
                self.assertIsNone(index["currentPageId"])
                save_index.assert_called_once_with(index)

                trash_entry = core.load_trash_index()[0]
                self.assertEqual(trash_entry["id"], page_id)
                self.assertEqual(trash_entry["originalCategoryId"], category_id)
                self.assertEqual(trash_entry["originalCategoryFolderName"], "notes")
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
