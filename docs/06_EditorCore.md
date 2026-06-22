# 06. Editor Core — 핵심 에디터 컴포넌트

> 에디터의 중심 구조. `PageEditor`가 블록 목록을 렌더링하고,
> 각 블록마다 `Editor` 인스턴스 하나가 마운트되어 Tiptap을 구동한다.

---

## [src/components/editor/Editor.tsx](../src/components/editor/Editor.tsx)

**역할:** 단일 블록 Tiptap 에디터. 텍스트 블록을 위한 `useEditor` + 비텍스트 블록(캔버스, 차트 등)을 위한 커스텀 렌더러를 통합.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `Editor` | `default function` | 블록 하나를 렌더링하는 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `block` | `Block` | 렌더링할 블록 데이터 |
| `pageId` | `string` | 소속 페이지 ID |
| `isLast` | `boolean` | 마지막 블록 여부 (Enter 시 새 블록 추가 동작에 사용) |
| `isSectionCollapsed` | `boolean?` | heading 블록의 섹션 접힘 여부 |
| `hasSectionChildren` | `boolean?` | 접힌 하위 블록 존재 여부 (접기 아이콘 표시용) |
| `onToggleSectionCollapse` | `function?` | 섹션 접기/펼치기 콜백 |
| `readMode` | `boolean?` | 읽기 모드 (true이면 Tiptap 편집 불가) |
| `isSelected` | `boolean?` | 블록 일괄 선택 여부 |
| `onSelect` | `(e: React.MouseEvent) => void` | 블록 선택 체크박스 클릭 콜백 |
| `isChild` | `boolean?` | 토글 자식 블록 여부. true이면 DnD 비활성 |
| `toggleId` | `string?` | 부모 토글 블록 ID |
| `onGroupIntoToggle` | `() => void` | 선택된 블록들을 토글로 묶는 콜백 |
| `children` | `React.ReactNode` | 토글 자식 블록 렌더링 결과 |

### 모듈 레벨 변수

| 이름 | 설명 |
|------|------|
| `_aiInsertTarget` | `{ editor, pos }` — 가장 최근 포커스된 에디터 + 커서 위치. `ai-insert-text` 커스텀 이벤트를 올바른 블록에 전달하기 위해 사용 |
| `blockTypeToLevel` | heading1~6 → 레벨 숫자 매핑 |

> `lowlight`, `CustomCodeBlock`, 확장 배열 조립은 현재 `src/extensions/editorExtensions.ts`의 `buildEditorExtensions()`로 이동했다. `Editor.tsx`는 `buildEditorExtensions(t.editor.headingPlaceholder)`를 호출한다.

### 등록된 Tiptap 확장

| 확장 | 설명 |
|------|------|
| `StarterKit` | 기본 노드/마크 (heading levels [1..6], history 등) |
| `Placeholder` | 빈 블록 안내 문구 |
| `Typography` | 타이포그래피 자동 변환 |
| `Highlight` | 형광펜 (`multicolor: true`) |
| `Color` + `TextStyle` | 글자 색상 |
| `FontFamily` | 인라인 글꼴 변경 |
| `FontSize` | 인라인 글자 크기 (커스텀 확장) |
| `TextAlign` | 좌/중/우/양쪽 정렬 |
| `InlineMath` | `$...$` → KaTeX 인라인 수식 |
| `FootnoteInline` | `[^...]` → 인라인 각주 |
| `TaskList` + `TaskItem` | 체크박스 목록 |
| `Table` + `TableRow` + `TableHeader` + `TableCell` | 테이블 |
| `CustomCodeBlock` | 코드 블록 + 언어 선택 NodeView |
| `SearchHighlight` | 찾기/바꾸기 하이라이트 |
| `ArrowMark` | 화살표 마커 mark |
| `Link` | 링크 (StarterKit 내장) |

등록 위치는 `Editor.tsx` 내부 배열이 아니라 [src/extensions/editorExtensions.ts](../src/extensions/editorExtensions.ts)다. `StarterKit`은 `codeBlock: false`, `trailingNode: false`, `link.openOnClick: false`로 설정되고, `CustomCodeBlock`이 내장 코드 블록을 대체한다.

### 주요 내부 상태/로직

