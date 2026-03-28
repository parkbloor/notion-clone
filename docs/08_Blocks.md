# 08. Blocks — 특수 블록 컴포넌트

> Editor.tsx에서 블록 타입에 따라 렌더링하는 전용 컴포넌트들.
> 각 블록은 `block: Block` + `pageId: string` props를 받아 독립적으로 동작.

---

## [src/components/editor/ImageBlock.tsx](../src/components/editor/ImageBlock.tsx)

**역할:** 이미지 업로드 + 표시 블록. 우측 핸들 드래그로 너비 조절. 캡션 편집 지원.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ImageBlock` | `default function` | 이미지 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `ImageContent` | `{ src, width?, caption? }` | content JSON 포맷 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `parseContent(content)` | JSON `{src, width?, caption?}` 또는 레거시 plain URL 파싱 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 업로드 | 드롭/클릭 → `api.uploadImage()` → content 업데이트 |
| 너비 조절 | 우측 핸들 드래그 → `isResizing` 상태 → `updateBlock()` |
| 캡션 | 이미지 아래 `contentEditable div` — 포커스 아웃 시 저장 |
| readOnly | `readOnly=true` 시 업로드 UI 숨김, 캡션 편집 불가 |

---

## [src/components/editor/VideoBlock.tsx](../src/components/editor/VideoBlock.tsx)

**역할:** 로컬 비디오 업로드 + HTML5 플레이어 블록. 자동재생/반복은 플러그인 설정 연동.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `VideoBlock` | `default function` | 비디오 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `VideoContent` | `{ src: string, width?: number }` — content JSON 포맷 |
| `ALLOWED_EXTS` | `.mp4 .webm .ogg .mov .avi .mkv` (백엔드와 동일) |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `parseContent(content)` | JSON 파싱 실패 시 `{ src: '' }` 반환 (Tiptap HTML fallback 방지) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 업로드 | `api.uploadVideo()` → content 저장 |
| 재생 | `<video>` — `autoPlay`/`loop`는 `plugins.videoAutoplay`/`videoLoop` 연동 |
| 너비 조절 | 우측 핸들 드래그 → `isResizing` → `updateBlock()` |

---

## [src/components/editor/EmbedBlock.tsx](../src/components/editor/EmbedBlock.tsx)

**역할:** URL 임베드 블록 — YouTube / Vimeo / 일반 iframe.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `EmbedBlock` | `default function` | 임베드 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `EmbedContent` | `{ url: string }` | content JSON 포맷 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `toYouTubeEmbedUrl(url)` | `watch?v=`, `youtu.be/`, `shorts/` → `youtube.com/embed/` 변환. 실패 시 `null` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| URL 입력 | 텍스트 입력 후 Enter/버튼 → content 저장 |
| YouTube | `toYouTubeEmbedUrl()` 변환 후 `<iframe>` |
| 일반 URL | `<iframe src=url>` 직접 임베드 |

---

## [src/components/editor/FileBlock.tsx](../src/components/editor/FileBlock.tsx)

**역할:** 일반 파일 첨부 블록 (PDF/docx/zip 등). 파일 아이콘 + 이름 + 크기 표시 + 다운로드.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FileBlock` | `default function` | 파일 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `FileContent` | `{ url, name, size, ext }` | content JSON 포맷 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `formatBytes(bytes)` | 숫자 → `B / KB / MB / GB` 문자열 |
| `getFileIcon(ext)` | 확장자 → 이모지 아이콘 (🔴=pdf, 📘=docx, 📗=xlsx, 🗜=zip 등) |

---

## [src/components/editor/CodeBlockView.tsx](../src/components/editor/CodeBlockView.tsx)

