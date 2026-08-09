# 07. Sidebar & Navigation — 사이드바 / 네비게이션

> 페이지 탐색과 검색을 담당하는 컴포넌트들.
> `CategorySidebar`가 좌측 사이드바 전체를 담당하고,
> 나머지는 단축키로 여는 오버레이/패널이다.

---

## [src/components/editor/CategorySidebar.tsx](../src/components/editor/CategorySidebar.tsx)

**역할:** 옵시디언 스타일 통합 파일 사이드바. 폴더 트리 + 페이지 인라인 목록 + 검색 + 캘린더 + 최근 파일을 하나로 통합.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CategorySidebar` | `default function` | 통합 사이드바 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onOpenSettings?` | `() => void` | 설정 모달 열기 콜백 |
| `onCloseMobile?` | `() => void` | 모바일 사이드바 닫기 콜백 |
| `dbViewActive?` | `boolean` | DB 뷰 활성화 여부 |
| `onToggleDbView?` | `() => void` | 데이터베이스 테이블 뷰 토글 콜백 |
| `onSplitPage?` | `(pageId: string) => void` | Ctrl+클릭 시 스플릿 뷰로 페이지 열기 |
| `onOpenGraphView?` | `() => void` | 그래프 뷰 오버레이 열기 |
| `onOpenTrash?` | `() => void` | 휴지통 패널 열기 |

### 관련 사이드바 모듈

| 파일 | 설명 |
|------|------|
| `src/components/sidebar/sidebarUtils.ts` | `DEPTH_STYLES`, `GUIDE_COLORS`, `FOLDER_COLOR_GROUPS`, 검색/마크다운 변환 유틸 |
| `src/components/sidebar/CategoryRow.tsx` | 폴더 행 UI. `SortableCategoryRow`, `DroppableCategoryRow`, `CollapsedFolderIcon` 제공 |
| `src/components/sidebar/DraggablePageRow.tsx` | 페이지 행 UI. 페이지 정렬, 폴더 이동, 다중 선택 체크박스, Ctrl+클릭 스플릿 뷰, 페이지 색상 표시 |
| `src/components/sidebar/PageInlineMenu.tsx` | 페이지 행 `•••`/우클릭 메뉴. 즐겨찾기, 복제, 템플릿 저장, 메모 색상, 삭제 |

### 공용 유틸 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML 태그 제거 (검색용 텍스트 추출) |
| `getPageSearchText(page)` | 페이지 블록 전체 텍스트 추출 (toggle JSON 파싱 포함) |
| `blocksToMarkdown(page)` | 블록 배열 → 마크다운 (템플릿 저장용) |

### 주요 기능

| 기능 | 설명 |
|------|------|
| 폴더 트리 | 재귀 렌더링. depth별 색상 + 트리 가이드 라인. `dnd-kit` `useSortable` + `useDroppable`로 폴더 정렬 및 페이지 드롭 |
| 페이지 인라인 | 폴더 클릭 → 하위 페이지 인라인 표시. 페이지 행 hover 시 `•••` 버튼 |
| 메모 일괄 이동 | 상단 `<ListChecks />` 버튼 → 체크박스로 여러 메모 선택 → 선택한 메모의 `⠿` 손잡이를 대상 폴더로 드래그. 드래그 오버레이에 묶음 개수를 표시하고 실제 파일 이동은 순차 처리 |
| 폴더 내 페이지 추가 | 폴더 행 hover 시 📄 버튼 → 인라인 입력창 |
| 미분류 페이지 | 트리 하단에 항상 보이는 "미분류" 드롭 행과 페이지 목록을 표시. 폴더의 단일·다중 선택 메모를 드롭하면 `categoryId: null`로 이동 |
| 검색 | 사이드바 내 검색바 — 제목+블록 내용 클라이언트 사이드 필터링 |
| 계획 탭 | `CalendarWidget` + `PeriodicNotesPanel` 표시 |
| 최근 파일 | `recentFiles` 플러그인 ON일 때 `recentPageIds` 기반 표시 |
| 너비 조절 | aside 오른쪽 4px 드래그 핸들 → `setSidebarWidth()` 실시간 업데이트 |
| 접힘 모드 | `sidebarCollapsed=true` → w-12, 아이콘만 표시 |
| DB 뷰 버튼 | 헤더의 `<Table2 />` 아이콘 클릭 → `onToggleDbView()` |
| 폴더 색상 | 폴더 우클릭 컨텍스트 메뉴 → 색상 팔레트 → `updateCategoryColor()` |
| 메모 색상 | 페이지 메뉴 색상 팔레트 → `updatePageColor()` |
| 태그 브라우저 | 전체 페이지에서 태그 수집 → 로컬 `selectedTags` 상태로 다중 태그 필터 |
| 그래프/설정/휴지통 | 하단 풋터 아이콘에서 각각 `onOpenGraphView`, `onOpenSettings`, `onOpenTrash` 호출 |