| 이름 | 설명 |
|------|------|
| `slashMenu` | `{ isOpen, position, searchQuery, from }` — `/` 입력 감지 시 팝업 위치 계산 |
| `mentionMenu` | `{ isOpen, query, from, trigger, position }` — `@` 또는 `[[` 입력 감지 |
| `contextMenu` | `{ x, y } \| null` — 우클릭 메뉴 좌표 |
| `latexCandidate` | `$$...$$` 붙여넣기 감지 시 변환 여부 묻는 UI |
| `checkSlash(editor)` | cursor 앞 `/query` 패턴 감지 → 슬래시 메뉴 팝업 위치 계산 |
| `checkMention(editor)` | `@단어` / `[[단어` 패턴 감지 → 멘션 팝업 오픈 |
| `buildContextSections()` | 우클릭 메뉴 섹션 배열 생성. 섹션: 블록 추가(위/아래) / 블록 관리(복제·삭제) / 타입 변환(텍스트 블록만) / 배경색 팔레트 |

### 비텍스트 블록 렌더링

텍스트 블록(paragraph, heading, list 등)은 Tiptap `EditorContent`로 렌더링.
비텍스트 블록은 `block.type`에 따라 개별 컴포넌트를 직접 렌더링:

| block.type | 컴포넌트 |
|------------|---------|
| `image` | `ImageBlock` |
| `kanban` | `KanbanBlock` |
| `admonition` | `AdmonitionBlock` |
| `canvas` | `CanvasBlock` |
| `excalidraw` | `ExcalidrawBlock` |
| `video` | `VideoBlock` |
| `layout` | `LayoutBlock` |
| `math` | `MathBlock` |
| `embed` | `EmbedBlock` |
| `mermaid` | `MermaidBlock` |
| `chart` | `ChartBlock` |
| `gantt` | `GanttBlock` |
| `mindmap` | `MindmapBlock` |
| `toc` | `TocBlock` |
| `file` | `FileBlock` |
| `toggle` | `ToggleBlock` |
| `dayplanner` | `DayPlannerBlock` |
| `weekplanner` | `WeekPlannerBlock` |
| `weeklyplanner` | `WeeklyPlannerBlock` |
| `routinematrix` | `RoutineMatrixBlock` |
| `monthlycalendar` | `MonthlyCalendarBlock` |
| `quarterlyplanner` | `QuarterlyPlannerBlock` |
| `yearlyplanner` | `YearlyPlannerBlock` |

---

## [src/components/editor/PageEditor.tsx](../src/components/editor/PageEditor.tsx)

**역할:** 한 페이지의 모든 블록을 목록으로 렌더링. 커버/이모지/제목, 속성 패널, TOC, 백링크, 찾기/바꾸기, 버전 히스토리, 읽기 모드, 섹션 접기, 캔버스 행 레이아웃을 통합.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PageEditor` | `default function` | 페이지 전체 렌더러 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pageId` | `string` | 렌더링할 페이지 ID |

### 주요 내부 상태

| 상태 | 설명 |
|------|------|
| `readMode` | 읽기 모드 여부. `toggle-read-mode` 커스텀 이벤트로 토글 |
| `historyPanelOpen` | 버전 히스토리 패널 열림 여부 |
| `tweaksOpen` | Tweaks 패널 열림 여부 |
| `lockModalMode` | `'lock' \| 'unlock' \| null` — 잠금 PIN 설정/해제 모달 모드 |
| `collapsedSections` | `Set<string>` — 접힌 heading 블록 ID 집합. `localStorage`에 저장되어 `TocPanel`과 공유 |

### 통합 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `CanvasPageEditor` | 페이지 캔버스 모드 렌더링 |
| `EmojiPicker`, `CoverPicker` | 페이지 아이콘/커버 편집 |
| `TemplatePanel` | 템플릿 적용 |
| `PropertyPanel` | 페이지 속성 편집 |
| `RightPanel` | 오른쪽 보조 패널 |
| `TocPanel`, `BacklinkPanel` | 목차/백링크 |
| `FindReplacePanel` | 찾기/바꾸기 |
| `VersionHistoryPanel` | 버전 히스토리 |
| `TweaksPanel` | 에디터 세부 설정 |
| `LockModal` | 페이지 잠금/해제 PIN 처리 |
| `MagazineGrid` | Magazine Mode 레이아웃 |
| `ArrowLayer`, `ArrowContextMenu` | 화살표 연결 오버레이/설정 메뉴 |

