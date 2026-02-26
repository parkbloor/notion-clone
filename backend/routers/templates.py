# ==============================================
# backend/routers/templates.py
# 역할: 사용자 정의 템플릿 CRUD API
# 템플릿은 vault/_templates/ 폴더에 JSON 파일로 저장
# Python으로 치면: Flask Blueprint('templates', ...)
# ==============================================

import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core import VAULT_DIR, validate_uuid

# ── 템플릿 저장 폴더 ───────────────────────────
# Python으로 치면: TEMPLATES_DIR = VAULT_DIR / "_templates"
TEMPLATES_DIR = VAULT_DIR / "_templates"
TEMPLATES_DIR.mkdir(exist_ok=True)

# Python으로 치면: router = Blueprint('templates', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["templates"])


# ── 요청 바디 모델 ──────────────────────────────
# Python으로 치면: @dataclass class TemplateBody: name: str; icon: str; ...
class TemplateBody(BaseModel):
    name: str
    icon: str = "📄"
    description: str = ""
    # 마크다운 형식 텍스트 (파서가 블록으로 변환)
    # Python으로 치면: content: str = ""
    content: str = ""


# -----------------------------------------------
# 전체 템플릿 목록 반환
# Python으로 치면: def get_templates(): return [json.load(f) for f in TEMPLATES_DIR.glob('*.json')]
# -----------------------------------------------
@router.get("/templates")
def get_templates():
    """vault/_templates/ 폴더의 모든 .json 파일을 읽어 반환"""
    templates = []
    for f in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            templates.append(data)
        except Exception:
            pass
    return {"templates": templates}


# -----------------------------------------------
# 새 템플릿 생성
# Python으로 치면: def create_template(body): file.write(json.dumps(template))
# -----------------------------------------------
@router.post("/templates")
def create_template(body: TemplateBody):
    """새 템플릿을 UUID 파일명으로 vault/_templates/ 에 저장"""
    template_id = str(uuid.uuid4())
    template = {
        "id":          template_id,
        "name":        body.name.strip() or "이름 없는 템플릿",
        "icon":        body.icon or "📄",
        "description": body.description,
        "content":     body.content,
    }
    path = TEMPLATES_DIR / f"{template_id}.json"
    path.write_text(
        json.dumps(template, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return template


# -----------------------------------------------
# 템플릿 수정
# Python으로 치면: def update_template(id, body): file.write(json.dumps(updated))
# -----------------------------------------------
@router.put("/templates/{template_id}")
def update_template(template_id: str, body: TemplateBody):
    """기존 템플릿 파일을 덮어씌워 수정"""
    # UUID 형식 검증 (경로 트래버설 방지)
    validate_uuid(template_id, "템플릿 ID")
    path = TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    template = {
        "id":          template_id,
        "name":        body.name.strip() or "이름 없는 템플릿",
        "icon":        body.icon or "📄",
        "description": body.description,
        "content":     body.content,
    }
    path.write_text(
        json.dumps(template, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return template


# -----------------------------------------------
# 템플릿 삭제
# Python으로 치면: def delete_template(id): os.remove(path)
# -----------------------------------------------
@router.delete("/templates/{template_id}")
def delete_template(template_id: str):
    """템플릿 JSON 파일 삭제"""
    validate_uuid(template_id, "템플릿 ID")
    path = TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    path.unlink()
    return {"ok": True}
