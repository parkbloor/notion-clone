import asyncio
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from backend import core
from backend.routers import pages


class ImageUploadSafetyTests(unittest.TestCase):
    page_id = "11111111-1111-4111-8111-111111111111"
    page_folder = "image-note_11111111"

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault_dir = Path(self.temp_dir.name)
        self.previous_vault = core._vault_state["dir"]
        core._vault_state["dir"] = self.vault_dir
        self.index = {
            "folderMap": {self.page_id: self.page_folder},
            "categoryMap": {},
            "categories": [],
        }

    def tearDown(self):
        core._vault_state["dir"] = self.previous_vault
        self.temp_dir.cleanup()

    def test_upload_writes_only_for_an_existing_page(self):
        page_dir = self.vault_dir / self.page_folder
        page_dir.mkdir()
        (page_dir / "content.nct").write_text(
            json.dumps({"id": self.page_id, "title": "image note", "blocks": []}), encoding="utf-8"
        )

        with patch("backend.routers.pages.load_index", return_value=self.index):
            result = asyncio.run(
                pages.upload_image(
                    self.page_id,
                    UploadFile(filename="sample.png", file=BytesIO(b"image-bytes")),
                )
            )

        saved_files = list((page_dir / "images").glob("*.png"))
        self.assertEqual(len(saved_files), 1)
        self.assertEqual(saved_files[0].read_bytes(), b"image-bytes")
        self.assertIn(f"/static/{self.page_folder}/images/", result["url"])
        self.assertEqual(result["originalName"], "sample.png")
        self.assertEqual(result["size"], len(b"image-bytes"))

    def test_upload_refuses_to_create_an_orphan_image_directory(self):
        with patch("backend.routers.pages.load_index", return_value=self.index):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    pages.upload_image(
                        self.page_id,
                        UploadFile(filename="sample.png", file=BytesIO(b"image-bytes")),
                    )
                )

        self.assertEqual(raised.exception.status_code, 404)
        self.assertFalse((self.vault_dir / self.page_folder / "images").exists())


if __name__ == "__main__":
    unittest.main()