**역할:** 코드 블록 Tiptap NodeView — 언어 선택 드롭다운 + 복사 버튼. `ReactNodeViewRenderer`로 `<pre>` 안에 주입됨.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CodeBlockView` | `default function` | 코드 블록 NodeView 컴포넌트 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `LANGUAGES` | 지원 언어 목록 17종 (`plaintext`, `javascript`, `typescript`, `python`, `html`, `css`, `json`, `bash`, `sql`, `java`, `go`, `rust`, `cpp`, `csharp`, `markdown`, `yaml`, `xml`) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 언어 변경 | `<select>` → `updateAttributes({ language })` → Tiptap 노드 속성 업데이트 |
| 복사 | `.code-block-container pre code` 텍스트 추출 → `navigator.clipboard.writeText()` → 1.5초 후 원복 |

---

## [src/components/editor/MathBlock.tsx](../src/components/editor/MathBlock.tsx)

**역할:** LaTeX 수식 블록 — 편집(textarea) ↔ 미리보기(KaTeX) 2모드. content = raw LaTeX 문자열.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MathBlock` | `default function` | 수식 블록 컴포넌트 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 초기 모드 | content 비어있으면 편집 모드로 시작, 있으면 미리보기 |
| 렌더링 | `katex.renderToString(latex, { displayMode: true, throwOnError: true })` → 오류 시 `error` 상태 표시 |
| 저장 | Blur 또는 Ctrl+Enter → `updateBlock()` |
| 토글 | 미리보기 클릭 → 편집 모드 전환 |

---

## [src/components/editor/InlineMathView.tsx](../src/components/editor/InlineMathView.tsx)

**역할:** `InlineMath` 노드의 React NodeView. 미리보기(KaTeX 인라인) ↔ 편집(input) 2모드.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `InlineMathView` | `default function` | 인라인 수식 NodeView |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 렌더링 | `katex.renderToString(latex, { displayMode: false })` — 인라인 크기 |
| 초기값 | 첫 렌더 시 즉시 KaTeX 계산 (`useState(() => {...})` lazy initializer) |
| 편집 | 더블클릭 또는 노드 선택 → `<input>` 표시 → Enter/Blur → `updateAttributes({ latex })` |

---

## [src/components/editor/AdmonitionBlock.tsx](../src/components/editor/AdmonitionBlock.tsx)

**역할:** 콜아웃(admonition) 블록 — tip/info/warning/danger 4종. 배지 클릭으로 타입 순환.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `AdmonitionBlock` | `default function` | 콜아웃 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `AdmonitionVariant` | `'tip' \| 'info' \| 'warning' \| 'danger'` |
| `VARIANTS` | variant → `{ icon, label, bg, border, textColor }` 스타일 레코드 |
| `VARIANT_ORDER` | `['tip', 'info', 'warning', 'danger']` — 배지 클릭 순환 순서 |

---

## [src/components/editor/ToggleBlock.tsx](../src/components/editor/ToggleBlock.tsx)

**역할:** 토글 블록 — 헤더 클릭으로 body 접고 펼치기. 헤더/바디 각각 Tiptap 에디터.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ToggleBlock` | `default function` | 토글 블록 컴포넌트 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `parseToggle(content)` | JSON `{ header, body }` 파싱. 구 포맷(plain text) → `{ header: content, body: '' }` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| content 포맷 | JSON `{ header: HTML, body: HTML }` — 변경 시 합쳐서 `updateBlock()` |
| 접힘 상태 | `isOpen` 로컬 상태 (저장 안 함) |
| 삭제 방지 | `isLast=true` 이고 헤더/바디 모두 비어있으면 Backspace 삭제 막음 |

---

## [src/components/editor/TocBlock.tsx](../src/components/editor/TocBlock.tsx)

**역할:** 인라인 목차 블록. 현재 페이지의 H1~H6 헤딩을 실시간으로 읽어 계층 목록 표시. 클릭 시 해당 위치로 스크롤.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TocBlock` | `default function` | 인라인 목차 블록 컴포넌트 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `HEADING_LEVEL` | `{ heading1: 1, ..., heading6: 6 }` — 블록 타입 → 레벨 매핑 |
| `INDENT_CLASSES` | `['', 'pl-4', 'pl-8', ...]` — 레벨별 들여쓰기 Tailwind 클래스 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML 태그 제거 → 순수 텍스트 (목차 항목 텍스트용) |