### 주요 내부 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML 태그 제거 → 순수 텍스트 추출 |
| `htmlToMdInline(html)` | HTML 인라인 서식 → 마크다운 변환 (`<strong>` → `**`, etc.) |
| `blockToMarkdown(block)` | 블록 하나 → 마크다운 문자열 (30개 블록 타입 지원) |
| `pageToMarkdown(page)` | 페이지 전체 → 마크다운 문자열 (제목 + 태그 + 블록 목록) |

### 섹션 접기/펼치기 로직

- `HEADING_LEVEL` 맵으로 각 heading의 레벨(1~6) 판단
- heading이 접히면 다음 동일/상위 레벨 heading 전까지의 블록을 `collapsedSections` Set으로 필터링
- `SortableContext`에서 접힌 블록은 렌더링에서 제외 (실제 삭제 아님)
- 접힘 상태는 `notion-clone-toc-collapsed` localStorage 키에 저장되어 TOC와 동기화

### 캔버스 행 레이아웃

- `hasCanvasLayout(blocks)` → true이면 `groupBlocksIntoRows()` 사용
- 각 행은 flex row로 렌더링, `getColumnFlexValues(row)`로 열 너비 비율 적용
- 일반 문서 모드에서 캔버스 배치 그대로 재현

### 마크다운 내보내기

툴바의 📋 버튼 클릭 → `pageToMarkdown(page)` 실행 → 클립보드에 복사

---

## [src/components/editor/BubbleMenuBar.tsx](../src/components/editor/BubbleMenuBar.tsx)

**역할:** 텍스트 선택 시 나타나는 플로팅 인라인 툴바. 서식, 정렬, 폰트, 색상, 화살표 마커를 조작.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BubbleMenuBar` | `default function` | 인라인 툴바 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `editor` | `TiptapEditor` | 연결된 Tiptap 에디터 인스턴스 |
| `readMode` | `boolean?` | 읽기 모드. true이면 BubbleMenu를 렌더링하지 않음 |

### 모듈 레벨 상수

| 상수 | 설명 |
|------|------|
| `FORMAT_BUTTONS` | 인라인 서식 버튼 목록 — Bold(B), Italic(I), Strike(S), Code(<>) |
| `TEXT_COLORS` | 글자 색상 프리셋 8종 (기본 포함, null = 색상 제거) |
| `HIGHLIGHT_COLORS` | 배경(형광펜) 색상 프리셋 8종 (null = 형광펜 제거) |

### 내부 컴포넌트

| 이름 | 설명 |
|------|------|
| `Divider` | 툴바 버튼 사이 세로 구분선 |

### 버튼 그룹 구성 (왼쪽 → 오른쪽)

| 그룹 | 내용 |
|------|------|
| 인라인 서식 | Bold / Italic / Strike / Code |
| 정렬 | AlignLeft / AlignCenter / AlignRight / AlignJustify (lucide-react) |
| 글꼴 | FONT_PRESETS 드롭다운 (`FontFamily` 확장) |
| 크기 | FONT_SIZE_PRESETS 드롭다운 (`FontSize` 확장) |
| 글자 색상 | TEXT_COLORS 스와치 팔레트 |
| 배경 색상 | HIGHLIGHT_COLORS 스와치 팔레트 |
| 화살표 마커 | ArrowMark 시작/끝 연결 버튼 (arrowStore 연동) |

---

## [src/components/editor/SlashCommand.tsx](../src/components/editor/SlashCommand.tsx)

**역할:** `/` 입력 시 나타나는 블록 타입 선택 팝업 메뉴. 검색어로 필터링, 키보드 방향키 탐색 지원.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `SlashCommand` | `default function` | 슬래시 명령어 팝업 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `editor` | `TiptapEditor` | 연결된 에디터 |
| `isOpen` | `boolean` | 팝업 열림 여부 |
| `position` | `{ top?, bottom?, left }` | 팝업 표시 좌표. 커서 위치에 따라 위/아래 방향을 바꿀 수 있음 |
| `onSelect` | `(type: BlockType) => void` | 블록 타입 선택 콜백 |
| `onClose` | `() => void` | Escape — 팝업만 닫기 (`/` 텍스트 유지) |
| `onClickOutside` | `() => void` | 외부 클릭 — 팝업 닫기 + `/query` 텍스트 삭제 |
| `searchQuery` | `string` | 현재 검색어 |

### COMMANDS 구조

7개 그룹으로 구성:

| 그룹 | 항목 수 | 주요 내용 |
|------|---------|----------|
| 텍스트 | 8 | paragraph, toggle, heading1~6 |
| 목록 | 3 | bulletList, orderedList, taskList |
| 미디어 | 6 | image, video, canvas, excalidraw, embed, file |
| 데이터 | 9 | table, kanban, code, math, mermaid, chart, gantt, mindmap, toc |
| 고급 | 3 | admonition, divider, layout |
| 플래너 | 7 | dayplanner, weekplanner, weeklyplanner, routinematrix, monthlycalendar, quarterlyplanner, yearlyplanner |
| AI | 1 | AI 글쓰기 |

### 동작

- `searchQuery`로 name/description 대소문자 무시 필터링
- `plugins` 설정에 따라 일부 항목 숨김 (kanban, excalidraw, canvas, chart, gantt, mindmap, layout 등)
- 방향키(↑↓) + Enter로 키보드 선택
- 선택된 항목으로 자동 스크롤 (`selectedRef`)

---

## [src/components/editor/BlockMenu.tsx](../src/components/editor/BlockMenu.tsx)

**역할:** 블록 왼쪽 `⠿` 핸들 클릭 시 나타나는 블록 조작 메뉴. 위/아래 추가, 복제, 다른 페이지로 이동/복사, 삭제.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BlockMenu` | `default function` | 블록 조작 드롭다운 메뉴 |

