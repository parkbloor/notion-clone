# ==============================================
# backend/routers/system.py
# 역할: 시스템 설정, 디버그 로그 API
# Python으로 치면: Flask Blueprint('system', ...)
# ==============================================

from fastapi import APIRouter

from backend.core import VAULT_DIR, load_index, mem_handler

# Python으로 치면: blueprint = Blueprint('system', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["system"])


@router.get("/settings/vault-path")
def get_vault_path():
    """
    현재 vault 경로와 통계 반환
    Python으로 치면: return {'path': str(VAULT_DIR), 'pages': len(pages), ...}
    """
    index = load_index()
    # pageOrder 기준으로 페이지 수 계산 (구버전 index['pages'] 대신)
    # Python으로 치면: page_count = len(index.get('pageOrder', []))
    page_count = len(index.get("pageOrder", []))
    category_count = len(index.get("categories", []))

    # vault 전체 디스크 사용량 계산 (bytes)
    # Python으로 치면: total = sum(f.stat().st_size for f in vault.rglob('*'))
    total_size = 0
    if VAULT_DIR.exists():
        for f in VAULT_DIR.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size

    return {
        "path":       str(VAULT_DIR.resolve()),
        "pages":      page_count,
        "categories": category_count,
        "sizeBytes":  total_size,
    }


@router.get("/debug/logs")
def get_debug_logs():
    """
    메모리에 보관 중인 최근 로그 반환 (최대 100개)
    Python으로 치면: return list(mem_handler.records)
    """
    return {"logs": list(mem_handler.records)}
