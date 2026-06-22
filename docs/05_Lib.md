# 05. Lib — 유틸리티 / 라이브러리

> 여러 컴포넌트에서 공통으로 사용하는 순수 함수, 상수, API 클라이언트 모음.
> 이 파일들은 React에 의존하지 않는다 (컴포넌트 아님).

---

## [src/lib/api.ts](../src/lib/api.ts)

**역할:** FastAPI 백엔드(`http://127.0.0.1:8000`)와 통신하는 fetch 래퍼 함수 모음.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BASE_URL` | `const string` | FastAPI 서버 주소 `http://127.0.0.1:8000` |
| `api` | `const object` | API 함수 네임스페이스 객체 |
| `templateApi` | `const object` | 템플릿 CRUD API 네임스페이스 |
| `Template` | `interface` | 템플릿 `{ id, name, icon, description, content }` |
| `SearchResult` | `interface` | 전체 검색 결과 한 건 |
| `HistoryVersion` | `interface` | 페이지 버전 히스토리 메타데이터 |
| `historyApi` | `const object` | 페이지 버전 히스토리 API 네임스페이스 |
| `plannerApi` | `const object` | 플래너 루틴/아카이브 API 네임스페이스 |

### api 함수 목록

| 함수 | HTTP | 설명 |
|------|------|------|
| `getPages()` | `GET /api/pages` | 전체 페이지+카테고리+순서 목록 로딩 |
| `createPage(title, icon, categoryId?)` | `POST /api/pages` | 새 페이지 생성 |
| `savePage(pageId, page)` | `PUT /api/pages/:id` | 페이지 저장 (upsert). 제목 변경으로 폴더 rename 시 업데이트된 Page 반환, 아니면 null |
| `deletePage(pageId)` | `DELETE /api/pages/:id` | 페이지 소프트 삭제 |
| `setCurrentPage(pageId)` | `PATCH /api/current` | 현재 페이지 ID 서버 저장 |
| `uploadImage(pageId, file)` | `POST /api/pages/:id/images` | 이미지 업로드 → URL 반환 |
| `uploadVideo(pageId, file)` | `POST /api/pages/:id/videos` | 비디오 업로드 → URL 반환 |
| `uploadFile(pageId, file)` | `POST /api/pages/:id/files` | 일반 파일 업로드 → `{ url, name, size, ext }` 반환 |
| `createCategory(name, parentId?)` | `POST /api/categories` | 카테고리 생성 |
| `renameCategory(categoryId, name)` | `PUT /api/categories/:id` | 이름 변경 |
| `deleteCategory(categoryId)` | `DELETE /api/categories/:id` | 삭제 (내용 있으면 실패 반환) |
| `movePageToCategory(pageId, categoryId)` | `PATCH /api/pages/:id/category` | 페이지 카테고리 이동 |
| `reorderCategories(order)` | `PATCH /api/categories/reorder` | 최상위 카테고리 순서 변경 |
| `reorderChildCategories(parentId, order)` | `PATCH /api/categories/:id/reorder-children` | 하위 폴더 순서 변경 |
| `moveCategoryToParent(categoryId, parentId)` | `PATCH /api/categories/:id/move` | 폴더를 다른 부모로 이동 |
| `updateCategoryColor(categoryId, color)` | `PATCH /api/categories/:id/color` | 폴더 색상 변경. `null`이면 기본값 |
| `reorderPages(order)` | `PATCH /api/pages/reorder` | 페이지 순서 변경 |
| `searchPages(q)` | `GET /api/search?q=...` | 제목/블록 내용 전체 검색 |
| `getTrash()` | `GET /api/trash` | 휴지통 항목 목록 |
| `restoreTrashItem(itemId)` | `PATCH /api/trash/:id/restore` | 휴지통 항목 복원 |
| `permanentDeleteTrashItem(itemId)` | `DELETE /api/trash/:id` | 휴지통 항목 영구 삭제 |
| `emptyTrash()` | `DELETE /api/trash` | 휴지통 전체 비우기 |

### templateApi 함수 목록

| 함수 | HTTP | 설명 |
|------|------|------|
| `getAll()` | `GET /api/templates` | 모든 템플릿 목록 |
| `create(body)` | `POST /api/templates` | 새 템플릿 생성 |
| `update(id, body)` | `PUT /api/templates/:id` | 템플릿 수정 |
| `delete(id)` | `DELETE /api/templates/:id` | 템플릿 삭제 |