### 내부 컴포넌트

| 이름 | 설명 |
|------|------|
| `MenuItem` | 메뉴 항목 하나 (icon + label + onClick, danger 옵션) |
| `Divider` | 메뉴 그룹 사이 구분선 |
| `PagePickerPopup` | 이동/복사 대상 페이지 검색 팝업. 현재 페이지 제외, 퍼지 검색 지원 |

### 메뉴 항목 구성

| 그룹 | 항목 |
|------|------|
| 추가 | 위에 블록 추가 / 아래에 블록 추가 |
| 관리 | 블록 복제 |
| 이동 | 다른 페이지로 이동 (PagePickerPopup) |
| 복사 | 다른 페이지로 복사 (PagePickerPopup) |
| 위험 | 블록 삭제 (빨간색) |

---

## [src/components/editor/ContextMenu.tsx](../src/components/editor/ContextMenu.tsx)

**역할:** 블록 우클릭 시 표시되는 컨텍스트 메뉴. `sections/actions` 배열 구조로 확장 용이.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ContextMenu` | `default function` | 우클릭 컨텍스트 메뉴 컴포넌트 |
| `ContextMenuAction` | `interface` | 메뉴 항목 `{ id, label, icon?, shortcut?, danger?, disabled?, onClick }` |
| `ContextMenuSection` | `interface` | 항목 그룹 `{ id, title?, actions, customRender? }` |

### 동작 방식

- `position: fixed` → DOM 위치와 무관하게 커서 좌표에 표시
- 화면 경계 초과 시 자동 보정 (오른쪽/아래 끝 넘어가면 반대 방향)
- 외부 클릭(`mousedown`) 또는 Escape 키로 닫힘
- `customRender` 슬롯으로 색상 팔레트 등 커스텀 UI 삽입 가능

### Editor.tsx의 `buildContextSections()` 섹션 구성

| 섹션 | 항목 |
|------|------|
| 블록 추가 | 위에 추가 / 아래에 추가 |
| 블록 관리 | 복제 / 삭제 |
| 타입 변환 | 텍스트 블록만 표시 — paragraph/heading1~6/bulletList/orderedList/taskList/toggle |
| 배경색 | `customRender`로 색상 스와치 팔레트 표시 |

---

## [src/components/editor/BottomBar.tsx](../src/components/editor/BottomBar.tsx)

**역할:** 에디터 하단 고정 바. 에디터 최대 너비 슬라이더와 단어/글자 수 카운터를 통합.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BottomBar` | `default function` | 하단 고정 바 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pageId` | `string` | 단어 수를 집계할 페이지 ID |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML 태그 제거 |
| `countText(blocks)` | 블록 배열 → `{ words, chars }` 집계. kanban/toggle/admonition은 JSON 파싱 후 텍스트 추출. image/divider/canvas는 제외 |

### UI 구성

| 요소 | 설명 |
|------|------|
| AlignJustify 아이콘 + 슬라이더 | 에디터 최대 너비 400~1400px 조절. `setEditorMaxWidth()` + `applyEditorStyle()` 호출 |
| 단어/글자 수 | `wordCount` 플러그인 ON일 때만 표시. `useMemo`로 불필요한 재계산 방지 |