---

## [src/components/editor/KanbanBlock.tsx](../src/components/editor/KanbanBlock.tsx)

**역할:** 드래그앤드롭 칸반 보드 블록. 열(컬럼) + 카드 구조. dnd-kit 기반.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `KanbanBlock` | `default function` | 칸반 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `KanbanCard` | `{ id, text, color? }` | 카드 하나 |
| `KanbanColumn` | `{ id, title, cards: KanbanCard[] }` | 열 하나 |
| `KanbanData` | `{ columns: KanbanColumn[] }` | content JSON 포맷 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| DnD | `@dnd-kit/core` `DragOverlay` — 카드 열 간 이동 |
| 열 추가/삭제 | 열 헤더 우측 버튼 |
| 카드 추가 | 열 하단 `+` 버튼 → 인라인 입력 |

---

## [src/components/editor/ChartBlock.tsx](../src/components/editor/ChartBlock.tsx)

**역할:** 차트 블록 — Bar/Line/Pie 3종. recharts 기반. 표 편집 UI ↔ 미리보기 2모드. `chartRef` 패턴으로 렌더 중 setState 방지.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ChartBlock` | `default function` | 차트 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `ChartSeries` | `{ name: string, data: number[] }` — 데이터 시리즈 하나 |
| `ChartData` | `{ type, title, labels: string[], series: ChartSeries[] }` — content JSON 포맷 |
| `PALETTE` | 시리즈 색상 팔레트 배열 |
| `makeDefaultChart()` | 기본 차트 데이터 생성 함수 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 모드 | 편집(표 형태 데이터 입력) ↔ 미리보기(recharts 렌더링) 토글 |
| 차트 타입 | `BarChart`, `LineChart`, `PieChart` (recharts 컴포넌트) |
| chartRef | `useRef`로 최신 데이터 보관 → 렌더 중 setState 없이 저장 |

---

## [src/components/editor/GanttBlock.tsx](../src/components/editor/GanttBlock.tsx)

**역할:** 갠트 차트 블록. 편집(태스크 테이블) ↔ 미리보기(순수 CSS div 타임라인) 2모드.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GanttBlock` | `default function` | 갠트 차트 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `GanttTask` | `{ id, name, start, end, color, progress }` — 태스크 하나 (`start`/`end`: `YYYY-MM-DD`) |
| `GanttData` | `{ title: string, tasks: GanttTask[] }` — content JSON 포맷 |
| `PALETTE` | 태스크 기본 색상 6종 (파랑/초록/주황/빨강/보라/하늘) |
| `defaultData()` | 기본 3개 태스크 (오늘 기준 날짜) 생성 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `parseGantt(content)` | JSON → `GanttData`. 실패 시 `defaultData()` 반환 |
| `toDate(s)` | `YYYY-MM-DD` 문자열 → `Date` 객체 (`T00:00:00` 접미사로 로컬 시간대 보정) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 미리보기 | 월 헤더 자동 생성, 오늘 표시선, hover 툴팁, 진행률 막대 |
| 편집 | 이름/시작일/종료일/진행률/색상 테이블 인라인 편집 |

---

## [src/components/editor/MindmapBlock.tsx](../src/components/editor/MindmapBlock.tsx)

