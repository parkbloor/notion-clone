# _vault_trash 실물 폴더 휴지통 리팩터 계획서

작성일: 2026-04-03  
목표: `isTrashed` 플래그 방식 → 실제 파일 이동 방식으로 전면 교체

---

## 1. 현재 구조의 문제점

```
vault/
  _index.nct           ← 모든 메타데이터 (isTrashed 플래그 포함)
  <page-folder>/       ← 삭제된 페이지도 그대로 여기 존재
  <cat-folder>/        ← 삭제된 폴더도 그대로 여기 존재
```

- **문제**: `isTrashed=True`로 표시만 하고 파일은 안 움직임
- **결과**: 볼트 스캔(`auto_discover_new_folders`) 시 삭제된 항목이 다시 살아날 수 있음
- **추가 문제**: `_index.nct`가 손상/분실되면 휴지통 정보도 함께 소실

---

## 2. 새 구조

```
vault/
  _vault_trash/
    index.json          ← 휴지통 전용 메타 (원본경로, 삭제일시 등)
    <page-folder>/      ← 이동된 페이지 폴더 (원본 그대로)
    <cat-folder>/       ← 이동된 카테고리 폴더 (하위 페이지 포함)
  _index.nct            ← 활성 항목만 관리 (isTrashed 필드 사라짐)
  <active-page>/        ← 활성 페이지만 존재
  <active-cat>/         ← 활성 카테고리만 존재
```

### 핵심 원칙
1. `_vault_trash/`는 언더스코어 시작 → `auto_discover_new_folders`가 자동 스킵
2. `_index.nct`는 활성 항목만 — 더 이상 `isTrashed` 필드 없음
3. 휴지통 메타는 `_vault_trash/index.json`이 단독 관리

---

## 3. `_vault_trash/index.json` 스키마

### 페이지 단독 삭제 항목
```json
{
  "id": "<page-uuid>",
  "type": "page",
  "groupId": null,
  "trashedAt": "2026-04-03T12:00:00Z",
  "title": "페이지 제목",
  "icon": "📄",
  "folderName": "<페이지 폴더명>",
  "trashedFolderName": "<_vault_trash 안에서의 실제 폴더명>",
  "originalCategoryId": "<cat-uuid | null>",
  "originalCategoryFolderName": "<cat-folder-name | null>"
}
```

### 카테고리(폴더째) 삭제 항목
```json
{
  "id": "<cat-uuid>",
  "type": "category",
  "groupId": "<group-uuid>",
  "trashedAt": "2026-04-03T12:00:00Z",
  "name": "폴더명",
  "icon": null,
  "color": null,
  "folderName": "<원본 폴더명>",
  "trashedFolderName": "<_vault_trash 안에서의 실제 폴더명>",
  "originalParentId": "<parent-cat-uuid | null>",
  "originalParentFolderName": "<parent-folder-name | null>",
  "children": [
    {
      "type": "category",
      "id": "...", "name": "...", "folderName": "...",
      "originalParentId": "..."
    },
    {
      "type": "page",
      "id": "...", "title": "...", "icon": "...",
      "folderName": "...", "originalCategoryId": "..."
    }
  ]
}
```

> `trashedFolderName` 필드: 이름 충돌 시 실제 저장된 이름이 다를 수 있어 별도 보관

---

## 4. 충돌 처리 규칙

### 트래시로 이동 시 (원본 → `_vault_trash/`)
```
_vault_trash/my-folder/  이미 존재하면
→ my-folder_1/ 시도
→ my-folder_2/ 시도
→ 성공할 때까지 반복
trashedFolderName 에 실제 사용된 이름 저장
```

### 복원 시 (`_vault_trash/` → 원본 위치)
```
원본 위치에 같은 이름 폴더가 이미 존재하면
→ <folder-name>_1/ 시도
→ <folder-name>_2/ 시도
→ 성공할 때까지 반복
```

---

## 5. 삭제 플로우 상세

### 5-1. 페이지 단독 삭제 (`DELETE /api/pages/{page_id}`)

```
현재 위치 파악:
  folder_name = folderMap[page_id]
  cat_id = categoryMap.get(page_id)
  cat_folder = categories[cat_id].folderName  if cat_id else None

원본 경로 결정:
  if cat_folder:  src = vault/<cat_folder>/<folder_name>
  else:           src = vault/<folder_name>

_vault_trash 준비:
  ensure vault/_vault_trash/ exists

이름 충돌 해결:
  dst_name = folder_name
  while (_vault_trash/dst_name).exists():
      dst_name = dst_name + "_1" (또는 _2, _3 ...)

이동:
  shutil.move(src, _vault_trash/dst_name)

index.json 업데이트:
  entries.append({
    id, type:"page", groupId:null, trashedAt,
    title, icon, folderName, trashedFolderName: dst_name,
    originalCategoryId, originalCategoryFolderName
  })
  save_trash_index(entries)

_index.nct 정리:
  pageOrder에서 제거
  folderMap에서 제거
  categoryMap에서 제거
  pages 배열에서 완전 제거 (isTrashed 표시가 아닌 삭제)
  save_index(index)
```

