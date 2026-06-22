# 13. Backend — FastAPI 서버

> Python FastAPI 백엔드. 파일 시스템 기반 vault 저장소.
> 실행: `uvicorn backend.main:app --port 8000`
> Electron 패키징 시: PyInstaller로 `backend.exe` 빌드.

---

## [backend/main.py](../backend/main.py)

**역할:** FastAPI 앱 생성, 미들웨어 설정, 라우터 등록, 정적 파일 서빙.

### 구성

| 항목 | 내용 |
|------|------|
| 앱 | `FastAPI(title="노션 클론 백엔드", version="2.0.0")` |
| CORS | `localhost:3000` + `127.0.0.1:3000` 허용 |
| 정적 파일 | `/static/{path}` → 현재 활성 vault에서 동적으로 서빙 |
| 로깅 | `MemoryLogHandler` — uvicorn access/error 로그 100개 보관 |

### 등록된 라우터

| 라우터 | 설명 |
|--------|------|
| `pages` | 페이지 CRUD |
| `categories` | 카테고리 CRUD |
| `export_import` | 내보내기/가져오기 |
| `search` | 전문 검색 |
| `system` | vault 경로, 디버그 로그 |
| `templates` | 기본 템플릿 CRUD |
| `ai` | AI 텍스트 생성 |
| `trash` | 휴지통 |
| `history` | 버전 히스토리 |
| `cloud_sync` | Google Drive / OneDrive OAuth 및 vault 동기화 |
| `planner` | Day Planner 아카이브·루틴 영속화 |

### PyInstaller 진입점

```python
if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8000)
```
`backend.spec` hiddenimports에 `backend.core`, `backend.routers.X` 형태로 반드시 추가.

---

## [backend/core.py](../backend/core.py)

**역할:** 공유 상수, 보안 검증, Pydantic 모델, 헬퍼 함수 모음. 모든 라우터가 import.

### 주요 상수

| 상수 | 값 | 설명 |
|------|-----|------|
| `get_vault_dir()` | 활성 vault 경로 | `vault_config.json` 및 멀티 vault 설정을 반영해 동적으로 반환 |
| `CONFIG_FILE` | `_APP_BASE/vault_config.json` | 사용자 지정 vault 경로 설정 파일 |
| `CONTENT_EXT` | `'.nct'` | 페이지 파일 확장자 (내부는 UTF-8 JSON) |
| `INDEX_FILE` | 활성 vault의 `_index.nct` | 페이지 순서/카테고리 인덱스 |
| `ALLOWED_IMAGE_EXTS` | `.jpg .jpeg .png .gif .webp .svg .bmp` | 이미지 업로드 화이트리스트 |
| `MAX_IMAGE_SIZE` | 20MB | 이미지 크기 제한 |
| `ALLOWED_VIDEO_EXTS` | `.mp4 .webm .ogg .mov .avi .mkv` | 비디오 업로드 화이트리스트 |
| `MAX_VIDEO_SIZE` | 500MB | 비디오 크기 제한 |
| `ALLOWED_FILE_EXTS` | `.pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .csv .json .zip .rar .7z` | 일반 파일 화이트리스트 |
| `MAX_FILE_SIZE` | 100MB | 일반 파일 크기 제한 |

### 보안 함수

| 함수 | 설명 |
|------|------|
| `validate_uuid(value, label)` | UUID 형식 불일치 시 HTTP 400 (경로 트래버설 차단) |
| `assert_inside_vault(path)` | `resolve()` 후 `VAULT_DIR` 하위 여부 확인 (폴더 탈출 방지) |

### Pydantic 모델 (요청/응답 스키마)

| 모델 | 설명 |
|------|------|
| `BlockModel` | `{ id, type, content, createdAt, updatedAt, ...extra }` — `extra='allow'`로 추가 필드 보존 |
| `PageModel` | `{ id, title, icon, cover, coverPosition, tags, starred, blocks, properties, createdAt, updatedAt, ...extra }` |
| `CreatePageBody` | `{ title='새 페이지', icon='📝', categoryId? }` |
| `CreateCategoryBody` | `{ name, parentId? }` |
| `RenameCategoryBody` | `{ name }` |
| `MoveCategoryBody` | `{ categoryId? }` |
| `MoveFolderBody` | `{ parentId? }` |
| `UpdateCategoryColorBody` | `{ color? }` |
| `CategoryReorderBody` | `{ order: list[str] }` |
| `PageReorderBody` | `{ order: list[str] }` |
| `ImportBody` | `{ data: dict }` |
| `TrashRestoreBody` | `{ itemType: 'page'\|'category' }` |
| `TrashPermanentDeleteBody` | `{ itemType: 'page'\|'category' }` |

### 헬퍼 함수 (일부)

