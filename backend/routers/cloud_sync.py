# ==============================================
# backend/routers/cloud_sync.py
# 역할: Google Drive / OneDrive OAuth 2.0 + vault 전체 업로드/다운로드
# Python으로 치면: class CloudSyncManager: def auth_google(): ... def upload(): ...
#
# OAuth 흐름:
#   1. 프론트 → GET /api/cloud/{provider}/auth-url → URL 반환
#   2. 프론트 → window.open(url) → 브라우저에서 인증
#   3. 인증 완료 → localhost:8000/api/cloud/{provider}/callback 으로 리다이렉트
#   4. 백엔드 → 코드 교환 → 토큰 저장
#   5. 프론트 → GET /api/cloud/status 폴링 → 연결 확인
# ==============================================

import base64
import hashlib
import io
import json
import secrets
import shutil
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests as req
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from backend.core import get_vault_dir, _APP_BASE

# Python으로 치면: blueprint = Blueprint('cloud_sync', __name__, url_prefix='/api/cloud')
router = APIRouter(prefix="/api/cloud", tags=["cloud_sync"])

# ── 파일 경로 ──────────────────────────────────────
# Python으로 치면: CONFIG_FILE = _APP_BASE / 'cloud_config.json'
CLOUD_CONFIG_FILE = _APP_BASE / "cloud_config.json"
CLOUD_TOKENS_FILE = _APP_BASE / "cloud_tokens.json"

# ── Google Drive OAuth 상수 ──────────────────────
GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL   = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_FILES_URL  = "https://www.googleapis.com/drive/v3/files"
GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
# drive.file: 앱이 만든 파일만 접근 (최소 권한)
GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file email"

# ── OneDrive (Microsoft Graph) OAuth 상수 ───────
ONEDRIVE_AUTH_URL  = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
ONEDRIVE_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
ONEDRIVE_API_URL   = "https://graph.microsoft.com/v1.0"
# Files.ReadWrite: 앱 전용 폴더 접근, User.Read: 이메일 조회
ONEDRIVE_SCOPE = "Files.ReadWrite offline_access User.Read"

# ── 리다이렉트 URI (백엔드가 받음) ─────────────────
REDIRECT_BASE = "http://localhost:8000/api/cloud"

# ── OAuth 진행 중 임시 상태 (메모리) ───────────────
# Python으로 치면: _pending = {'google': {'state': None, 'code_verifier': None}, ...}
_pending: dict = {
    "google":   {"state": None, "code_verifier": None},
    "onedrive": {"state": None, "code_verifier": None},
}


# ═══════════════════════════════════════════════════
# 설정/토큰 파일 헬퍼
# ═══════════════════════════════════════════════════