### historyApi 함수 목록

| 함수 | HTTP | 설명 |
|------|------|------|
| `list(pageId)` | `GET /api/pages/:id/history` | 페이지 버전 목록 조회 |
| `get(pageId, filename)` | `GET /api/pages/:id/history/:filename` | 특정 버전 데이터 조회 |
| `restore(pageId, filename)` | `POST /api/pages/:id/history/restore/:filename` | 특정 버전으로 복원 |

### plannerApi 함수 목록

| 함수 | HTTP | 설명 |
|------|------|------|
| `getRoutines()` | `GET /api/planner/routines` | 루틴 목록 로드 |
| `saveRoutines(routines)` | `PUT /api/planner/routines` | 루틴 목록 전체 저장 |
| `getArchive()` | `GET /api/planner/archive` | 90일 초과 플래너 기록 로드 |
| `appendArchive(archive)` | `POST /api/planner/archive` | 90일 초과 플래너 기록 병합 저장 |

### 내부 헬퍼

| 함수 | 설명 |
|------|------|
| `serializePage(page)` | Page → JSON 전송용 객체 변환 |
| `parsePage(p)` | API 응답 → `Page` 타입 정규화 (blocks 빈 배열 보장) |

---

## [src/lib/fonts.ts](../src/lib/fonts.ts)

**역할:** 에디터 폰트 프리셋 목록 및 관련 상수 정의. 버블메뉴 드롭다운과 settingsStore의 **단일 진실 공급원**.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FontCategory` | `type` | `'sans' \| 'korean' \| 'serif' \| 'mono'` |
| `FontPreset` | `interface` | `{ id, label, family, category }` |
| `FONT_PRESETS` | `FontPreset[]` | 폰트 프리셋 목록 (7개) |
| `DEFAULT_FONT_ID` | `const string` | 기본 폰트 ID = `'noto-sans'` |
| `getFontPreset(id)` | `function` | id로 FontPreset 조회. 없으면 첫 번째 반환 |
| `CATEGORY_LABELS` | `const` | 폰트 카테고리 → UI 레이블 매핑 |
| `FONT_SIZE_PRESETS` | `const` | 글자 크기 프리셋 목록 `[{value: 12, label: '12px'}, ...]` (8개) |
| `FontSizeValue` | `type` | FONT_SIZE_PRESETS의 value 값 유니온 타입 |

### FONT_PRESETS 목록

| id | label | category |
|----|-------|----------|
| `system` | 시스템 기본 | sans |
| `inter` | Inter | sans |
| `noto-sans` | Noto Sans KR | korean |
| `noto-serif` | Noto Serif KR | korean |
| `gowun` | Gowun Dodum | korean |
| `playfair` | Playfair Display | serif |
| `mono` | JetBrains Mono | mono |

---

## [src/lib/graphData.ts](../src/lib/graphData.ts)

**역할:** 페이지 블록 content의 `#page-{uuid}` 패턴을 추출해 그래프 노드/엣지 데이터를 생성. `GraphView.tsx`에서 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GraphNode` | `interface` | `{ id, title, icon, categoryId, degree }` — 페이지 하나 |
| `GraphEdge` | `interface` | `{ sourceId, targetId }` — 페이지 간 링크 |
| `GraphData` | `interface` | `{ nodes: GraphNode[], edges: GraphEdge[] }` |
| `buildGraphData(pages, categoryMap)` | `function` | 전체 페이지 → 그래프 데이터 생성 |

### buildGraphData 동작

1. 각 페이지의 모든 블록 content를 재귀로 평탄화
2. `#page-{uuid}` 패턴 추출 → 링크된 페이지 ID 목록
3. 양방향 중복 제거 (사전순 정렬 key로 체크)
4. 노드별 연결 수(degree) 계산 → 원 크기에 반영

---

## [src/lib/canvasLayout.ts](../src/lib/canvasLayout.ts)

