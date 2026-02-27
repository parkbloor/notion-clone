# ==============================================
# backend/routers/export_import.py
# 역할: JSON 전체 내보내기, 마크다운 ZIP 내보내기, JSON 가져오기
# Python으로 치면: Flask Blueprint('export_import', ...)
# ==============================================

import io
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.core import (
    VAULT_DIR,
    ImportBody,
    assert_inside_vault,
    load_index,
    save_index,
)

# Python으로 치면: blueprint = Blueprint('export_import', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["export_import"])


# -----------------------------------------------
# 내보내기
# -----------------------------------------------

@router.get("/export/json")
def export_json():
    """
    전체 vault를 단일 JSON 파일로 내려받기
    Python으로 치면: return send_file(json_bytes, as_attachment=True)
    """
    index = load_index()
    pages_data = []

    # 모든 페이지 content.json 수집 (folderMap 기반)
    # Python으로 치면: for page_id in pageOrder: pages.append(load(folder))
    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {c["id"]: c["folderName"] for c in index.get("categories", [])}

    for page_id in index.get("pageOrder", []):
        folder_name = folder_map.get(page_id)
        if not folder_name:
            continue

        cat_id = category_map.get(page_id)
        cat_folder = categories.get(cat_id) if cat_id else None

        if cat_folder:
            content_path = VAULT_DIR / cat_folder / folder_name / "content.json"
        else:
            content_path = VAULT_DIR / folder_name / "content.json"

        if content_path.exists():
            pages_data.append(json.loads(content_path.read_text(encoding="utf-8")))

    export_obj = {
        "exportedAt": datetime.now().isoformat(),
        "version": "2.0",
        "index": index,
        "pages": pages_data,
    }

    json_bytes = json.dumps(export_obj, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"notion-clone-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/markdown")
def export_markdown():
    """
    전체 vault를 마크다운 ZIP으로 내려받기
    Python으로 치면: zipfile.write(md_content); return send_file(zip)
    """
    index = load_index()
    zip_buffer = io.BytesIO()

    def blocks_to_markdown(blocks: list) -> str:
        """블록 배열 → 마크다운 텍스트 변환"""
        lines = []
        for block in blocks:
            btype = block.get("type", "paragraph")
            content = block.get("content", "")

            if btype == "heading1":
                lines.append(f"# {content}")
            elif btype == "heading2":
                lines.append(f"## {content}")
            elif btype == "heading3":
                lines.append(f"### {content}")
            elif btype == "bulletList":
                lines.append(f"- {content}")
            elif btype == "orderedList":
                lines.append(f"1. {content}")
            elif btype == "taskList":
                checked = "x" if block.get("checked") else " "
                lines.append(f"- [{checked}] {content}")
            elif btype == "quote":
                lines.append(f"> {content}")
            elif btype == "code":
                lines.append(f"```\n{content}\n```")
            elif btype == "divider":
                lines.append("---")
            elif btype == "kanban":
                lines.append("[칸반 보드]")
            elif btype == "layout":
                # 레이아웃 블록: 슬롯 A→B→C 순서로 선형화 (--- 구분선 삽입)
                # Python으로 치면: for slot in ['a','b','c']: lines += blocks_to_md(slot_blocks)
                try:
                    layout_data = json.loads(content) if isinstance(content, str) else {}
                    slot_parts = []
                    for slot_id in ["a", "b", "c"]:
                        slot_blocks = layout_data.get("slots", {}).get(slot_id, [])
                        if slot_blocks:
                            slot_md = blocks_to_markdown(slot_blocks).strip()
                            if slot_md:
                                slot_parts.append(slot_md)
                    if slot_parts:
                        lines.append("\n\n---\n\n".join(slot_parts))
                    else:
                        lines.append("[레이아웃 블록]")
                except Exception:
                    lines.append("[레이아웃 블록]")
            else:
                lines.append(content)
            lines.append("")  # 빈 줄 구분
        return "\n".join(lines)

    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {c["id"]: c["folderName"] for c in index.get("categories", [])}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for page_id in index.get("pageOrder", []):
            folder_name = folder_map.get(page_id)
            if not folder_name:
                continue

            cat_id = category_map.get(page_id)
            cat_folder = categories.get(cat_id) if cat_id else None

            if cat_folder:
                content_path = VAULT_DIR / cat_folder / folder_name / "content.json"
                zip_path = f"{cat_folder}/{folder_name}.md"
            else:
                content_path = VAULT_DIR / folder_name / "content.json"
                zip_path = f"{folder_name}.md"

            if not content_path.exists():
                continue

            page_data = json.loads(content_path.read_text(encoding="utf-8"))
            title = page_data.get("title", "제목 없음")
            blocks = page_data.get("blocks", [])

            md_lines = [f"# {title}", ""]
            md_lines.append(blocks_to_markdown(blocks))
            md_content = "\n".join(md_lines)
            zf.writestr(zip_path, md_content.encode("utf-8"))

    zip_buffer.seek(0)
    filename = f"notion-clone-markdown-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# -----------------------------------------------
# 가져오기
# -----------------------------------------------

@router.post("/import")
def import_json(body: ImportBody):
    """
    JSON 백업에서 vault 복구
    Python으로 치면: shutil.rmtree(vault); restore(backup_data)

    주의: 기존 vault를 완전히 덮어씀
    """
    data = body.data
    new_index = data.get("index", {})
    pages_list = data.get("pages", [])

    # 기존 vault 백업 (rollback 가능하도록)
    backup_dir = VAULT_DIR.parent / f"vault_bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if VAULT_DIR.exists():
        shutil.copytree(str(VAULT_DIR), str(backup_dir))

    try:
        # vault 초기화 (이미지 제외)
        for item in VAULT_DIR.iterdir():
            if item.name == "_index.json":
                continue
            if item.is_dir():
                shutil.rmtree(str(item))

        # index 저장
        save_index(new_index)

        # 각 페이지 content.json 복구 (folderMap 기반)
        folder_map = new_index.get("folderMap", {})
        category_map = new_index.get("categoryMap", {})
        categories = {c["id"]: c.get("folderName", "") for c in new_index.get("categories", [])}

        for page_data in pages_list:
            page_id = page_data.get("id", "")
            folder_name = folder_map.get(page_id, page_data.get("folder", ""))
            if not folder_name:
                continue

            cat_id = category_map.get(page_id)
            cat_folder = categories.get(cat_id) if cat_id else None

            if cat_folder:
                target_dir = VAULT_DIR / cat_folder / folder_name
            else:
                target_dir = VAULT_DIR / folder_name

            # 🔒 vault 탈출 방지
            assert_inside_vault(target_dir)

            target_dir.mkdir(parents=True, exist_ok=True)
            (target_dir / "content.json").write_text(
                json.dumps(page_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        # 임시 백업 삭제 (성공 시)
        if backup_dir.exists():
            shutil.rmtree(str(backup_dir))

        return {"ok": True, "imported": len(pages_list)}

    except HTTPException:
        # 보안 예외는 그대로 전파 (vault 복구 후)
        if backup_dir.exists():
            shutil.rmtree(str(VAULT_DIR))
            shutil.copytree(str(backup_dir), str(VAULT_DIR))
            shutil.rmtree(str(backup_dir))
        raise

    except Exception as exc:
        # 실패 시 백업에서 롤백
        if backup_dir.exists():
            shutil.rmtree(str(VAULT_DIR))
            shutil.copytree(str(backup_dir), str(VAULT_DIR))
            shutil.rmtree(str(backup_dir))
        raise HTTPException(status_code=500, detail=str(exc)) from exc