def _load_config() -> dict:
    """cloud_config.json 로드 (CLIENT_ID / CLIENT_SECRET 저장)"""
    if CLOUD_CONFIG_FILE.exists():
        try:
            return json.loads(CLOUD_CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def _save_config(data: dict) -> None:
    CLOUD_CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _load_tokens() -> dict:
    """cloud_tokens.json 로드 (access_token / refresh_token 저장)"""
    if CLOUD_TOKENS_FILE.exists():
        try:
            return json.loads(CLOUD_TOKENS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def _save_tokens(data: dict) -> None:
    CLOUD_TOKENS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ═══════════════════════════════════════════════════
# PKCE 헬퍼 (RFC 7636) — 공개 클라이언트 보안 강화
# ═══════════════════════════════════════════════════

def _pkce_pair() -> tuple[str, str]:
    """
    code_verifier, code_challenge 쌍 생성
    Python으로 치면: verifier = random_bytes(32); challenge = b64(sha256(verifier))
    """
    verifier  = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


# ═══════════════════════════════════════════════════
# Vault ↔ ZIP 헬퍼
# ═══════════════════════════════════════════════════

def _vault_to_zip() -> bytes:
    """
    get_vault_dir() 전체를 메모리 ZIP으로 압축해 반환
    Python으로 치면: zipfile.ZipFile(buf, 'w', ZIP_DEFLATED).write(all_files)
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in get_vault_dir().rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(get_vault_dir()))
    return buf.getvalue()

def _extract_zip_to_vault(zip_bytes: bytes) -> None:
    """
    ZIP 바이트를 get_vault_dir()에 압축 해제 (기존 파일 덮어쓰기)
    내려받기 전 vault 백업 → 실패 시 자동 롤백
    Python으로 치면: ZipFile(buf).extractall(get_vault_dir())
    """
    backup_dir = get_vault_dir().parent / f"vault_cloud_bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    try:
        shutil.copytree(str(get_vault_dir()), str(backup_dir))
        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            zf.extractall(get_vault_dir())
        shutil.rmtree(str(backup_dir))
    except Exception as exc:
        if backup_dir.exists():
            shutil.rmtree(str(get_vault_dir()))
            shutil.copytree(str(backup_dir), str(get_vault_dir()))
            shutil.rmtree(str(backup_dir))
        raise exc


# ═══════════════════════════════════════════════════
# Google Drive 헬퍼
# ═══════════════════════════════════════════════════

def _google_refresh(config: dict, tokens: dict) -> str:
    """
    Google access_token 갱신 → 새 토큰 저장 후 반환
    Python으로 치면: r = requests.post(token_url, data={grant_type: refresh_token, ...})
    """
    cfg = config.get("google", {})
    r = req.post(GOOGLE_TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "refresh_token": tokens["google"]["refresh_token"],
        "client_id":     cfg["client_id"],
        "client_secret": cfg["client_secret"],
    }, timeout=15)
    if not r.ok:
        raise HTTPException(status_code=401, detail="Google 토큰 갱신 실패")
    data = r.json()
    tokens["google"]["access_token"] = data["access_token"]
    tokens["google"]["expires_at"] = (
        datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    ).isoformat()
    _save_tokens(tokens)
    return data["access_token"]

def _google_token(config: dict, tokens: dict) -> str:
    """
    유효한 Google access_token 반환 (만료 시 자동 갱신)
    Python으로 치면: if expired: return refresh() else: return token
    """
    g = tokens.get("google", {})
    if not g.get("access_token"):
        raise HTTPException(status_code=401, detail="Google Drive 연결 필요")
    expires_at = g.get("expires_at", "")
    if expires_at:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= exp - timedelta(seconds=60):
            return _google_refresh(config, tokens)
    return g["access_token"]

def _google_get_or_create_folder(token: str, folder_name: str = "Notion Clone") -> str:
    """
    Google Drive에서 '{folder_name}' 폴더 ID 반환 (없으면 생성)
    Python으로 치면: folder = drive.find(name) or drive.create_folder(name)
    """
    headers = {"Authorization": f"Bearer {token}"}
    r = req.get(GOOGLE_FILES_URL, headers=headers, params={
        "q": f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false",
        "fields": "files(id)",
    }, timeout=15)
    files = r.json().get("files", [])
    if files:
        return files[0]["id"]
    r = req.post(GOOGLE_FILES_URL, headers=headers, json={
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
    }, timeout=15)
    return r.json()["id"]

def _google_upload_zip(token: str, zip_bytes: bytes, folder_id: str, file_id: Optional[str]) -> str:
    """
    vault.zip을 Google Drive에 업로드 (신규 or 기존 파일 업데이트)
    resumable upload 사용 (파일 크기 무제한)
    Python으로 치면: if file_id: drive.update(file_id, data) else: drive.create(folder_id, data)
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "application/zip",
        "X-Upload-Content-Length": str(len(zip_bytes)),
    }
    if file_id:
        # 기존 파일 업데이트
        init_r = req.patch(
            f"{GOOGLE_UPLOAD_URL}/{file_id}?uploadType=resumable",
            headers=headers, json={}, timeout=15,
        )
    else:
        # 신규 파일 생성
        init_r = req.post(
            f"{GOOGLE_UPLOAD_URL}?uploadType=resumable",
            headers=headers,
            json={"name": "notion-clone-vault.zip", "parents": [folder_id]},
            timeout=15,
        )
    if not init_r.ok:
        raise HTTPException(status_code=500, detail=f"Google Drive 업로드 초기화 실패: {init_r.text}")

    upload_uri = init_r.headers.get("Location")
    if not upload_uri:
        raise HTTPException(status_code=500, detail="Google Drive upload URI 없음")

    # 실제 파일 업로드
    up_r = req.put(upload_uri, data=zip_bytes, headers={"Content-Type": "application/zip"}, timeout=120)
    if not up_r.ok:
        raise HTTPException(status_code=500, detail=f"Google Drive 업로드 실패: {up_r.text}")

    return up_r.json().get("id", file_id or "")

def _google_download_zip(token: str, file_id: str) -> bytes:
    """
    Google Drive에서 vault.zip 다운로드
    Python으로 치면: r = requests.get(f'/files/{file_id}?alt=media', headers=auth)
    """
    r = req.get(
        f"{GOOGLE_FILES_URL}/{file_id}",
        headers={"Authorization": f"Bearer {token}"},
        params={"alt": "media"},
        timeout=120,
    )
    if not r.ok:
        raise HTTPException(status_code=500, detail="Google Drive 다운로드 실패")
    return r.content

def _google_find_vault_file(token: str, folder_id: str) -> Optional[str]:
    """
    'Notion Clone' 폴더에서 notion-clone-vault.zip 파일 ID 검색
    Python으로 치면: files = drive.list(q=f"name='notion-clone-vault.zip' and '{folder_id}' in parents")
    """
    r = req.get(GOOGLE_FILES_URL, headers={"Authorization": f"Bearer {token}"}, params={
        "q": f"name='notion-clone-vault.zip' and '{folder_id}' in parents and trashed=false",
        "fields": "files(id)",
    }, timeout=15)
    files = r.json().get("files", [])
    return files[0]["id"] if files else None


# ═══════════════════════════════════════════════════
# OneDrive 헬퍼
# ═══════════════════════════════════════════════════

def _onedrive_refresh(config: dict, tokens: dict) -> str:
    """
    OneDrive access_token 갱신
    Python으로 치면: r = requests.post(token_url, data={grant_type: refresh_token, ...})
    """
    cfg = config.get("onedrive", {})
    r = req.post(ONEDRIVE_TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "refresh_token": tokens["onedrive"]["refresh_token"],
        "client_id":     cfg["client_id"],
        "scope":         ONEDRIVE_SCOPE,
    }, timeout=15)
    if not r.ok:
        raise HTTPException(status_code=401, detail="OneDrive 토큰 갱신 실패")
    data = r.json()
    tokens["onedrive"]["access_token"] = data["access_token"]
    if "refresh_token" in data:
        tokens["onedrive"]["refresh_token"] = data["refresh_token"]
    tokens["onedrive"]["expires_at"] = (
        datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    ).isoformat()
    _save_tokens(tokens)
    return data["access_token"]

