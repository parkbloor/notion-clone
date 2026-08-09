# ==============================================
# backend/routers/vault_preferences.py
# 역할: 현재 볼트에 종속되는 화면 진입점 표시 설정
# 저장 파일: {VAULT_DIR}/_vault_preferences.json
# ==============================================

import json
import os

from fastapi import APIRouter
from pydantic import BaseModel

from backend.core import get_vault_dir


router = APIRouter(prefix="/api/vault-preferences", tags=["vault-preferences"])
PREFERENCES_FILE = "_vault_preferences.json"

DEFAULT_PLANNER_FEATURES = {
    "todayShortcut": True,
    "planMenu": True,
    "reviews": True,
    "calendar": True,
    "timeline": True,
    "routines": True,
    "slashPlannerBlocks": True,
}


class PlannerFeatureUpdate(BaseModel):
    todayShortcut: bool | None = None
    planMenu: bool | None = None
    reviews: bool | None = None
    calendar: bool | None = None
    timeline: bool | None = None
    routines: bool | None = None
    slashPlannerBlocks: bool | None = None


class VaultPreferencesUpdate(BaseModel):
    planner: PlannerFeatureUpdate


def _preferences_path():
    return get_vault_dir() / PREFERENCES_FILE


def _normalized_preferences(raw: object) -> dict:
    planner_raw = raw.get("planner", {}) if isinstance(raw, dict) else {}
    if not isinstance(planner_raw, dict):
        planner_raw = {}
    planner = {
        key: planner_raw.get(key) if isinstance(planner_raw.get(key), bool) else default
        for key, default in DEFAULT_PLANNER_FEATURES.items()
    }
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
    updates = body.planner.model_dump(exclude_none=True)
    preferences["planner"].update(updates)
    preferences = _normalized_preferences(preferences)
    _save_preferences(preferences)
    return preferences
