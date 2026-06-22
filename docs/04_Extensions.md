# 04. Extensions — Tiptap 커스텀 확장

> Tiptap의 기본 기능으로 지원되지 않는 편집 기능을 커스텀 확장으로 구현.
> 실제 등록 배열은 `src/extensions/editorExtensions.ts`의 `buildEditorExtensions()`에서 조립되고, `Editor.tsx`가 이를 `useEditor({ extensions })`에 전달한다.

---

## [src/extensions/editorExtensions.ts](../src/extensions/editorExtensions.ts)

**역할:** Tiptap 에디터에 등록할 확장 배열을 한 곳에서 조립하는 허브. `Editor.tsx`는 `buildEditorExtensions(t.editor.headingPlaceholder)`만 호출한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `buildEditorExtensions(headingPlaceholder)` | `function` | locale에서 받은 heading placeholder를 포함해 Tiptap 확장 배열을 반환 |

### 등록되는 주요 확장

| 확장 | 설명 |
|------|------|
| `StarterKit.configure(...)` | 기본 노드/마크. `codeBlock: false`, heading 1~6, `link.openOnClick: false`, `trailingNode: false` |
| `Placeholder` | heading에는 locale placeholder, 일반 문단에는 slash/mention/link 안내 placeholder 표시 |
| `Typography`, `Highlight`, `TextStyle`, `Color` | 타이포그래피, 멀티컬러 하이라이트, 인라인 스타일, 색상 |
| `FontFamily`, `FontSize` | 글꼴/글자 크기. `TextStyle` 뒤에 등록 |
| `InlineMath`, `FootnoteInline` | 인라인 수식/각주 원자 노드 |
| `TaskList`, `TaskItem` | 체크리스트. `TaskItem`은 nested 지원 |
| `Table`, `TableRow`, `TableHeader`, `TableCell` | 리사이즈 가능한 테이블 |
| `CustomCodeBlock` | `CodeBlockLowlight` + `CodeBlockView` NodeView. 기본 언어는 `javascript` |
| `TextAlign` | paragraph/heading 정렬 |
| `SearchHighlight`, `ArrowMark` | 검색 하이라이트와 화살표 마크 |

### 주의사항

- `StarterKit.trailingNode`는 `false`다. 이 프로젝트는 블록 하나가 독립 Editor라서 Tiptap의 trailing paragraph가 필요 없고, 표/목록 뒤 빈 줄이 남는 문제를 막는다.
- `CustomCodeBlock`이 내장 code block을 대체하므로 `StarterKit`의 `codeBlock`은 비활성화되어 있다.

---

## [src/extensions/FontSize.ts](../src/extensions/FontSize.ts)

**역할:** 선택된 텍스트에 인라인 `font-size`를 적용하는 커스텀 확장. `TextStyle` mark의 글로벌 속성으로 fontSize를 추가하는 방식.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FontSize` | `Extension` | FontSize Tiptap 확장 객체 |

### 추가되는 명령어 (Commands)

| 명령어 | 사용법 | 설명 |
|--------|--------|------|
| `setFontSize(size)` | `editor.chain().setFontSize('18px').run()` | 선택 텍스트에 글자 크기 적용 |
| `unsetFontSize()` | `editor.chain().unsetFontSize().run()` | 글자 크기 제거 (기본 크기로 복원) |

### 동작 방식

- `TextStyle` mark에 `fontSize` 속성을 추가 (`addGlobalAttributes`)
- HTML 저장: `<span style="font-size: 18px">` 형태
- HTML 복원: `element.style.fontSize` 파싱
- `BubbleMenuBar.tsx`에서 호출

---

## [src/extensions/InlineMath.ts](../src/extensions/InlineMath.ts)

**역할:** `$...$` 패턴을 입력하면 자동으로 KaTeX 인라인 수식 노드로 변환하는 확장.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `InlineMath` | `Node` | 인라인 수식 Tiptap 노드 확장 |

### 주요 특성

| 속성 | 값 | 설명 |
|------|-----|------|
| `group` | `'inline'` | 단락/제목 안에 삽입 가능 |
| `atom` | `true` | 단일 단위로 선택/삭제 (내부 커서 진입 불가) |
| `latex` 속성 | `string` | LaTeX 소스 문자열 |

### 동작 방식

| 단계 | 설명 |
|------|------|
| **InputRule** | `/(?<!\$)\$([^$\n]{1,100})\$(?!\$)$/` 정규식 — 닫는 `$` 입력 시 `$...$` 전체를 노드로 교체 |
| **NodeView** | `InlineMathView.tsx` (React 컴포넌트) — 미리보기(KaTeX 렌더링) ↔ 편집(input) 2모드 |
| **HTML 저장** | `<span data-inline-math data-latex="...">$latex$</span>` |
| **HTML 복원** | `span[data-inline-math]` 태그 감지 → `data-latex` 속성에서 LaTeX 복원 |

---

## [src/extensions/SearchHighlight.ts](../src/extensions/SearchHighlight.ts)

**역할:** 찾기/바꾸기 검색어와 일치하는 텍스트에 하이라이트 데코레이션을 추가하는 ProseMirror 플러그인 기반 확장.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `SearchHighlight` | `Extension` | 검색 하이라이트 Tiptap 확장 |
| `searchHighlightKey` | `PluginKey` | 외부에서 검색어를 전달할 때 사용하는 Transaction 메타 키 |

### 동작 방식

| 단계 | 설명 |
|------|------|
| **상태 관리** | Plugin 내부 상태로 `{ term, caseSensitive }` 유지. Transaction 메타로 전달받아 갱신 |
| **데코레이션** | `state.doc.descendants()`로 모든 텍스트 노드 순회 → 일치 위치에 `Decoration.inline(..., { class: 'find-highlight' })` 추가 |
| **업데이트 방식** | `Editor.tsx`가 `useFindReplaceStore()`를 구독하고 각 Editor 인스턴스에서 `editor.view.dispatch(tr.setMeta(searchHighlightKey, { term, caseSensitive }))` 호출 |
| **독립성** | 각 `Editor` 인스턴스에 독립적으로 동작 (stale closure 없음) |

---

## [src/extensions/FootnoteInline.ts](../src/extensions/FootnoteInline.ts)

**역할:** `[^각주 내용]` 패턴을 입력하면 자동으로 인라인 각주 노드로 변환하는 확장.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FootnoteInline` | `Node` | 인라인 각주 Tiptap 노드 확장 |

