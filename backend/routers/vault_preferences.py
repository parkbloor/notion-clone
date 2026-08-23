# ==============================================
# backend/routers/vault_preferences.py
# 역할: 현재 볼트에 종속되는 화면 진입점 표시 설정
# 저장 파일: {VAULT_DIR}/_vault_preferences.json
# ==============================================

import json
import os
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import get_vault_dir


router = APIRouter(prefix="/api/vault-preferences", tags=["vault-preferences"])
PREFERENCES_FILE = "_vault_preferences.json"

DEFAULT_PLANNER_FEATURES = {
    # 일반 볼트는 플래너 기능을 명시적으로 켜기 전까지 완전히 분리한다.
    "mode": "off",
    # 날짜별 일정 데이터를 한 메모 안에 모으는 일정 홈 메모의 페이지 ID다.
    "homePageId": None,
    # 일간 노트 기본 템플릿은 볼트마다 독립적으로 선택한다.
    "dailyNoteTemplate": "standard",
    # None은 기존 전역 설정을 한 번 호환해서 사용, 문자열(빈 문자열 포함)은 볼트의 명시적 선택이다.
    "dailyCustomTemplateId": None,
    "todayShortcut": True,
    "planMenu": True,
    "reviews": True,
    "calendar": True,
    "timeline": True,
    "routines": True,
    "slashPlannerBlocks": True,
    # 포스트잇 분류함은 현재 볼트의 페이지 ID만 보관한다. 비어 있으면 UI도 표시하지 않는다.
    "captureDestinations": [],
}


class CaptureDestination(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    pageId: str = Field(min_length=1, max_length=128)
    kind: Literal["task", "note"]


class PlannerFeatureUpdate(BaseModel):
    mode: Literal["off", "daily"] | None = None
    homePageId: str | None = None
    dailyNoteTemplate: Literal["standard", "postit", "diary"] | None = None
    dailyCustomTemplateId: str | None = None
    todayShortcut: bool | None = None
    planMenu: bool | None = None
    reviews: bool | None = None
    calendar: bool | None = None
    timeline: bool | None = None
    routines: bool | None = None
    slashPlannerBlocks: bool | None = None
    # 빈 배열은 분류함을 비우는 명시적인 요청이다.
    captureDestinations: list[CaptureDestination] | None = None


class VaultPreferencesUpdate(BaseModel):
    planner: PlannerFeatureUpdate


def _preferences_path():
    return get_vault_dir() / PREFERENCES_FILE


def _normalized_capture_destinations(value: object) -> list[dict]:
    """손상된 설정은 버리고, 같은 페이지를 두 번 목적지로 연결하지 않는다."""
    if not isinstance(value, list):
        return []

    destinations: list[dict] = []
    destination_ids: set[str] = set()
    page_ids: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        destination_id = item.get("id")
        page_id = item.get("pageId")
        kind = item.get("kind")
        if (
            not isinstance(destination_id, str)
            or not isinstance(page_id, str)
            or kind not in {"task", "note"}
        ):
            continue
        destination_id = destination_id.strip()
        page_id = page_id.strip()
        if (
            not destination_id
            or not page_id
            or len(destination_id) > 128
            or len(page_id) > 128
            or destination_id in destination_ids
            or page_id in page_ids
        ):
            continue
        destinations.append({"id": destination_id, "pageId": page_id, "kind": kind})
        destination_ids.add(destination_id)
        page_ids.add(page_id)
        # 작은 화면의 분류함이 너무 길어지지 않도록 목적지는 최대 12개만 유지한다.
        if len(destinations) == 12:
            break
    return destinations


def _normalized_preferences(raw: object) -> dict:
    planner_raw = raw.get("planner", {}) if isinstance(raw, dict) else {}
    if not isinstance(planner_raw, dict):
        planner_raw = {}
    # bool 기능 토글은 잘못된 타입을 기본값으로 되돌린다.
    # Python으로 치면: planner = {key: raw[key] if isinstance(raw[key], bool) else default}
    planner = {
        key: planner_raw.get(key) if isinstance(planner_raw.get(key), bool) else default
        for key, default in DEFAULT_PLANNER_FEATURES.items()
        if isinstance(default, bool)
    }
    mode = planner_raw.get("mode")
    planner["mode"] = mode if mode in {"off", "daily"} else DEFAULT_PLANNER_FEATURES["mode"]

    home_page_id = planner_raw.get("homePageId")
    planner["homePageId"] = home_page_id.strip() if isinstance(home_page_id, str) and home_page_id.strip() else None
    daily_note_template = planner_raw.get("dailyNoteTemplate")
    planner["dailyNoteTemplate"] = (
        daily_note_template
        if daily_note_template in {"standard", "postit", "diary"}
        else DEFAULT_PLANNER_FEATURES["dailyNoteTemplate"]
    )
    daily_custom_template_id = planner_raw.get("dailyCustomTemplateId")
    planner["dailyCustomTemplateId"] = (
        daily_custom_template_id.strip()
        if isinstance(daily_custom_template_id, str)
        else None
    )
    planner["captureDestinations"] = _normalized_capture_destinations(
        planner_raw.get("captureDestinations")
    )
    return {"planner": planner}


def _load_preferences() -> dict:
    path = _preferences_path()
    if not path.exists():
        return _normalized_preferences({})
    try:
        return _normalized_preferences(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return _normalized_preferences({})


def _save_preferences(preferences: dict) -> None:
    path = _preferences_path()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(preferences, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


@router.get("")
def get_vault_preferences():
    """현재 활성 볼트의 기능 표시 설정을 기본값과 병합해 반환한다."""
    return _load_preferences()


@router.put("")
def update_vault_preferences(body: VaultPreferencesUpdate):
    """전달된 기능만 변경하고 나머지 현재 볼트 설정은 보존한다."""
    preferences = _load_preferences()
    # exclude_unset을 써야 homePageId: null 요청으로 홈 메모 연결을 해제할 수 있다.
    # Python으로 치면: updates = body.planner.model_dump(exclude_unset=True)
    updates = body.planner.model_dump(exclude_unset=True)
    preferences["planner"].update(updates)
    preferences = _normalized_preferences(preferences)
    _save_preferences(preferences)
    return preferences