### 5-2. 카테고리(폴더) 삭제 (`DELETE /api/categories/{cat_id}`)

```
폴더 내 모든 페이지·하위카테고리 수집 (재귀)
  collect_all_children(cat_id) → {pages: [...], cats: [...]}

원본 폴더 경로:
  src = vault/<cat.folderName>

이름 충돌 해결 + 이동:
  dst_name 결정 (위와 동일)
  shutil.move(src, _vault_trash/dst_name)

index.json 업데이트:
  entries.append({
    id: cat_id, type:"category", groupId: new_uuid,
    trashedAt, name, icon, color,
    folderName, trashedFolderName: dst_name,
    originalParentId, originalParentFolderName,
    children: [  ← 하위 카테고리 + 페이지 메타 (복원에 필요)
      {type, id, name/title, icon, folderName, originalCategoryId/originalParentId},
      ...
    ]
  })

_index.nct 정리:
  해당 카테고리 + 모든 하위 카테고리 → categories 배열에서 완전 제거
  해당 카테고리 내 모든 페이지 → pageOrder, folderMap, categoryMap, pages에서 완전 제거
  categoryOrder / categoryChildOrder에서 제거
  save_index(index)
```

---

## 6. 복원 플로우 상세

### 6-1. 페이지 복원 (`PATCH /api/trash/{item_id}/restore`)

```
entry = trash_index.find(id == item_id, type == "page")

원본 위치 결정:
  원본 카테고리가 현재 _index.nct에 존재하는지 확인
  if exists:
    dst_parent = vault/<originalCategoryFolderName>
  else:
    dst_parent = vault/  (미분류로 복원)
    originalCategoryId = null

이름 충돌 해결:
  dst_name = entry.folderName
  while (dst_parent/dst_name).exists():
      dst_name = dst_name + "_1"

이동:
  shutil.move(_vault_trash/<trashedFolderName>, dst_parent/dst_name)

_index.nct 복원:
  folderMap[page_id] = dst_name
  categoryMap[page_id] = originalCategoryId (또는 null)
  pageOrder.append(page_id)
  pages.append({id, title, icon, ...})  ← isTrashed 없이 깔끔하게
  save_index(index)

trash index.json:
  해당 항목 제거
  save_trash_index(entries)
```

### 6-2. 카테고리 복원 (`PATCH /api/trash/{item_id}/restore`)

```
entry = trash_index.find(id == item_id, type == "category")

원본 부모 카테고리 확인:
  if originalParentId in active_cats:
    dst_parent = vault/<originalParentFolderName>
  else:
    dst_parent = vault/  (최상위로 복원)

이름 충돌 해결 + 이동:
  dst_name = entry.folderName
  while (dst_parent/dst_name).exists():
      dst_name = dst_name + "_1"
  shutil.move(_vault_trash/<trashedFolderName>, dst_parent/dst_name)

_index.nct 복원:
  카테고리 재등록: categories.append({id, name, folderName:dst_name, parentId, ...})
  categoryOrder / categoryChildOrder 갱신
  entry.children 순회:
    하위 카테고리 재등록
    하위 페이지 재등록 (folderMap, categoryMap, pageOrder)
  save_index(index)

trash index.json:
  해당 항목 제거
```

---

## 7. 영구 삭제 플로우

### 단일 항목 영구 삭제 (`DELETE /api/trash/{item_id}`)

```
entry = trash_index.find(id == item_id)
trash_path = vault/_vault_trash/<entry.trashedFolderName>
assert_inside_vault(trash_path)
shutil.rmtree(trash_path)
trash index.json에서 제거
```

### 전체 비우기 (`DELETE /api/trash`)

```
모든 entries 순회:
  trash_path = vault/_vault_trash/<entry.trashedFolderName>
  shutil.rmtree(trash_path)  ← 존재하면
trash index.json → [] 로 초기화
```

---

## 8. 백엔드 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `backend/core.py` | `get_trash_dir()`, `load_trash_index()`, `save_trash_index()`, `_resolve_trash_name()` 헬퍼 4개 추가 |
| `backend/routers/pages.py` | `delete_page()` — 플래그 대신 실제 이동 + `_index.nct`에서 완전 제거 |
| `backend/routers/categories.py` | `delete_category()` — 폴더째 이동 + `_index.nct`에서 완전 제거 |
| `backend/routers/trash.py` | 전면 재작성 — `_vault_trash/index.json` 기반으로 목록/복원/삭제 |
| `backend/backend.spec` | 변경 없음 |

---

## 9. 프론트엔드 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/types/block.ts` | `TrashItem` 타입 업데이트 (`trashedFolderName`, `originalCategoryFolderName` 등 추가). `Category` 인터페이스에서 `isTrashed`, `trashedAt`, `trashGroupId` 제거 |
| `src/components/editor/TrashPanel.tsx` | `OriginLabel` — `originalCategoryFolderName` 기반으로 수정. 그 외 UI 변경 없음 |
| `src/store/pageStore.ts` | `Category` 상태에서 `isTrashed` 관련 필드 제거 |
| `src/lib/api.ts` | 변경 없음 (API 엔드포인트 동일) |