### 주요 특성

| 속성 | 값 | 설명 |
|------|-----|------|
| `group` | `'inline'` | 단락/제목 안에 삽입 |
| `atom` | `true` | 단일 단위로 선택/삭제 |
| `text` 속성 | `string` | 각주 본문 텍스트 |

### 동작 방식

| 단계 | 설명 |
|------|------|
| **InputRule** | `/\[\^([^\]\n]{1,200})\]$/` — 닫는 `]` 입력 시 `[^...]` 전체를 노드로 교체 |
| **NodeView** | `FootnoteView.tsx` — `getPos()` 기준으로 현재 노드의 문서 내 순번을 계산해 `[n]` 표시, 호버 시 툴팁으로 각주 텍스트 표시 |
| **HTML 저장** | `<span data-footnote data-text="...">` |
| **HTML 복원** | `span[data-footnote]` 태그 감지 → `data-text` 속성에서 복원 |

---

## [src/extensions/ArrowMark.ts](../src/extensions/ArrowMark.ts)

**역할:** 단어/문구에 화살표 마커(시작점 또는 끝점)를 부착하는 Tiptap Mark 확장. 같은 `arrowId`를 가진 start/end 쌍이 `ArrowLayer.tsx`에서 SVG 선으로 연결됨.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ArrowMark` | `Mark` | 화살표 마커 Tiptap Mark 확장 |
| `ARROW_COLORS` | `const` | 색상 이름 → HEX 매핑 `{ blue, red, green, purple, orange }` |
| `ARROW_COLOR_NAMES` | `const` | `ARROW_COLORS` 키 배열 (색상 피커용) |

### Mark 속성

| 속성 | 기본값 | 설명 |
|------|--------|------|
| `arrowId` | `null` | 화살표 식별자. 같은 ID의 start/end가 한 쌍 |
| `isStart` | `false` | 시작점 여부 (false = 끝점) |
| `color` | `'blue'` | CSS 색상 이름 또는 HEX |
| `opacity` | `1` | 투명도 0~1 |
| `arrowType` | `'margin'` | `'margin'` (여백 호) 또는 `'diagonal'` (대각 직선) |
| `xPosition` | `0` | margin 화살표 좌측 여백 위치 (0~30) |
| `startHead` | `false` | 시작점 화살촉 추가 여부 (양방향) |
| `endHead` | `true` | 끝점 화살촉 표시 여부 |

### 동작 방식

- 렌더링: 색상 점선 밑줄 + `data-arrow-*` 속성 부착 → `ArrowLayer.tsx`가 DOM에서 위치를 읽어 SVG 선 그림
- 사용: `BubbleMenuBar`에서 `editor.chain().setMark('arrowMark', attrs)` 직접 호출 (커스텀 명령어 없음)
- 연결: `ArrowStore`의 `connectingState`와 연동 — 시작 원 클릭 → 대기 상태 설정 → 끝 위치 클릭 시 mark 부착
