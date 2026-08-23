"""Small OS-backed secret-file helpers used by the desktop backend."""

import base64
import ctypes
import json
import os
from ctypes import wintypes
from pathlib import Path


_DPAPI_DESCRIPTION = "NotionClone secure settings"
_CRYPTPROTECT_UI_FORBIDDEN = 0x01


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _input_blob(data: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data)
    blob = _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    return blob, buffer


def _dpapi_transform(data: bytes, *, decrypt: bool) -> bytes:
    if os.name != "nt":
        raise OSError("DPAPI is only available on Windows")

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    input_data, input_buffer = _input_blob(data)
    output_data = _DataBlob()
    _ = input_buffer  # keep the input buffer alive through the native call

    if decrypt:
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(input_data), None, None, None, None,
            _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output_data),
        )
    else:
        ok = crypt32.CryptProtectData(
            ctypes.byref(input_data), _DPAPI_DESCRIPTION, None, None, None,
            _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output_data),
        )
    if not ok:
        raise ctypes.WinError()

    try:
        return ctypes.string_at(output_data.pbData, output_data.cbData)
    finally:
        kernel32.LocalFree(output_data.pbData)


def write_secret_json(path: Path, data: dict) -> None:
    """Atomically persist JSON, using the current Windows user's DPAPI key."""
    plain = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if os.name == "nt":
        payload = {
            "version": 1,
            "protection": "dpapi",
            "payload": base64.b64encode(_dpapi_transform(plain, decrypt=False)).decode("ascii"),
        }
    else:
        # Non-Windows development remains compatible, with owner-only file permissions.
        payload = {"version": 1, "protection": "owner-only", "payload": data}

    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + ".tmp")
    try:
        temp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        try:
            temp_path.chmod(0o600)
        except OSError:
            pass
        temp_path.replace(path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def read_secret_json(path: Path) -> tuple[dict, bool]:
    """Return (data, was_legacy_plaintext) for transparent migration."""
    if not path.exists():
        return {}, False
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {}, False

    protection = raw.get("protection")
    if protection == "dpapi":
        encrypted = base64.b64decode(str(raw.get("payload", "")), validate=True)
        data = json.loads(_dpapi_transform(encrypted, decrypt=True).decode("utf-8"))
        return data if isinstance(data, dict) else {}, False
    if protection == "owner-only":
        data = raw.get("payload", {})
        return data if isinstance(data, dict) else {}, False

    return raw, True