---

## 10. 헬퍼 함수 설계 (`core.py` 추가)

```python
def get_trash_dir() -> Path:
    """_vault_trash 폴더 경로 반환 + 없으면 생성"""
    d = get_vault_dir() / "_vault_trash"
    d.mkdir(exist_ok=True)
    return d

def load_trash_index() -> list[dict]:
    """_vault_trash/index.json 로드 (없으면 빈 리스트)"""
    f = get_trash_dir() / "index.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return []

def save_trash_index(entries: list[dict]) -> None:
    """_vault_trash/index.json 원자적 저장"""
    f = get_trash_dir() / "index.json"
    _atomic_write(f, json.dumps(entries, ensure_ascii=False, indent=2))

def resolve_trash_name(base_name: str, target_dir: Path) -> str:
    """
    target_dir 안에서 충돌 없는 이름 반환
    my-folder → my-folder_1 → my-folder_2 → ...
    Python으로 치면: while (target/name).exists(): name += '_N'
    """
    name = base_name
    counter = 1
    while (target_dir / name).exists():
        name = f"{base_name}_{counter}"
        counter += 1
    return name
```

---

## 11. 기존 데이터 마이그레이션

기존 볼트에 `isTrashed=True` 항목이 남아있을 수 있음.

**전략: 서버 시작 시 자동 마이그레이션**
- `main.py`의 startup 이벤트에서 `migrate_legacy_trash()` 호출
- `isTrashed=True` 항목을 `_vault_trash/`로 물리 이동
- 이동 후 `_index.nct`에서 해당 필드 정리

```python
def migrate_legacy_trash():
    """
    _index.nct의 isTrashed=True 항목을 _vault_trash/로 이동
    최초 1회 실행 후 불필요 (마이그레이션 플래그로 관리)
    """
    index = load_index()
    if index.get("_trashMigrated"):
        return  # 이미 마이그레이션 완료
    
    trash_entries = load_trash_index()
    changed = False
    
    for page in index.get("pages", []):
        if not page.get("isTrashed"):
            continue
        # 물리 파일이 있으면 이동, 없으면 메타만 정리
        # ... (실제 이동 로직)
        changed = True
    
    if changed:
        index["_trashMigrated"] = True
        save_index(index)
        save_trash_index(trash_entries)
```

---

## 12. 구현 순서

1. **`core.py`** — 헬퍼 4개 추가 (독립적, 먼저 구현)
2. **`routers/trash.py`** — 새 index.json 기반 목록/복원/삭제 (core 헬퍼에 의존)
3. **`routers/pages.py`** — `delete_page()` 이동 방식으로 교체 (trash 구조에 의존)
4. **`routers/categories.py`** — `delete_category()` 이동 방식으로 교체
5. **`main.py`** — `migrate_legacy_trash()` startup 연결
6. **`src/types/block.ts`** — `TrashItem` 타입 업데이트
7. **`src/store/pageStore.ts`** — `Category` isTrashed 필드 제거
8. **`src/components/editor/TrashPanel.tsx`** — `OriginLabel` 수정

---

## 13. 엣지 케이스 처리

| 케이스 | 처리 방법 |
|--------|-----------|
| 물리 파일이 이미 없는 페이지 삭제 | 이동 생략, 메타만 `_vault_trash/index.json`에 기록 |
| 복원 시 원본 카테고리 폴더 없음 | vault 루트에 복원 (미분류) |
| `_vault_trash/index.json` 손상 | 빈 배열로 초기화, 물리 폴더는 유지 |
| 같은 페이지를 두 번 삭제 시도 | `_index.nct`에 없으면 404 반환 |
| 하위 카테고리가 있는 폴더 삭제 | `shutil.move`가 폴더 통째로 이동 → 자동 처리 |
| 볼트 간 이동 (다른 드라이브) | `shutil.move`가 복사+삭제로 처리 → 자동 처리 |

---

## 14. 테스트 체크리스트

- [ ] 미분류 페이지 삭제 → `_vault_trash/<folder>/` 생성 확인
- [ ] 카테고리 내 페이지 삭제 → `_vault_trash/<folder>/` 이동, 카테고리 폴더는 유지
- [ ] 카테고리(폴더) 삭제 → `_vault_trash/<cat-folder>/` 통째 이동
- [ ] 삭제 후 볼트 스캔 → 삭제 항목 재출현 없음
- [ ] 페이지 복원 → 원위치 복귀, `_vault_trash/`에서 제거
- [ ] 복원 시 이름 충돌 → `_1` 접미사 붙어 복원
- [ ] 카테고리 복원 → 원래 부모에 복귀, 하위 페이지 모두 재등록
- [ ] 원본 카테고리 삭제 후 페이지 복원 → vault 루트에 복원
- [ ] 영구 삭제 → `_vault_trash/<folder>` 물리 삭제
- [ ] 전체 비우기 → `_vault_trash/` 내 모든 폴더 삭제, `index.json` 초기화
- [ ] 기존 `isTrashed` 항목 → 서버 시작 시 자동 마이그레이션
