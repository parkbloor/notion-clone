import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import core
from backend.routers import capture_transfer


SOURCE_PAGE_ID = "11111111-1111-4111-8111-111111111111"
SOURCE_BLOCK_ID = "22222222-2222-4222-8222-222222222222"
TARGET_PAGE_ID = "33333333-3333-4333-8333-333333333333"


def page(page_id: str, title: str, blocks: list[dict], revision: int = 0) -> dict:
    return {
        "id": page_id,
        "title": title,
        "icon": "📝",
        "blocks": blocks,
        "createdAt": "2026-08-23T00:00:00.000Z",
        "updatedAt": "2026-08-23T00:00:00.000Z",
        "revision": revision,
    }


class CaptureTransferTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault = Path(self.temp_dir.name)
        self.previous_vault = core._vault_state["dir"]
        self.previous_root = core._vault_state["root"]
        core._vault_state["dir"] = self.vault
        core._vault_state["root"] = self.vault
        self.index = {
            "folderMap": {
                SOURCE_PAGE_ID: "source",
                TARGET_PAGE_ID: "target",
            },
            "pageOrder": [SOURCE_PAGE_ID, TARGET_PAGE_ID],
        }
        source_capture = {
            "id": SOURCE_BLOCK_ID,
            "type": "dailycapture",
            "content": json.dumps({
                "version": 2,
                "date": "2026-08-23",
                "entries": [
                    {"id": "entry-1", "text": "- [ ] 스톡 이미지 저장 기준 정리"},
                    {"id": "entry-2", "text": "- [ ] 같은 날 두 번째 아이디어"},
                    {"id": "group-parent", "text": "- 스톡이미지"},
                    {"id": "group-child-1", "text": "1. 종이 텍스처 조금 약하게"},
                    {"id": "group-child-2", "text": "  2. 데포르메 강화"},
                    {"id": "group-child-3", "text": "\t3. 선의 거침 정돈하기)"},
                    {"id": "independent", "text": "들여쓰기 없는 독립 문장"},
                ],
            }, ensure_ascii=False),
            "children": [],
            "createdAt": "2026-08-23T00:00:00.000Z",
            "updatedAt": "2026-08-23T00:00:00.000Z",
        }
        core.save_page_to_disk(page(SOURCE_PAGE_ID, "8월 기록", [source_capture]), self.vault / "source")
        core.save_page_to_disk(page(TARGET_PAGE_ID, "스톡 이미지 아이디어", []), self.vault / "target")
        self.index_patch = patch("backend.routers.capture_transfer.load_index", return_value=self.index)
        self.index_patch.start()

    def tearDown(self):
        self.index_patch.stop()
        core._vault_state["dir"] = self.previous_vault
        core._vault_state["root"] = self.previous_root
        self.temp_dir.cleanup()

    def request(self, source_revision: int = 0, destination_revision: int = 0, source_entry_id: str = "entry-1", kind: str = "task"):
        return capture_transfer.CaptureTransferRequest(
            sourcePageId=SOURCE_PAGE_ID,
            sourceBlockId=SOURCE_BLOCK_ID,
            sourceEntryId=source_entry_id,
            destinationPageId=TARGET_PAGE_ID,
            sourceRevision=source_revision,
            destinationRevision=destination_revision,
            kind=kind,
        )

    def test_transfer_appends_once_and_marks_source_after_target_save(self):
        with patch("backend.routers.capture_transfer._classification_date", return_value="2026-08-24"):
            first = capture_transfer.transfer_capture_entry(self.request())
        self.assertFalse(first["alreadyTransferred"])
        target = first["destinationPage"]
        self.assertEqual(target["revision"], 1)
        self.assertEqual(len(target["blocks"]), 2)
        self.assertEqual(target["blocks"][0]["type"], "heading3")
        self.assertIn("2026-08-24 분류", target["blocks"][0]["content"])
        self.assertEqual(target["blocks"][1]["type"], "taskList")
        self.assertIn("스톡 이미지 저장 기준 정리", target["blocks"][1]["content"])
        self.assertEqual(target["blocks"][1]["captureSource"]["sourcePageId"], SOURCE_PAGE_ID)
        self.assertIn("data-footnote", target["blocks"][1]["content"])
        self.assertIn("작성 2026-08-23", target["blocks"][1]["content"])
        self.assertIn("8월 기록", target["blocks"][1]["content"])

        source_data = json.loads(first["sourcePage"]["blocks"][0]["content"])
        transfer = source_data["entries"][0]["transfer"]
        self.assertEqual(transfer["destinationPageId"], TARGET_PAGE_ID)
        self.assertEqual(transfer["destinationBlockId"], target["blocks"][1]["id"])
        self.assertEqual(transfer["classifiedDate"], "2026-08-24")

        repeated = capture_transfer.transfer_capture_entry(self.request(1, 1))
        self.assertTrue(repeated["alreadyTransferred"])
        self.assertEqual(len(repeated["destinationPage"]["blocks"]), 2)
        self.assertEqual(repeated["sourcePage"]["revision"], 1)
        self.assertEqual(repeated["destinationPage"]["revision"], 1)

    def test_same_classification_date_reuses_one_group(self):
        with patch("backend.routers.capture_transfer._classification_date", return_value="2026-08-24"):
            first = capture_transfer.transfer_capture_entry(self.request())
            second = capture_transfer.transfer_capture_entry(self.request(1, 1, "entry-2"))

        self.assertFalse(first["alreadyTransferred"])
        self.assertFalse(second["alreadyTransferred"])
        target = second["destinationPage"]
        self.assertEqual(target["revision"], 2)
        self.assertEqual(len(target["blocks"]), 3)
        self.assertEqual(sum(block.get("captureTransferGroup") is True for block in target["blocks"]), 1)
        self.assertEqual([block["type"] for block in target["blocks"]], [
            "heading3", "taskList", "taskList",
        ])
        self.assertIn("같은 날 두 번째 아이디어", target["blocks"][2]["content"])

    def test_indented_lines_transfer_as_one_destination_block(self):
        with patch("backend.routers.capture_transfer._classification_date", return_value="2026-08-24"):
            result = capture_transfer.transfer_capture_entry(
                self.request(source_entry_id="group-parent", kind="note")
            )

        target = result["destinationPage"]
        self.assertEqual(len(target["blocks"]), 2)
        grouped_block = target["blocks"][1]
        self.assertEqual(grouped_block["type"], "paragraph")
        self.assertIn("스톡이미지<br />1. 종이 텍스처 조금 약하게", grouped_block["content"])
        self.assertIn("<br />2. 데포르메 강화", grouped_block["content"])
        self.assertIn("<br />3. 선의 거침 정돈하기)", grouped_block["content"])
        self.assertEqual(grouped_block["captureSource"]["sourceEntryIds"], [
            "group-parent", "group-child-1", "group-child-2", "group-child-3",
        ])

        source_entries = json.loads(result["sourcePage"]["blocks"][0]["content"])["entries"]
        transfers = [source_entries[index].get("transfer") for index in (2, 3, 4, 5)]
        self.assertTrue(all(transfer for transfer in transfers))
        self.assertEqual(len({transfer["destinationBlockId"] for transfer in transfers}), 1)
        self.assertNotIn("transfer", source_entries[6])

        repeated = capture_transfer.transfer_capture_entry(
            self.request(1, 1, "group-child-1", "note")
        )
        self.assertTrue(repeated["alreadyTransferred"])
        self.assertEqual(len(repeated["destinationPage"]["blocks"]), 2)

    def test_indented_line_after_blank_is_its_own_transferable_entry(self):
        entries = [
            {"id": "blank", "text": ""},
            {"id": "orphan-child", "text": "  빈 줄 뒤의 독립 항목"},
        ]

        group = capture_transfer._capture_entry_group(entries, "orphan-child")
        lines, checked = capture_transfer._entry_lines(group)

        self.assertEqual([entry["id"] for entry in group], ["orphan-child"])
        self.assertEqual(lines, ["빈 줄 뒤의 독립 항목"])
        self.assertFalse(checked)

    def test_pending_child_below_transferred_parent_is_classified_independently(self):
        entries = [
            {"id": "parent", "text": "- 이미 분류된 부모", "transfer": {"transferId": "old-transfer"}},
            {"id": "pending-child", "text": "  새로 추가한 하위 줄"},
        ]

        group = capture_transfer._capture_entry_group(entries, "pending-child")
        lines, checked = capture_transfer._entry_lines(group)

        self.assertEqual([entry["id"] for entry in group], ["pending-child"])
        self.assertEqual(lines, ["새로 추가한 하위 줄"])
        self.assertFalse(checked)

    def test_stale_revision_does_not_change_either_page(self):
        with self.assertRaises(HTTPException) as raised:
            capture_transfer.transfer_capture_entry(self.request(source_revision=1))
        self.assertEqual(raised.exception.status_code, 409)

        source = core.load_page(SOURCE_PAGE_ID, self.index)
        target = core.load_page(TARGET_PAGE_ID, self.index)
        self.assertEqual(source["revision"], 0)
        self.assertNotIn("transfer", json.loads(source["blocks"][0]["content"])["entries"][0])
        self.assertEqual(target["blocks"], [])

    def test_source_save_failure_rolls_back_new_destination_blocks(self):
        real_save = core.save_page_to_disk
        save_count = 0

        def fail_source_once(page_data, page_dir):
            nonlocal save_count
            save_count += 1
            if save_count == 2:
                raise OSError("source write failed")
            return real_save(page_data, page_dir)

        with patch("backend.routers.capture_transfer.save_page_to_disk", side_effect=fail_source_once):
            with self.assertRaisesRegex(OSError, "source write failed"):
                capture_transfer.transfer_capture_entry(self.request())

        source = core.load_page(SOURCE_PAGE_ID, self.index)
        target = core.load_page(TARGET_PAGE_ID, self.index)
        self.assertEqual(save_count, 3)
        self.assertEqual(source["revision"], 0)
        self.assertNotIn("transfer", json.loads(source["blocks"][0]["content"])["entries"][0])
        self.assertEqual(target["revision"], 0)
        self.assertEqual(target["blocks"], [])

    def test_cross_vault_transfer_uses_only_pinned_destination_and_adds_visible_source(self):
        other_vault = self.vault / "다른 볼트"
        other_target_id = "44444444-4444-4444-8444-444444444444"
        other_index = {"folderMap": {other_target_id: "ideas"}, "pageOrder": [other_target_id]}
        (other_vault / "ideas").mkdir(parents=True)
        (other_vault / "_index.nct").write_text(json.dumps(other_index), encoding="utf-8")
        core.save_page_to_disk(page(other_target_id, "외부 아이디어", []), other_vault / "ideas")
        (other_vault / "_vault_preferences.json").write_text(json.dumps({
            "planner": {
                "captureDestinations": [{"id": "external-idea", "pageId": other_target_id, "kind": "note"}],
            }
        }), encoding="utf-8")

        listed = capture_transfer.get_cross_vault_destinations()
        self.assertEqual(listed["vaults"], [{
            "name": "다른 볼트",
            "destinations": [{
                "id": "external-idea",
                "pageId": other_target_id,
                "kind": "note",
                "pageTitle": "외부 아이디어",
                "pageIcon": "📝",
                "revision": 0,
            }],
        }])

        with patch("backend.routers.capture_transfer._classification_date", return_value="2026-08-24"):
            result = capture_transfer.transfer_capture_entry_to_other_vault(
                capture_transfer.CrossVaultCaptureTransferRequest(
                    sourcePageId=SOURCE_PAGE_ID,
                    sourceBlockId=SOURCE_BLOCK_ID,
                    sourceEntryId="entry-1",
                    destinationPageId=other_target_id,
                    destinationVaultName="다른 볼트",
                    sourceRevision=0,
                    destinationRevision=0,
                    kind="note",
                )
            )
        self.assertFalse(result["alreadyTransferred"])
        self.assertEqual(len(result["destinationPage"]["blocks"]), 2)
        self.assertIn("2026-08-24 분류", result["destinationPage"]["blocks"][0]["content"])
        self.assertIn("data-footnote", result["destinationPage"]["blocks"][1]["content"])
        self.assertIn("출처: ", result["destinationPage"]["blocks"][1]["content"])
        self.assertIn("8월 기록", result["destinationPage"]["blocks"][1]["content"])
        transfer = json.loads(result["sourcePage"]["blocks"][0]["content"])["entries"][0]["transfer"]
        self.assertEqual(transfer["destinationVaultName"], "다른 볼트")
        self.assertEqual(transfer["destinationPageTitle"], "외부 아이디어")
        self.assertEqual(transfer["classifiedDate"], "2026-08-24")


if __name__ == "__main__":
    unittest.main()