**역할:** 캔버스 블록의 `canvasX/Y/W` 좌표를 분석해 블록을 행(row) 단위로 그룹화. 일반 문서 모드에서 캔버스 레이아웃을 flex 행으로 재현.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `groupBlocksIntoRows(blocks)` | `function` | 블록 배열 → `Block[][]` (행 단위 그룹). `canvasY` 차이 < `ROW_THRESHOLD(60px)`이면 같은 행 |
| `getColumnFlexValues(row)` | `function` | 같은 행의 블록들 → CSS flex 값 문자열 배열 (`canvasW` 비율 기반) |
| `hasCanvasLayout(blocks)` | `function` | 하나 이상 `canvasY`가 있으면 true (행 그룹화 렌더링 사용 여부 판단) |

---

## [src/lib/templateGrid.ts](../src/lib/templateGrid.ts)

**역할:** 비주얼 그리드 템플릿(`TemplateEditorModal`)의 타입 + 변환 로직.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GRID_COLS` | `const` | 그리드 칼럼 수 = `12` |
| `GRID_ROW_H` | `const` | 1행 높이 = `44px` |
| `TemplateCell` | `interface` | 그리드 위 블록 한 칸 `{ id, type, gridX, gridY, gridW, gridH, defaultContent }` |
| `GridTemplateContent` | `interface` | content 필드에 저장되는 JSON 구조 `{ type: 'grid', gridCols, cells }` |
| `PaletteBlock` | `interface` | 팔레트 블록 정의 `{ type, label, icon, defaultH, colorClass, textClass }` |
| `isGridTemplate(content)` | `function` | content 문자열이 그리드 템플릿인지 확인 (`type: 'grid'` 여부) |
| `gridCellsToBlocks(cells)` | `function` | `TemplateCell[]` → `Block[]` 변환 (페이지에 실제 적용할 블록 배열 생성) |
| `PALETTE_BLOCKS` | `const` | 그리드 에디터 팔레트에 표시할 블록 타입 목록 |
| `getPaletteBlock(type)` | `function` | 블록 타입에 맞는 팔레트 정의 조회. 없으면 fallback 반환 |
| `hasCollision(cells, newCell, excludeId?)` | `function` | 새 셀이 기존 셀과 겹치는지 확인 |

---

## [src/lib/templateParser.ts](../src/lib/templateParser.ts)

**역할:** 마크다운 형식 텍스트를 `Block[]`으로 파싱. 서버 템플릿 문자열이나 사용자 작성 템플릿을 페이지에 적용할 때 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `parseTemplateContent(content)` | `function` | 마크다운 → `Block[]` 변환 |
| `blocksToMarkdown(blocks)` | `function` | `Block[]` → 마크다운 텍스트 역변환 |

### 지원 문법

| 패턴 | 변환 결과 |
|------|-----------|
| `# 제목` | `heading1` |
| `## 제목` | `heading2` |
| `### 제목` | `heading3` |
| `- 항목` | `bulletList` |
| `1. 항목` | `orderedList` |
| `- [ ]` / `- [x]` | `taskList` |
| `---` | `divider` |
| `` ``` ... ``` `` | `code` |
| `> 인용구` | `paragraph` + `<em>` |
| 일반 텍스트 | `paragraph` |
| `**굵게**`, `*기울임*`, `` `코드` `` | 인라인 HTML 변환 |
| `~~취소선~~`, `_기울임_` | 인라인 HTML 변환 |
| `:::dayplanner` | `dayplanner` 특수 블록 |
| `:::weeklyplanner` | `weeklyplanner` 특수 블록 |
| `:::routinematrix` | `routinematrix` 특수 블록 |
| `:::monthlycalendar` | `monthlycalendar` 특수 블록 |
| `:::quarterlyplanner` | `quarterlyplanner` 특수 블록 |
| `:::yearlyplanner` | `yearlyplanner` 특수 블록 |

---

## [src/lib/magazineAnalyzer.ts](../src/lib/magazineAnalyzer.ts)

