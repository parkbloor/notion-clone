import tempfile
import unittest
from pathlib import Path

from backend import core


class VaultIntegrityTests(unittest.TestCase):
    def test_missing_indexed_page_is_reported_and_persistently_logged(self):
        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault = Path(temp_dir)
                core._vault_state["dir"] = vault
                page_id = "11111111-1111-4111-8111-111111111111"
                core.save_index({
                    "pageOrder": [page_id],
                    "folderMap": {page_id: "missing-page"},
                    "categoryMap": {},
                    "categories": [],
                    "categoryOrder": [],
                })

                result = core.inspect_vault_integrity(log_errors=True)

                self.assertEqual(result["checkedPages"], 0)
                self.assertEqual(result["issues"][0]["kind"], "page content file missing")
                self.assertEqual(core.read_operation_errors()[0]["operation"], "vault_integrity")
        finally:
            core._vault_state["dir"] = previous_vault

    def test_missing_image_in_history_is_reported_by_full_image_check(self):
        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                vault = Path(temp_dir)
                core._vault_state["dir"] = vault
                core.save_index({"pageOrder": [], "folderMap": {}, "categoryMap": {}, "categories": []})
                history = vault / "memo" / "_history"
                history.mkdir(parents=True)
                (history / "2026-07-30T00-00-00.nct").write_text(
                    '{"blocks":[{"content":"http://127.0.0.1:8000/static/memo/images/missing.png"}]}',
                    encoding="utf-8",
                )

                result = core.inspect_vault_integrity(include_images=True, log_errors=False)

                self.assertEqual(result["checkedImages"], 1)
                self.assertEqual(result["issues"][0]["kind"], "archived image asset missing")
        finally:
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