| 함수 | 설명 |
|------|------|
| `MemoryLogHandler` | `deque(maxlen=100)` 로그 핸들러. `emit(record)` → dict 저장 |
| `get_vault_dir()` | 활성 vault 경로 반환. vault 전환 시에도 현재 경로를 사용 |
| `load_index()` | `_index.nct` (없으면 `_index.json` fallback) 파싱 → `{ pages, categories, pageOrder }` |
| `save_index(data)` | `_index.nct` 원자적 저장 (`tempfile` + `shutil.move`) |
| `load_page(page_id)` | `{uuid}/{uuid}.nct` 파싱 → `dict` |
| `save_page_to_disk(page)` | 페이지 JSON → `.nct` 저장 |
| `get_page_dir(page_id)` | 인덱스의 폴더 매핑을 반영한 페이지 폴더 경로 반환 |
| `now_iso()` | 현재 ISO 8601 타임스탬프 |
| `sanitize_*` | 파일명 sanitize + `^\.+$` 패턴 차단 (`..` 폴더명 방지) |

---

## [backend/routers/pages.py](../backend/routers/pages.py)

**역할:** 페이지 CRUD + 이미지/비디오/파일 업로드 + 페이지 순서/카테고리 변경 API.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/pages` | 전체 페이지+카테고리+순서 반환 |
| `POST` | `/api/pages` | 새 페이지 생성 (`CreatePageBody`) |
| `GET` | `/api/pages/{page_id}` | 단일 페이지 조회 |
| `PUT` | `/api/pages/{page_id}` | 페이지 저장 (upsert). 제목 변경 시 폴더 rename 처리 |
| `DELETE` | `/api/pages/{page_id}` | 페이지 소프트 삭제 (휴지통 이동) |
| `PATCH` | `/api/current` | 현재 페이지 ID 서버 저장 |
| `POST` | `/api/pages/{page_id}/images` | 이미지 업로드 → URL 반환 |
| `POST` | `/api/pages/{page_id}/videos` | 비디오 업로드 → URL 반환 |
| `POST` | `/api/pages/{page_id}/files` | 일반 파일 업로드 → `{ url, name, size, ext }` |
| `PATCH` | `/api/pages/{page_id}/category` | 페이지 카테고리 이동 |
| `PATCH` | `/api/pages/reorder` | 페이지 순서 변경 |

---

## [backend/routers/categories.py](../backend/routers/categories.py)

**역할:** 카테고리(폴더) CRUD + 순서/부모 변경 + 색상 변경.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/categories` | 전체 카테고리 목록 조회 |
| `POST` | `/api/categories` | 카테고리 생성 (`CreateCategoryBody`) |
| `PUT` | `/api/categories/{cat_id}` | 이름 변경 |
| `DELETE` | `/api/categories/{cat_id}` | 삭제 (내용 있으면 400) |
| `PATCH` | `/api/categories/reorder` | 최상위 카테고리 순서 변경 |
| `PATCH` | `/api/categories/{cat_id}/reorder-children` | 하위 폴더 순서 변경 |
| `PATCH` | `/api/categories/{cat_id}/move` | 폴더를 다른 부모로 이동 |
| `PATCH` | `/api/categories/{cat_id}/color` | 폴더 색상 변경 |

---

## [backend/routers/export_import.py](../backend/routers/export_import.py)

**역할:** JSON 백업 내보내기/가져오기 + 마크다운 ZIP 내보내기.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/export/json` | 전체 vault → JSON 파일 다운로드 |
| `GET` | `/api/export/markdown` | 전체 vault → 마크다운 ZIP 다운로드 |
| `GET` | `/api/export/html/{page_id}` | 페이지 HTML 내보내기 |
| `GET` | `/api/export/pdf/{page_id}` | 페이지 PDF 내보내기 |
| `POST` | `/api/import` | JSON 백업 전체 복구 (`ImportBody`) |
| `POST` | `/api/import/merge` | 백업 또는 vault 폴더 데이터 병합 |

---

## [backend/routers/search.py](../backend/routers/search.py)

**역할:** 페이지 전문 검색 API. 제목 + 블록 내용 서버 사이드 필터링.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/search?q={query}` | 검색어로 페이지 필터링 → `SearchResult[]` 반환 (`pageId`, `title`, `snippet`) |

---

## [backend/routers/system.py](../backend/routers/system.py)

