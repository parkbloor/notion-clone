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

from backend.core import get_vault_dir, validate_uuid


def get_templates_dir():
    """
    현재 활성 볼트의 _templates 폴더 반환 (볼트 전환 시 자동 반영)
    Python으로 치면: def get_templates_dir(): return get_vault_dir() / '_templates'
    """
    d = get_vault_dir() / "_templates"
    d.mkdir(exist_ok=True)
    return d

# Python으로 치면: router = Blueprint('templates', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["templates"])


# -----------------------------------------------
# 기본 제공 템플릿 정의
# _templates/ 폴더가 비어 있을 때 한 번만 시드
# Python으로 치면: DEFAULT_TEMPLATES: list[dict] = [...]
# -----------------------------------------------
DEFAULT_TEMPLATES = [
    {
        "name": "회의록",
        "icon": "📋",
        "description": "회의 날짜·참석자·안건·결정사항·액션아이템 구조",
        "content": (
            "## 📅 날짜 및 시간\n\n"
            "## 👥 참석자\n"
            "- \n\n"
            "## 📌 안건\n"
            "- \n\n"
            "## 🗒️ 논의 내용\n\n"
            "## ✅ 결정사항\n"
            "- \n\n"
            "## 🎯 액션아이템\n"
            "- [ ] \n"
        ),
    },
    {
        "name": "프로젝트 계획",
        "icon": "📊",
        "description": "목표·일정·팀·위험 요소·마일스톤 구조",
        "content": (
            "# 프로젝트 개요\n\n"
            "## 🎯 목표\n\n"
            "## 📅 일정\n"
            "- 시작일: \n"
            "- 완료 목표: \n\n"
            "## 👥 팀 구성\n"
            "- \n\n"
            "## 📌 마일스톤\n"
            "- [ ] \n"
            "- [ ] \n"
            "- [ ] \n\n"
            "## ⚠️ 위험 요소\n"
            "- \n\n"
            "## 📎 참고 자료\n"
            "- \n"
        ),
    },
    {
        "name": "일일 저널",
        "icon": "📅",
        "description": "오늘의 기분·할 일·감사·회고 구조",
        "content": (
            "## 😊 오늘의 기분\n\n"
            "## ✅ 오늘 할 일\n"
            "- [ ] \n"
            "- [ ] \n"
            "- [ ] \n\n"
            "## 💡 오늘 배운 것\n\n"
            "## 🙏 감사한 것\n"
            "- \n\n"
            "## 🌙 오늘 하루 회고\n\n"
        ),
    },
    {
        "name": "독서 노트",
        "icon": "📖",
        "description": "책 정보·핵심 내용·인용·적용 구조",
        "content": (
            "# 책 정보\n"
            "- **제목**: \n"
            "- **저자**: \n"
            "- **장르**: \n"
            "- **읽은 날짜**: \n\n"
            "## ⭐ 총평\n\n"
            "## 📌 핵심 내용 요약\n"
            "- \n\n"
            "## 💬 인상 깊은 구절\n"
            "> \n\n"
            "## 🎯 내 삶에 적용할 점\n"
            "- [ ] \n"
        ),
    },
    {
        "name": "목표 설정",
        "icon": "🎯",
        "description": "분기별 목표·세부 계획·진행 상황 구조",
        "content": (
            "## 🌟 핵심 목표\n\n"
            "## 📋 세부 계획\n"
            "- [ ] \n"
            "- [ ] \n"
            "- [ ] \n\n"
            "## 📏 성공 기준\n"
            "- \n\n"
            "## ⏰ 기한\n\n"
            "## 🔄 진행 상황\n\n"
            "## 🚧 장애물\n"
            "- \n"
        ),
    },
]


# -----------------------------------------------
# 기본 템플릿 시드 함수
# _templates/ 폴더가 비어 있을 때만 실행
# Python으로 치면: def seed_default_templates(): if not list(get_templates_dir().glob('*.json')): ...
# -----------------------------------------------
def _seed_default_templates() -> None:
    """vault/_templates/ 가 비어 있으면 기본 템플릿 5종을 파일로 생성"""
    if list(get_templates_dir().glob("*.json")):
        return  # 이미 템플릿이 있으면 시드 건너뜀
    for tpl in DEFAULT_TEMPLATES:
        template_id = str(uuid.uuid4())
        data = {
            "id":          template_id,
            "name":        tpl["name"],
            "icon":        tpl["icon"],
            "description": tpl["description"],
            "content":     tpl["content"],
        }
        path = get_templates_dir() / f"{template_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# 모듈 임포트 시 한 번 실행 (서버 시작 시 자동 시드)
# Python으로 치면: if __name__ == '__main__': seed_default_templates()
_seed_default_templates()


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
# Python으로 치면: def get_templates(): return [json.load(f) for f in get_templates_dir().glob('*.json')]
# -----------------------------------------------
@router.get("/templates")
def get_templates():
    """vault/_templates/ 폴더의 모든 .json 파일을 읽어 반환"""
    templates = []
    for f in sorted(get_templates_dir().glob("*.json")):
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
    path = get_templates_dir() / f"{template_id}.json"
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
    path = get_templates_dir() / f"{template_id}.json"
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
    path = get_templates_dir() / f"{template_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    path.unlink()
    return {"ok": True}
