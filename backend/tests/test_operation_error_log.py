import tempfile
import unittest
from pathlib import Path

from backend import core


class OperationErrorLogTests(unittest.TestCase):
    def test_error_is_persisted_and_readable_after_memory_log_is_cleared(self):
        previous_vault = core._vault_state["dir"]
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                core._vault_state["dir"] = Path(temp_dir)
                core.record_operation_error(
                    "page_move", "target page folder already exists", pageId="page-1"
                )
                records = core.read_operation_errors()

                self.assertEqual(len(records), 1)
                self.assertEqual(records[0]["operation"], "page_move")
                self.assertEqual(records[0]["context"]["pageId"], "page-1")
                self.assertTrue(
                    (Path(temp_dir) / "_logs" / "operation_log.jsonl").exists()
                )
        finally:
            core._vault_state["dir"] = previous_vault

    def test_log_is_trimmed_when_it_exceeds_the_size_limit(self):
        previous_vault = core._vault_state["dir"]
        previous_limit = core.MAX_OPERATION_LOG_BYTES
        previous_lines = core.MAX_OPERATION_LOG_LINES
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                core._vault_state["dir"] = Path(temp_dir)
                core.MAX_OPERATION_LOG_BYTES = 1
                core.MAX_OPERATION_LOG_LINES = 2
                for number in range(4):
                    core.record_operation_error("test", "trim", number=number)
                records = core.read_operation_errors(limit=10)
                self.assertLessEqual(len(records), 2)
                self.assertEqual(records[-1]["context"]["number"], 3)
        finally:
            core.MAX_OPERATION_LOG_BYTES = previous_limit
            core.MAX_OPERATION_LOG_LINES = previous_lines
            core._vault_state["dir"] = previous_vault


if __name__ == "__main__":
    unittest.main()