**역할:** vault 경로 정보 조회/변경 + 디버그 로그 조회.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/settings/vault-info` | 현재 vault와 탐지된 vault 목록·용량 정보 |
| `GET` | `/api/settings/vault-path` | 현재 vault 경로 조회 |
| `POST` | `/api/settings/switch-vault` | vault 전환 후 현재 저장소 변경 |
| `POST` | `/api/settings/vaults-root` | vault root 변경 |
| `POST` | `/api/settings/vault-path` | 데이터 이동 옵션을 포함한 고급 경로 변경 |
| `GET` | `/api/settings/browse-folder` | 폴더 선택 경로 조회 |
| `POST` | `/api/settings/scan-vault` | 외부에서 추가된 페이지 폴더 스캔 |
| `GET` | `/api/debug/logs` | 메모리 로그 100개 반환 (`LogEntry[]`) |

---

## [backend/routers/templates.py](../backend/routers/templates.py)

**역할:** 사용자 정의 템플릿 CRUD. vault 내 `_templates/` 폴더에 `.nct` 파일로 저장.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/templates` | 전체 템플릿 목록 |
| `POST` | `/api/templates` | 템플릿 생성 |
| `PUT` | `/api/templates/{id}` | 템플릿 수정 |
| `DELETE` | `/api/templates/{id}` | 템플릿 삭제 |

---

## [backend/routers/ai.py](../backend/routers/ai.py)

**역할:** AI 텍스트 생성 엔드포인트. OpenAI / Claude / Ollama 3종 SSE 스트리밍 지원.

### Pydantic 스키마

| 스키마 | 필드 | 설명 |
|--------|------|------|
| `AIGenerateRequest` | `provider, model, api_key, base_url?, prompt, context` | 생성 요청 |
| `AITestRequest` | `provider, model, api_key, base_url?` | 연결 테스트 요청 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `SYSTEM_MSG` | 기본 AI 역할 지시문 ("결과물만 출력하고 설명은 생략하세요") |

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/api/ai/generate` | 단일 생성 요청 |
| `POST` | `/api/ai/stream` | SSE 스트리밍 텍스트 생성. 프론트에서 `ReadableStream`으로 수신 |
| `POST` | `/api/ai/test` | 연결 테스트 (`"안녕하세요"` 요청 → 성공/실패) |

---

## [backend/routers/history.py](../backend/routers/history.py)

**역할:** 페이지 버전 히스토리. 3분 간격 스냅샷, 최대 50개. 파일명에 하이픈 사용 (Windows 호환).

### 파일 저장 위치

```
{page_dir}/_history/2026-03-17T11-17-22.nct
```

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/pages/{page_id}/history` | 버전 목록 (`HistoryVersion[]`) — 최신순 |
| `GET` | `/api/pages/{page_id}/history/{filename}` | 특정 버전 전체 데이터 (미리보기) |
| `POST` | `/api/pages/{page_id}/history/restore/{filename}` | 해당 버전으로 복원 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `save_snapshot(page_data, page_dir)` | 3분 경과 여부 확인 → 스냅샷 저장. 50개 초과 시 오래된 것 삭제 |

---

## [backend/routers/trash.py](../backend/routers/trash.py)

**역할:** `_vault_trash/` 실물 폴더 기반 휴지통 API. 삭제 시 페이지/카테고리 폴더를 이동하고, 레거시 `isTrashed` 데이터는 시작 시 마이그레이션한다.

### 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/trash` | 휴지통 항목 목록 (`TrashItem[]`) |
| `PATCH` | `/api/trash/{item_id}/restore` | 항목 복원 |
| `DELETE` | `/api/trash/{item_id}` | 영구 삭제 |
| `DELETE` | `/api/trash` | 휴지통 전체 비우기 |

---

## [backend/routers/planner.py](../backend/routers/planner.py)

**역할:** Day Planner의 루틴과 90일 초과 일정 아카이브를 활성 vault 파일에 영속화.

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/planner/archive` | `{ date: PlanEvent[] }` 아카이브 반환 |
| `POST` | `/api/planner/archive` | 새 날짜 키만 추가 병합 |
| `GET` | `/api/planner/routines` | 루틴 목록 반환 |
| `PUT` | `/api/planner/routines` | 루틴 목록 전체 교체 저장 |

---

## [backend/routers/cloud_sync.py](../backend/routers/cloud_sync.py)

**역할:** Google Drive·OneDrive OAuth 2.0 연결과 활성 vault ZIP 업로드/다운로드.

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/api/cloud/status` | 제공자별 연결·설정 상태 |
| `POST` | `/api/cloud/config` | OAuth 클라이언트 설정 저장 |
| `GET` | `/api/cloud/{provider}/auth-url` | OAuth 인증 URL 생성 |
| `GET` | `/api/cloud/{provider}/callback` | OAuth 콜백 처리 |
| `POST` | `/api/cloud/{provider}/upload` | 활성 vault 업로드 |
| `POST` | `/api/cloud/{provider}/download` | vault 다운로드·복원 |
| `DELETE` | `/api/cloud/{provider}/disconnect` | 연결 해제 |

OAuth 리다이렉트 URI는 백엔드 바인딩과 같은 `http://127.0.0.1:8000/api/cloud/{provider}/callback`을 등록해야 한다.