def _onedrive_token(config: dict, tokens: dict) -> str:
    """유효한 OneDrive access_token 반환 (만료 시 자동 갱신)"""
    od = tokens.get("onedrive", {})
    if not od.get("access_token"):
        raise HTTPException(status_code=401, detail="OneDrive 연결 필요")
    expires_at = od.get("expires_at", "")
    if expires_at:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= exp - timedelta(seconds=60):
            return _onedrive_refresh(config, tokens)
    return od["access_token"]

def _onedrive_upload_zip(token: str, zip_bytes: bytes) -> None:
    """
    OneDrive /Notion Clone/notion-clone-vault.zip 에 업로드 (업로드 세션 사용)
    Python으로 치면: graph.put('/drive/root:/Notion Clone/notion-clone-vault.zip:/content', data=zip)
    """
    file_path = "Notion Clone/notion-clone-vault.zip"

    # 업로드 세션 생성 (대용량 지원)
    # Python으로 치면: session = graph.post(f'/drive/root:/{file_path}:/createUploadSession')
    session_r = req.post(
        f"{ONEDRIVE_API_URL}/me/drive/root:/{file_path}:/createUploadSession",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
        timeout=15,
    )
    if not session_r.ok:
        raise HTTPException(status_code=500, detail=f"OneDrive 업로드 세션 생성 실패: {session_r.text}")

    upload_url = session_r.json().get("uploadUrl")
    if not upload_url:
        raise HTTPException(status_code=500, detail="OneDrive uploadUrl 없음")

    # 청크 단위 업로드 (5MB 청크)
    # Python으로 치면: for chunk in chunks(zip_bytes, 5MB): put(upload_url, chunk)
    chunk_size = 5 * 1024 * 1024  # 5MB
    total = len(zip_bytes)
    offset = 0
    while offset < total:
        chunk = zip_bytes[offset: offset + chunk_size]
        end = offset + len(chunk) - 1
        up_r = req.put(
            upload_url,
            data=chunk,
            headers={
                "Content-Range": f"bytes {offset}-{end}/{total}",
                "Content-Type": "application/zip",
            },
            timeout=120,
        )
        if up_r.status_code not in (200, 201, 202):
            raise HTTPException(status_code=500, detail=f"OneDrive 청크 업로드 실패: {up_r.text}")
        offset += len(chunk)