**역할:** 블록 배열을 분석해 Magazine Layout용 역할(`BlockRole`)과 가중치를 추론하고, 템플릿별 `LayoutDescriptor`를 생성한다. Claude API 없이 로컬 룰 기반으로 동작한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BlockAnalysis` | `interface` | `{ blockId, type, role, weight, textLength? }` |
| `analyzeBlocks(blocks)` | `function` | 블록별 역할/가중치 분석 |
| `ContentProfile` | `interface` | 이미지/긴글/짧은글/표/인용/비주얼/헤드라인 포함 여부 |
| `profileContent(analyses)` | `function` | 분석 결과 → 콘텐츠 프로파일 |
| `PRESET_TEMPLATES` | `const` | `magazine_spread`, `newspaper`, `gallery`, `report`, `cards` 프리셋 메타 |
| `TemplateId` | `type` | `PRESET_TEMPLATES`의 id 유니온 |
| `pickTemplate(profile)` | `function` | 콘텐츠 프로파일에 맞는 템플릿 자동 선택 |
| `buildLayout(pageId, blocks, analyses, templateId, existingDescriptor?)` | `function` | 분석 결과와 템플릿으로 `LayoutDescriptor` 생성 |
| `autoLayout(pageId, blocks, templateId?, existingDescriptor?)` | `function` | 분석부터 템플릿 선택/레이아웃 생성까지 한 번에 수행 |

### 주요 동작

- `heading1`은 `headline`, `heading2`는 `subheadline`로 분류한다.
- 이미지, 표, 차트, Mermaid, Gantt, Mindmap 등 비주얼 블록은 큰 공간을 받도록 가중치를 높게 둔다.
- `dayplanner`, `weekplanner`, `weeklyplanner`, `routinematrix`, `monthlycalendar`, `quarterlyplanner`, `yearlyplanner` 같은 플래너 블록은 복잡한 비주얼 블록으로 보고 충분한 row span을 배정한다.
- 기존 `LayoutDescriptor`가 있으면 `locked` 셀은 보존하고 나머지만 재배치한다.

---

## [src/lib/magazineLayout.ts](../src/lib/magazineLayout.ts)

**역할:** 블록 배열을 H1/H2 기준 섹션으로 나누고, feature/body/accent 존에 배치한다. 높이를 강제하지 않고 콘텐츠가 자연스럽게 높이를 결정하는 존 기반 레이아웃이다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MagazineSection` | `interface` | `{ id, headingBlock, featureBlocks, bodyBlocks, accentBlocks, featurePosition }` |
| `groupIntoSections(blocks)` | `function` | 블록 배열 → MagazineSection 배열 |
| `AILayoutPlan` | `interface` | AI가 반환하는 섹션별 blockId 계획 |
| `applyAILayout(aiPlan, allBlocks)` | `function` | AI 계획을 실제 `MagazineSection[]`으로 변환 |

### 주요 동작

- `heading1`, `heading2`가 새 섹션을 시작한다.
- 이미지, 표, 차트, 영상, 임베드, Kanban, Planner 계열 블록은 `featureBlocks`로 분류한다.
- `admonition`은 `accentBlocks`로 분류한다.
- AI 계획에 누락된 블록은 마지막 섹션의 body에 fallback으로 추가한다.

---

## [src/lib/themeVars.ts](../src/lib/themeVars.ts)

**역할:** 커스텀 테마 프리셋별 CSS 변수 상수 정의. `settingsStore.ts`의 `applyThemePreset()`에서 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PRESET_VARS` | `const` | 프리셋별 CSS 변수 `{ notion, sepia, minimal, forest, warm-moss }` 각각 `{ light, dark }` |
| `DEFAULT_VARS` | `const` | 기본 프리셋 CSS 변수 `{ light, dark }` — 'default' 선택 시 복원용 |

### 정의된 CSS 변수

각 프리셋에서 라이트/다크 두 벌로 정의:
`--bg-primary`, `--bg-secondary`, `--bg-hover`, `--bg-active`,
`--text-primary`, `--text-secondary`, `--text-tertiary`,
`--border-color`, `--border-subtle`

`warm-moss`는 새 디자인 토큰 계열을 사용한다:
`--color-bg`, `--color-surface`, `--color-sunken`,
`--color-border`, `--color-border-strong`,
`--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-text-faint`,
`--color-accent`, `--color-accent-soft`, `--color-accent-ink`

---

## [src/lib/utils.ts](../src/lib/utils.ts)

**역할:** shadcn/ui CLI가 생성한 공통 유틸 함수.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `cn(...inputs)` | `function` | `clsx` + `tailwind-merge` 조합. 조건부 Tailwind 클래스 병합 시 사용 |
