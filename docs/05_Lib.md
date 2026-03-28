# 05. Lib — 유틸리티 / 라이브러리

> 여러 컴포넌트에서 공통으로 사용하는 순수 함수, 상수, API 클라이언트 모음.
> 이 파일들은 React에 의존하지 않는다 (컴포넌트 아님).

---

## [src/lib/api.ts](../src/lib/api.ts)

**역할:** FastAPI 백엔드(`http://127.0.0.1:8000`)와 통신하는 fetch 래퍼 함수 모음.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `api` | `const object` | API 함수 네임스페이스 객체 |

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
| `isGridTemplate(content)` | `function` | content 문자열이 그리드 템플릿인지 확인 (`type: 'grid'` 여부) |
| `gridCellsToBlocks(cells)` | `function` | `TemplateCell[]` → `Block[]` 변환 (페이지에 실제 적용할 블록 배열 생성) |
| `PALETTE_BLOCKS` | `const` | 그리드 에디터 팔레트에 표시할 블록 타입 목록 |
| `hasCollision(cells, newCell, excludeId?)` | `function` | 새 셀이 기존 셀과 겹치는지 확인 |

---

## [src/lib/templateParser.ts](../src/lib/templateParser.ts)

**역할:** 마크다운 형식 텍스트를 `Block[]`으로 파싱. 서버 템플릿 문자열이나 사용자 작성 템플릿을 페이지에 적용할 때 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `parseTemplateContent(content)` | `function` | 마크다운 → `Block[]` 변환 |

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
| 일반 텍스트 | `paragraph` |
| `**굵게**`, `*기울임*`, `` `코드` `` | 인라인 HTML 변환 |

---

## [src/lib/themeVars.ts](../src/lib/themeVars.ts)

**역할:** 커스텀 테마 프리셋별 CSS 변수 상수 정의. `settingsStore.ts`의 `applyThemePreset()`에서 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PRESET_VARS` | `const` | 프리셋별 CSS 변수 `{ notion, sepia, minimal, forest }` 각각 `{ light, dark }` |
| `DEFAULT_VARS` | `const` | 기본 프리셋 CSS 변수 `{ light, dark }` — 'default' 선택 시 복원용 |

### 정의된 CSS 변수

각 프리셋에서 라이트/다크 두 벌로 정의:
`--bg-primary`, `--bg-secondary`, `--bg-hover`, `--bg-active`,
`--text-primary`, `--text-secondary`, `--text-tertiary`,
`--border-color`, `--border-subtle`

---

## [src/lib/utils.ts](../src/lib/utils.ts)

**역할:** shadcn/ui CLI가 생성한 공통 유틸 함수.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `cn(...inputs)` | `function` | `clsx` + `tailwind-merge` 조합. 조건부 Tailwind 클래스 병합 시 사용 |
