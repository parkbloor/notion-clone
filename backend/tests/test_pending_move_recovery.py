import json
import tempfile
import unittest
from pathlib import Path

from backend import core


class PendingMoveRecoveryTests(unittest.TestCase):
    def test_uncommitted_page_move_is_rolled_back_with_image_urls(self):
        page_id = "11111111-1111-4111-8111-111111111111"
        old_prefix = "http://127.0.0.1:8000/static/old/"
        new_prefix = "http://127.0.0.1:8000/static/new/"
        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault = Path(temp_dir)
                core._vault_state["dir"] = vault
                core.save_index({"pageOrder": [page_id], "folderMap": {page_id: "memo"}, "categoryMap": {}})

                source = vault / "old" / "memo"
                target = vault / "new" / "memo"
                page = {
                    "id": page_id,
                    "title": "memo",
                    "blocks": [{"id": "block", "type": "image", "content": json.dumps({"src": new_prefix + "memo/images/a.png"}), "createdAt": "x", "updatedAt": "x"}],
                    "createdAt": "x",
                    "updatedAt": "x",
                }
                core.save_page_to_disk(page, target)
                core.begin_move_journal(
                    "page_move", source, target,
                    pageId=page_id, newCategoryId="22222222-2222-4222-8222-222222222222",
                    oldPrefix=old_prefix, newPrefix=new_prefix,
                )

                result = core.recover_pending_moves()

                self.assertEqual(result, {"recovered": 1, "unresolved": 0})
                self.assertTrue((source / "content.nct").exists())
                self.assertFalse(target.exists())
                restored = json.loads((source / "content.nct").read_text(encoding="utf-8"))
                self.assertIn(old_prefix, restored["blocks"][0]["content"])
                self.assertFalse(core._read_pending_moves())
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