**역할:** AI 마인드맵 블록. 방사형 SVG 렌더링 + AIChatPanel 통합. Tab/Enter/Del 단축키, 접기/펼치기, 팬/줌, 우클릭 AI 확장.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MindmapBlock` | `default function` | 마인드맵 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `MindNode` | `{ id, text, children: MindNode[], collapsed?: boolean }` — 재귀 트리 |
| `ChatMsg` | `{ role: 'user'\|'assistant', content: string }` — AI 채팅 메시지 |
| `MindmapData` | `{ root: MindNode, chatHistory: ChatMsg[] }` — content JSON 포맷 |
| `DEPTH_COLORS` | depth별 노드 색상 배열 |
| `SVG_W` / `SVG_H` | 캔버스 기본 크기 `1000` / `700` px |
| `defaultData()` | 루트 + 3개 자식 노드 기본 구조 생성 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 방사형 렌더 | 재귀 좌표 계산 → SVG `<line>` + `<foreignObject>` |
| 팬/줌 | wheel(줌), 빈 영역 드래그(팬). `readMode` ref 패턴으로 stale closure 방지 |
| 노드 편집 | 더블클릭 → 인라인 input |
| 단축키 | Tab(자식 추가), Enter(형제 추가), Del(노드 삭제) |
| AI 확장 | 우클릭 → `AIChatPanel` → 응답으로 자식 노드 자동 추가 |

---

## [src/components/editor/MermaidBlock.tsx](../src/components/editor/MermaidBlock.tsx)

**역할:** Mermaid 다이어그램 블록 — 편집(textarea) ↔ 미리보기(SVG) 2모드. content = raw Mermaid 코드 문자열.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MermaidBlock` | `default function` | Mermaid 블록 컴포넌트 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 초기 모드 | content 비어있으면 편집 모드 |
| 렌더링 | `mermaid.render(id, code)` async → `svgHtml` 상태 → `dangerouslySetInnerHTML` |
| 렌더 ID | `useId()` 기반 고유 ID (`useId().replace(/:/g, '')`) |
| 오류 | 파싱 실패 시 `error` 상태 표시 |
| 저장 | Blur → `updateBlock()` |

---

## [src/components/editor/ExcalidrawBlock.tsx](../src/components/editor/ExcalidrawBlock.tsx)

**역할:** Excalidraw 손그림 다이어그램 블록. `next/dynamic SSR:false`로 클라이언트 전용 임포트.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ExcalidrawBlock` | `default function` | Excalidraw 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `ExcalidrawData` | `{ elements: any[], appState: { viewBackgroundColor? } }` — content JSON 포맷 |
| `DEBOUNCE_MS` | `800` — onChange 디바운스 간격 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 동적 임포트 | `await import('@excalidraw/excalidraw')` → `mod.Excalidraw` — SSR 비활성화 |
| 저장 | `onChange` 디바운스 800ms → content JSON 문자열로 저장 |
| initialData | `blockId` 기준 `useMemo`로 재계산 (블록 ID 바뀔 때만 재초기화) |

---

## [src/components/editor/CanvasBlock.tsx](../src/components/editor/CanvasBlock.tsx)

**역할:** 옵시디언 스타일 무한 캔버스 블록. SVG 엣지, 팬/줌, 노드 드래그, 계층 접기/펼치기.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CanvasBlock` | `default function` | 무한 캔버스 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `Side` | `'top' \| 'bottom' \| 'left' \| 'right'` — 엣지 연결 방향 |
| `NodeColor` | `'' \| '1' ~ '6'` — 노드 색상 테마 |
| `NodeType` | `'h1' \| 'h2' \| 'h3' \| 'paragraph'` — 노드 계층 타입 |
| `CanvasNode` | `{ id, x, y, width, height, text, color, nodeType, collapsed, collapsedChildren }` |
| `CanvasEdge` | `{ id, fromNode, fromSide, toNode, toSide }` |
| `CanvasData` | `{ nodes: CanvasNode[], edges: CanvasEdge[] }` — content JSON 포맷 |
| `Viewport` | `{ x, y, scale }` — 팬/줌 상태 |
| `SNAP_GRID` | `20` px — 그리드 스냅 단위 |
| `SNAP_NODE_THR` | `12` px — 노드 스냅 감지 거리 |
| `NODE_STYLES` | color → `{ bg, border, header }` Tailwind 클래스 매핑 |
| `NODE_TYPE_STYLE` | nodeType → `{ fontSize, fontWeight }` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 팬/줌 | wheel 줌, 빈 배경 드래그 팬. readMode 시 줌 비활성화 |
| 노드 드래그 | mousedown → move → snap(20px 그리드) |
| 엣지 연결 | 노드 변 핸들 드래그 → SVG 베지어 곡선 |
| 접기/펼치기 | 자식 노드 숨김 + `collapsedChildren` 저장 |
| 색상/타입 변경 | 노드 헤더 버튼 클릭 |