---

## [src/components/editor/TabBar.tsx](../src/components/editor/TabBar.tsx)

**역할:** 크롬 스타일 가로 탭 바. `openTabs` 배열 순서대로 렌더링.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TabBar` | `default function` | 탭 바 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onSplit` | `(pageId: string) => void?` | 탭의 ⊞ 버튼 클릭 → 스플릿 뷰로 열기 |
| `splitPageId` | `string \| null?` | 현재 스플릿 중인 탭 ID (강조 표시용) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 탭 클릭 | `setCurrentPage(tabId)` |
| × 버튼 | `closeTab(tabId)` |
| ⊞ 버튼 | `onSplit(tabId)` → 스플릿 뷰 오른쪽 패널에 표시 |
| `Ctrl+W` | 현재 활성 탭 닫기 (input/textarea 안에서는 무시) |
| 활성 탭 자동 스크롤 | `currentPageId` 변경 시 `scrollIntoView({ inline: 'nearest' })` |

---

## [src/components/editor/CommandPalette.tsx](../src/components/editor/CommandPalette.tsx)

**역할:** `Ctrl+P`로 여는 커맨드 팔레트. 페이지 제목 검색 + 빠른 액션.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CommandPalette` | `default function` | 커맨드 팔레트 오버레이 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 팔레트 닫기 |
| `onOpenSettings` | `() => void` | 설정 열기 액션용 |
| `onOpenShortcuts` | `() => void` | 단축키 안내 열기 액션용 |
| `onOpenSearch` | `() => void` | 전체 검색 열기 액션용 |
| `onOpenCalendar` | `() => void` | 캘린더 열기 액션용 |

### 타입

| 이름 | 설명 |
|------|------|
| `PaletteItem` | `{ kind: 'page', ... } \| { kind: 'action', run, ... }` |

### 아이템 구성

| 섹션 | 설명 |
|------|------|
| 최근 페이지 | `recentPageIds` 기반 최대 5개 |
| 전체보기 | 검색어 기준 제목 필터링 |
| 빠른 액션 | 새 페이지 만들기 / 설정 열기 / 단축키 안내 / 내용 검색 / 캘린더 열기 |

### 동작

- 마운트 시 자동 포커스
- ↑↓ 키로 항목 탐색, Enter로 실행, Esc로 닫기
- `useMemo`로 검색어 변경 시만 필터링 재계산

---

## [src/components/editor/GlobalSearch.tsx](../src/components/editor/GlobalSearch.tsx)

**역할:** `Ctrl+K`로 여는 전체 텍스트 검색 팝업. 서버 검색 API 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GlobalSearch` | `default function` | 전체 검색 오버레이 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 팝업 닫기 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 검색 | 300ms 디바운스 후 `api.searchPages(query)` 호출 (서버 전문 검색) |
| 응답 순서 보호 | 최신 검색 요청 ID와 일치하는 응답만 결과에 반영 |
| 결과 | `SearchResult[]` — 페이지 제목 + 매칭 블록 스니펫 표시 |
| 이동 | 결과 클릭 → `setCurrentPage(pageId)` + 팝업 닫기 |
| 키보드 | ↑↓ 탐색, Enter 선택, Esc 닫기 |
| 로딩 | 검색 중 스피너 표시 |

---

## [src/components/editor/FindReplacePanel.tsx](../src/components/editor/FindReplacePanel.tsx)

**역할:** `Ctrl+H`/`Ctrl+F`로 여는 찾기/바꾸기 플로팅 패널. `useFindReplaceStore` 구독으로 모든 에디터와 동기화.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FindReplacePanel` | `default function` | 찾기/바꾸기 패널 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `replaceTextInHtml(html, regex, replacement)` | DOM 파서 사용 → HTML 태그 속성 오염 없이 텍스트 노드만 치환 |
| `escapeRe(s)` | 정규식 특수문자 이스케이프 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 하이라이트 | `searchHighlightKey` Transaction 메타로 모든 Editor에 검색어 전달 → `find-highlight` CSS 클래스 |
| 이전/다음 | DOM의 `.find-highlight` 요소를 순서대로 `scrollIntoView`. Enter는 다음, Shift+Enter는 이전으로 이동 |
| 바꾸기 | 현재 페이지 블록 HTML에서 `replaceTextInHtml()` 적용 후 `updateBlock()` |
| 모두 바꾸기 | 전체 블록에 일괄 적용 후 교체 횟수 toast 표시 |
| 대소문자 | `[Aa]` 버튼 → `toggleCase()` → `findReplaceStore.caseSensitive` 토글 |