def _onedrive_download_zip(token: str) -> bytes:
    """
    OneDrive에서 notion-clone-vault.zip 다운로드
    Python으로 치면: r = requests.get('/drive/root:/Notion Clone/notion-clone-vault.zip:/content')
    """
    r = req.get(
        f"{ONEDRIVE_API_URL}/me/drive/root:/Notion Clone/notion-clone-vault.zip:/content",
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
        allow_redirects=True,
    )
    if not r.ok:
        raise HTTPException(status_code=404, detail="OneDrive에서 백업 파일을 찾을 수 없습니다")
    return r.content


# ═══════════════════════════════════════════════════
# OAuth 콜백 HTML 템플릿
# ═══════════════════════════════════════════════════

def _success_html(provider_name: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>{provider_name} 인증 완료</title>
<style>
  body {{ font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; background: #f0fdf4; }}
  .card {{ background: white; border-radius: 16px; padding: 40px 48px; text-align: center;
           box-shadow: 0 4px 24px rgba(0,0,0,.08); }}
  h2 {{ color: #16a34a; margin: 0 0 8px; }} p {{ color: #6b7280; margin: 0; }}
</style></head>
<body><div class="card">
  <h2>✅ {provider_name} 연결 완료!</h2>
  <p>이 탭을 닫고 앱으로 돌아가세요.</p>
  <p style="margin-top:8px;font-size:12px;color:#9ca3af">2초 후 자동으로 탭이 닫힙니다.</p>
</div>
<script>setTimeout(() => window.close(), 2000);</script>
</body></html>"""

def _error_html(provider_name: str, msg: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>인증 실패</title>
<style>
  body {{ font-family: -apple-system, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; background: #fef2f2; }}
  .card {{ background: white; border-radius: 16px; padding: 40px 48px; text-align: center;
           box-shadow: 0 4px 24px rgba(0,0,0,.08); }}
  h2 {{ color: #dc2626; margin: 0 0 8px; }} p {{ color: #6b7280; margin: 0; }}
</style></head>
<body><div class="card">
  <h2>❌ {provider_name} 인증 실패</h2>
  <p>{msg}</p>
  <p style="margin-top:8px;font-size:12px;color:#9ca3af">이 탭을 닫고 다시 시도해 주세요.</p>
</div></body></html>"""


# ═══════════════════════════════════════════════════
# Pydantic 모델
# ═══════════════════════════════════════════════════

class CloudConfigBody(BaseModel):
    """클라우드 서비스 자격증명 저장 요청"""
    provider: str           # "google" | "onedrive"
    client_id: str
    client_secret: Optional[str] = None  # Google 전용 (OneDrive는 공개 클라이언트)


# ═══════════════════════════════════════════════════
# API 엔드포인트
# ═══════════════════════════════════════════════════

@router.get("/status")
def cloud_status():
    """
    Google Drive / OneDrive 연결 상태 반환
    Python으로 치면: return {'google': {'connected': bool, 'email': str}, 'onedrive': {...}}
    """
    tokens = _load_tokens()
    config = _load_config()

    def _provider_status(key: str) -> dict:
        t = tokens.get(key, {})
        cfg = config.get(key, {})
        return {
            "connected":   bool(t.get("access_token")),
            "email":       t.get("email", ""),
            "last_upload": t.get("last_upload", ""),
            "configured":  bool(cfg.get("client_id")),
        }

    return {
        "google":   _provider_status("google"),
        "onedrive": _provider_status("onedrive"),
    }


@router.post("/config")
def save_cloud_config(body: CloudConfigBody):
    """
    CLIENT_ID / CLIENT_SECRET 저장
    Python으로 치면: cloud_config[provider] = {'client_id': ..., 'client_secret': ...}
    """
    if body.provider not in ("google", "onedrive"):
        raise HTTPException(status_code=400, detail="provider는 'google' 또는 'onedrive'")
    config = _load_config()
    config[body.provider] = {"client_id": body.client_id.strip()}
    if body.client_secret:
        config[body.provider]["client_secret"] = body.client_secret.strip()
    _save_config(config)
    return {"ok": True}


# ── Google Drive OAuth ───────────────────────────

@router.get("/google/auth-url")
def google_auth_url():
    """
    Google OAuth 인증 URL 생성 (PKCE 포함)
    Python으로 치면: url = build_oauth_url(scope, redirect_uri, state, code_challenge)
    """
    config = _load_config()
    if not config.get("google", {}).get("client_id"):
        raise HTTPException(status_code=400, detail="Google CLIENT_ID를 먼저 설정하세요")

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)
    _pending["google"] = {"state": state, "code_verifier": verifier}

    params = {
        "client_id":             config["google"]["client_id"],
        "redirect_uri":          f"{REDIRECT_BASE}/google/callback",
        "response_type":         "code",
        "scope":                 GOOGLE_SCOPE,
        "state":                 state,
        "code_challenge":        challenge,
        "code_challenge_method": "S256",
        "access_type":           "offline",
        "prompt":                "consent",  # refresh_token 강제 발급
    }
    query = "&".join(f"{k}={req.utils.quote(str(v))}" for k, v in params.items())
    return {"url": f"{GOOGLE_AUTH_URL}?{query}"}


@router.get("/google/callback", response_class=HTMLResponse)
def google_callback(code: str = "", state: str = "", error: str = ""):
    """
    Google OAuth 콜백 — 인증 코드를 토큰으로 교환
    Python으로 치면: token = exchange_code(code, verifier); save_token(token)
    """
    if error:
        return HTMLResponse(_error_html("Google Drive", error))

    pending = _pending.get("google", {})
    if not pending.get("state") or pending["state"] != state:
        return HTMLResponse(_error_html("Google Drive", "잘못된 state 파라미터"))

    config = _load_config()
    cfg = config.get("google", {})

    r = req.post(GOOGLE_TOKEN_URL, data={
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  f"{REDIRECT_BASE}/google/callback",
        "client_id":     cfg["client_id"],
        "client_secret": cfg.get("client_secret", ""),
        "code_verifier": pending["code_verifier"],
    }, timeout=15)

    if not r.ok:
        return HTMLResponse(_error_html("Google Drive", f"토큰 교환 실패: {r.text}"))

    token_data = r.json()

    # 사용자 이메일 조회
    # Python으로 치면: email = requests.get(user_url, headers=auth).json()['email']
    user_r = req.get(GOOGLE_USER_URL, headers={"Authorization": f"Bearer {token_data['access_token']}"}, timeout=10)
    email = user_r.json().get("email", "") if user_r.ok else ""

    tokens = _load_tokens()
    tokens["google"] = {
        "access_token":  token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", tokens.get("google", {}).get("refresh_token", "")),
        "expires_at":    (datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))).isoformat(),
        "email":         email,
        "file_id":       tokens.get("google", {}).get("file_id", ""),
        "last_upload":   tokens.get("google", {}).get("last_upload", ""),
    }
    _save_tokens(tokens)
    _pending["google"] = {"state": None, "code_verifier": None}

    return HTMLResponse(_success_html("Google Drive"))


@router.post("/google/upload")
def google_upload():
    """
    vault 전체를 ZIP으로 압축해 Google Drive에 업로드
    Python으로 치면: zip = vault_to_zip(); drive.upload(zip)
    """
    config = _load_config()
    tokens = _load_tokens()
    token  = _google_token(config, tokens)

    zip_bytes = _vault_to_zip()
    folder_id = _google_get_or_create_folder(token)
    file_id   = tokens.get("google", {}).get("file_id") or _google_find_vault_file(token, folder_id)

    new_file_id = _google_upload_zip(token, zip_bytes, folder_id, file_id)

    tokens["google"]["file_id"]     = new_file_id
    tokens["google"]["last_upload"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    _save_tokens(tokens)

    return {"ok": True, "size_kb": round(len(zip_bytes) / 1024)}


@router.post("/google/download")
def google_download():
    """
    Google Drive에서 vault ZIP 다운로드 → vault에 적용 (기존 데이터 덮어씀)
    Python으로 치면: zip = drive.download(file_id); extract_zip(zip, vault_dir)
    """
    config = _load_config()
    tokens = _load_tokens()
    token  = _google_token(config, tokens)

    file_id = tokens.get("google", {}).get("file_id")
    if not file_id:
        folder_id = _google_get_or_create_folder(token)
        file_id   = _google_find_vault_file(token, folder_id)
    if not file_id:
        raise HTTPException(status_code=404, detail="Google Drive에 백업 파일이 없습니다")

    zip_bytes = _google_download_zip(token, file_id)
    _extract_zip_to_vault(zip_bytes)
    return {"ok": True}


@router.delete("/google/disconnect")
def google_disconnect():
    """Google Drive 연결 해제 (토큰 삭제)"""
    tokens = _load_tokens()
    tokens.pop("google", None)
    _save_tokens(tokens)
    return {"ok": True}


# ── OneDrive OAuth ───────────────────────────────

@router.get("/onedrive/auth-url")
def onedrive_auth_url():
    """
    OneDrive OAuth 인증 URL 생성 (PKCE 포함)
    Python으로 치면: url = build_oauth_url(scope, redirect_uri, state, code_challenge)
    """
    config = _load_config()
    if not config.get("onedrive", {}).get("client_id"):
        raise HTTPException(status_code=400, detail="OneDrive CLIENT_ID를 먼저 설정하세요")

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)
    _pending["onedrive"] = {"state": state, "code_verifier": verifier}

    params = {
        "client_id":             config["onedrive"]["client_id"],
        "redirect_uri":          f"{REDIRECT_BASE}/onedrive/callback",
        "response_type":         "code",
        "scope":                 ONEDRIVE_SCOPE,
        "state":                 state,
        "code_challenge":        challenge,
        "code_challenge_method": "S256",
    }
    query = "&".join(f"{k}={req.utils.quote(str(v))}" for k, v in params.items())
    return {"url": f"{ONEDRIVE_AUTH_URL}?{query}"}


@router.get("/onedrive/callback", response_class=HTMLResponse)
def onedrive_callback(code: str = "", state: str = "", error: str = ""):
    """
    OneDrive OAuth 콜백 — 인증 코드를 토큰으로 교환
    Python으로 치면: token = exchange_code(code, verifier); save_token(token)
    """
    if error:
        return HTMLResponse(_error_html("OneDrive", error))

    pending = _pending.get("onedrive", {})
    if not pending.get("state") or pending["state"] != state:
        return HTMLResponse(_error_html("OneDrive", "잘못된 state 파라미터"))

    config = _load_config()
    cfg = config.get("onedrive", {})

    r = req.post(ONEDRIVE_TOKEN_URL, data={
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  f"{REDIRECT_BASE}/onedrive/callback",
        "client_id":     cfg["client_id"],
        "scope":         ONEDRIVE_SCOPE,
        "code_verifier": pending["code_verifier"],
    }, timeout=15)

    if not r.ok:
        return HTMLResponse(_error_html("OneDrive", f"토큰 교환 실패: {r.text}"))

    token_data = r.json()

    # 사용자 이메일 조회
    user_r = req.get(
        f"{ONEDRIVE_API_URL}/me",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
        timeout=10,
    )
    email = user_r.json().get("mail") or user_r.json().get("userPrincipalName", "") if user_r.ok else ""

    tokens = _load_tokens()
    tokens["onedrive"] = {
        "access_token":  token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", ""),
        "expires_at":    (datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))).isoformat(),
        "email":         email,
        "last_upload":   tokens.get("onedrive", {}).get("last_upload", ""),
    }
    _save_tokens(tokens)
    _pending["onedrive"] = {"state": None, "code_verifier": None}

    return HTMLResponse(_success_html("OneDrive"))


