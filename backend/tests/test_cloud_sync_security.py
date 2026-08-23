import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

from backend.routers.cloud_sync import _validate_cloud_archive
from backend.secure_storage import read_secret_json, write_secret_json


class CloudSyncSecurityTests(unittest.TestCase):
    def test_archive_rejects_parent_path_escape(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("../outside.txt", "blocked")
        archive.seek(0)

        with tempfile.TemporaryDirectory() as target, zipfile.ZipFile(archive) as zf:
            with self.assertRaisesRegex(ValueError, "안전하지 않은 경로"):
                _validate_cloud_archive(zf, Path(target))

    def test_archive_rejects_symbolic_links(self):
        archive = io.BytesIO()
        info = zipfile.ZipInfo("linked-file")
        info.create_system = 3
        info.external_attr = 0o120777 << 16
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr(info, "target")
        archive.seek(0)

        with tempfile.TemporaryDirectory() as target, zipfile.ZipFile(archive) as zf:
            with self.assertRaisesRegex(ValueError, "심볼릭 링크"):
                _validate_cloud_archive(zf, Path(target))

    def test_secret_file_round_trip_is_not_plaintext_on_windows(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "tokens.json"
            write_secret_json(path, {"access_token": "sensitive-token"})
            restored, legacy = read_secret_json(path)

            self.assertEqual(restored, {"access_token": "sensitive-token"})
            self.assertFalse(legacy)
            envelope = json.loads(path.read_text(encoding="utf-8"))
            if os.name == "nt":
                self.assertEqual(envelope["protection"], "dpapi")
                self.assertNotIn("sensitive-token", path.read_text(encoding="utf-8"))
