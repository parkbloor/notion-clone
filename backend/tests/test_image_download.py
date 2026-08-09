import asyncio
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import core
from backend.routers import pages


class ImageDownloadTests(unittest.TestCase):
    page_id = "11111111-1111-4111-8111-111111111111"
    page_folder = "image-note_11111111"
    first_id = "22222222-2222-4222-8222-222222222222"
    second_id = "33333333-3333-4333-8333-333333333333"

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault_dir = Path(self.temp_dir.name)
        self.previous_vault = core._vault_state["dir"]
        core._vault_state["dir"] = self.vault_dir
        self.page_dir = self.vault_dir / self.page_folder
        self.images_dir = self.page_dir / "images"
        self.images_dir.mkdir(parents=True)
        self.first_path = self.images_dir / f"{self.first_id}.png"
        self.second_path = self.images_dir / f"{self.second_id}.gif"
        self.first_path.write_bytes(b"png-original")
        self.second_path.write_bytes(b"gif-original")
        self.first_url = f"http://127.0.0.1:8000/static/{self.page_folder}/images/{self.first_path.name}"
        self.second_url = f"http://127.0.0.1:8000/static/{self.page_folder}/images/{self.second_path.name}"
        self.index = {
            "folderMap": {self.page_id: self.page_folder},
            "categoryMap": {},
            "categories": [],
        }

    def tearDown(self):
        core._vault_state["dir"] = self.previous_vault
        self.temp_dir.cleanup()

    def write_page(self, blocks):
        page = {
            "id": self.page_id,
            "title": "원본 이미지 메모",
            "blocks": blocks,
        }
        (self.page_dir / "content.nct").write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")

    def read_zip_response(self, response):
        archive_path = Path(response.path)
        try:
            return archive_path.read_bytes()
        finally:
            archive_path.unlink(missing_ok=True)

    def test_individual_download_preserves_original_bytes_and_name(self):
        self.write_page([{
            "type": "image",
            "content": json.dumps({"images": [{"src": self.first_url, "name": "그림 원본.png"}]}, ensure_ascii=False),
        }])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            response = pages.download_image(self.page_id, core.ImageDownloadBody(url=self.first_url))

        self.assertEqual(Path(response.path).read_bytes(), b"png-original")
        self.assertIn("filename*=utf-8''%EA%B7%B8%EB%A6%BC%20%EC%9B%90%EB%B3%B8.png", response.headers["content-disposition"])

    def test_download_rejects_an_image_not_referenced_by_the_page(self):
        self.write_page([])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            with self.assertRaises(HTTPException) as raised:
                pages.download_image(self.page_id, core.ImageDownloadBody(url=self.first_url))
        self.assertEqual(raised.exception.status_code, 404)

    def test_download_all_includes_nested_images_and_deduplicates_names(self):
        self.write_page([{
            "type": "toggle",
            "content": "",
            "children": [{
                "type": "image",
                "content": json.dumps({"images": [
                    {"src": self.first_url, "name": "same.png"},
                    {"src": self.second_url, "name": "same.png"},
                    {"src": self.first_url, "name": "duplicate.png"},
                ]}),
            }],
        }])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            response = pages.download_all_images(self.page_id)

        with zipfile.ZipFile(io.BytesIO(self.read_zip_response(response))) as archive:
            self.assertEqual(archive.namelist(), ["same.png", "same.gif"])
            self.assertEqual(archive.read("same.png"), b"png-original")
            self.assertEqual(archive.read("same.gif"), b"gif-original")

    def test_download_all_supports_legacy_single_image_content(self):
        self.write_page([{
            "type": "image",
            "content": json.dumps({"src": self.first_url, "caption": "legacy"}),
        }])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            response = pages.download_all_images(self.page_id)
        with zipfile.ZipFile(io.BytesIO(self.read_zip_response(response))) as archive:
            self.assertEqual(archive.namelist(), ["image-01.png"])

    def test_windows_reserved_download_name_is_prefixed(self):
        self.write_page([{
            "type": "image",
            "content": json.dumps({"images": [{"src": self.first_url, "name": "CON.png"}]}),
        }])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            individual = pages.download_image(self.page_id, core.ImageDownloadBody(url=self.first_url))
            archive_response = pages.download_all_images(self.page_id)

        self.assertIn("_CON.png", individual.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(self.read_zip_response(archive_response))) as archive:
            self.assertEqual(archive.namelist(), ["_CON.png"])

    def test_download_all_removes_temporary_archive_after_response(self):
        self.write_page([{
            "type": "image",
            "content": json.dumps({"images": [{"src": self.first_url, "name": "original.png"}]}),
        }])
        with patch("backend.routers.pages.load_index", return_value=self.index):
            response = pages.download_all_images(self.page_id)

        archive_path = Path(response.path)
        self.assertTrue(archive_path.is_file())
        asyncio.run(response.background())
        self.assertFalse(archive_path.exists())


if __name__ == "__main__":
    unittest.main()