@router.post("/onedrive/upload")
def onedrive_upload():
    """
    vault 전체를 ZIP으로 압축해 OneDrive에 업로드
    Python으로 치면: zip = vault_to_zip(); onedrive.upload('/Notion Clone/vault.zip', zip)
    """
    config = _load_config()
    tokens = _load_tokens()
    token  = _onedrive_token(config, tokens)

    zip_bytes = _vault_to_zip()
    _onedrive_upload_zip(token, zip_bytes)

    tokens["onedrive"]["last_upload"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    _save_tokens(tokens)

    return {"ok": True, "size_kb": round(len(zip_bytes) / 1024)}


@router.post("/onedrive/download")
def onedrive_download():
    """
    OneDrive에서 vault ZIP 다운로드 → vault에 적용 (기존 데이터 덮어씀)
    Python으로 치면: zip = onedrive.download('/Notion Clone/vault.zip'); extract_zip(zip)
    """
    config = _load_config()
    tokens = _load_tokens()
    token  = _onedrive_token(config, tokens)

    zip_bytes = _onedrive_download_zip(token)
    _extract_zip_to_vault(zip_bytes)
    return {"ok": True}


@router.delete("/onedrive/disconnect")
def onedrive_disconnect():
    """OneDrive 연결 해제 (토큰 삭제)"""
    tokens = _load_tokens()
    tokens.pop("onedrive", None)
    _save_tokens(tokens)
    return {"ok": True}
