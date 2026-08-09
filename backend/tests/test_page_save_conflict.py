import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import core
from backend.core import PageModel
from backend.routers import pages


class PageSaveConflictTests(unittest.TestCase):
    def test_stale_revision_is_rejected_before_writing_page_content(self):
        page_id = "11111111-1111-4111-8111-111111111111"
        page = {
            "id": page_id,
            "title": "memo",
            "icon": "📄",
            "blocks": [],
            "createdAt": "2026-07-30T00:00:00.000Z",
            "updatedAt": "2026-07-30T00:00:00.000Z",
            "revision": 2,
        }
        folder = core.make_folder_name(page["title"], page["createdAt"], page_id)
        index = {"folderMap": {page_id: folder}, "pageOrder": [page_id]}

        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault = Path(temp_dir)
                core._vault_state["dir"] = vault
                page_dir = vault / folder
                core.save_page_to_disk(page, page_dir)

                stale = {**page, "title": "stale title", "revision": 1}
                with patch("backend.routers.pages.load_index", return_value=index), patch(
                    "backend.routers.pages.save_index"
                ):
                    with self.assertRaises(HTTPException) as raised:
                        pages.save_page(page_id, PageModel(**stale), expectedRevision=1)

                self.assertEqual(raised.exception.status_code, 409)
                saved = core.load_page(page_id, index)
                self.assertEqual(saved["title"], "memo")
                self.assertEqual(saved["revision"], 2)
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