---

## [src/components/editor/CanvasPageEditor.tsx](../src/components/editor/CanvasPageEditor.tsx)

**역할:** 캔버스 모드 렌더러 — 점 그리드 위에 블록을 절대 좌표로 배치. 드래그 이동 + 리사이즈 + ResizeObserver 자동 밀어내기.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CanvasPageEditor` | `default function` | 캔버스 페이지 렌더러 컴포넌트 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `GRID_SIZE` | `20` px — 스냅 그리드 |
| `DEFAULT_W` | `520` px — 기본 블록 너비 |
| `DEFAULT_H` | `120` px — 기본 블록 높이 |
| `GAP` | `20` px — 블록 간 기본 여백 |
| `MIN_W` / `MIN_H` | `200` / `60` px — 최소 크기 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `snap(value)` | `GRID_SIZE` 기준 반올림 |
| `estimateBlockHeight(block)` | 블록 타입별 초기 높이 추정 (image:500, video:360, canvas:420 등). ResizeObserver로 사후 보정 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 절대 배치 | 각 블록 `canvasX/Y/W` → `position: absolute` |
| 드래그 | 블록 헤더 핸들(`GripHorizontal`) 드래그 → `updateBlockCanvas()` |
| ResizeObserver | 실제 렌더 높이 측정 → 겹치는 아래 블록 자동 이동 |

---

## [src/components/editor/LayoutBlock.tsx](../src/components/editor/LayoutBlock.tsx)

**역할:** A4 용지 기준 다단 레이아웃 블록. 8종 빌트인 템플릿 + 커스텀 템플릿. 열/행 너비 드래그 조절.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `LayoutBlock` | `default function` | 레이아웃 블록 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `BuiltinTemplateId` | 8종 템플릿 ID 유니온 (`two-col`, `sidebar-left`, `sidebar-right`, `three-col`, `top-split`, `big-left`, `landscape-two`, `landscape-three`) |
| `Orientation` | `'portrait' \| 'landscape'` |
| `LayoutContent` | `{ template, orientation, slots: {a, b, c?}, cols?, rows?, height? }` — content JSON 포맷 |
| `PORTRAIT_TEMPLATES` | 세로 6종 템플릿 목록 |
| `LANDSCAPE_TEMPLATES` | 가로 2종 템플릿 목록 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `getTemplateCols(template, customTemplates)` | 템플릿 ID → 기본 열 비율 배열 반환 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 슬롯 렌더 | `LayoutSlot` 컴포넌트에 `Block[]` 전달 |
| 열 조절 | 슬롯 경계 드래그 → `cols` 배열 업데이트 |
| 행 조절 | `top-split`/`big-left` 전용 행 높이 드래그 |
| 전체 높이 | 하단 핸들 드래그 → `height` 저장 |

---

## [src/components/editor/LayoutSlot.tsx](../src/components/editor/LayoutSlot.tsx)

**역할:** 레이아웃 블록 안의 개별 슬롯 — `Block[]`을 받아 미니 Tiptap 에디터 목록으로 렌더링.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `LayoutSlot` | `default function` | 레이아웃 슬롯 컴포넌트 |

### 내부 컴포넌트

| 이름 | 설명 |
|------|------|
| `SlotBlockEditor` | 슬롯 내 블록별 미니 Tiptap 에디터. `onUpdate/onAddBelow/onDelete/isLast/focusOnMount` props |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 에디터 | `StarterKit(heading: levels [1,2,3])` + `Placeholder` 확장만 사용 |
| stale closure 방지 | `onUpdate/onAddBelow/onDelete/isLast` 모두 ref 패턴으로 래핑 |
| Enter | `onAddBelow()` → 슬롯에 새 블록 삽입 |
| Backspace (빈 블록) | `isLast=false` 이면 `onDelete()` → 블록 제거 |
