# Notion Clone — 개발 청사진 (Blueprint)

> **작성일:** 2026-02-21 | **최종 수정:** 2026-02-21 (블록 멘션 팝업 UX 완성 — 화면 절반 기준 포지셔닝 + 외부 클릭 시 트리거 텍스트 삭제)
> **목적:** 이 문서는 개발을 이어받는 AI(또는 개발자)가 맥락 없이도 즉시 작업을 이어갈 수 있도록 프로젝트의 모든 것을 기록합니다.

---

## 1. 프로젝트 개요

**목표:** Notion을 로컬에서 완전히 동작하는 오픈소스 클론으로 구현
- 인터넷 없이 완전 오프라인 동작
- 파일은 `vault/` 폴더에 JSON으로 저장 (사람이 읽을 수 있는 형식)
- 백엔드: FastAPI (Python) — 파일 시스템 CRUD
- 프론트엔드: Next.js 14 + Tiptap v3 에디터
- 실행 명령: `npm run dev` (Next.js 3000 + FastAPI 8000 동시 실행)

---

## 2. 기술 스택

| 영역 | 기술 | 버전 |
|---|---|---|
| 프레임워크 | Next.js App Router | 16.1.6 |
| UI 렌더링 | React | 19.2.3 |
| 에디터 | Tiptap | 3.20.x |
| 스타일 | Tailwind CSS v4 | 4.x |
| 상태관리 | Zustand + immer | 5.x + 11.x |
| 드래그앤드롭 | dnd-kit | 6.x / 10.x |
| 백엔드 | FastAPI + uvicorn | 0.129+ |
| 언어 | TypeScript + Python 3.14 | — |

### 중요 개발 규칙 (반드시 준수)
1. 모든 컴포넌트/함수/CSS: **한국어 주석 필수**
2. 각 함수 옆에 **Python 비교 주석** 추가 (예: `// Python으로 치면: def foo(): ...`)
3. `className`에 **멀티라인 템플릿 리터럴 금지** → hydration 에러 발생
4. Tailwind v4: **`@apply` 금지** (`@theme` 사용)
5. StarterKit에 Link가 포함됨 → **`@tiptap/extension-link` 별도 import 금지**

---

## 3. 폴더 구조

```
notion-clone/
├── backend/
│   ├── main.py                  # FastAPI 서버 전체 (1051줄)
│   └── requirements.txt         # fastapi, uvicorn, python-multipart
│
├── src/
│   ├── app/
│   │   ├── page.tsx             # 진입점 — 전체 레이아웃 (사이드바 + 에디터)
│   │   ├── layout.tsx           # HTML 루트 레이아웃
│   │   └── globals.css          # Tiptap 스타일 + CSS 변수 + 다크모드
│   │
│   ├── components/
│   │   ├── editor/
│   │   │   ├── Editor.tsx        # 블록 1개 = Tiptap 인스턴스 (574줄)
│   │   │   ├── PageEditor.tsx    # 페이지 렌더러 + 블록 dnd-kit
│   │   │   ├── PageList.tsx      # 왼쪽 사이드바 — 페이지/카테고리 목록
│   │   │   ├── Sidebar.tsx       # 사이드바 래퍼
│   │   │   ├── CategorySidebar.tsx # 카테고리 드래그 정렬
│   │   │   ├── BubbleMenuBar.tsx # 텍스트 선택 시 나타나는 인라인 툴바
│   │   │   ├── SlashCommand.tsx  # / 입력 시 블록 타입 선택 메뉴
│   │   │   ├── BlockMenu.tsx     # 블록 우측 점 3개 메뉴 (삭제/복제 등)
│   │   │   ├── ImageBlock.tsx    # 이미지 업로드 + 표시 블록
│   │   │   ├── TableToolbar.tsx  # 테이블 상단 툴바
│   │   │   ├── CodeBlockView.tsx # 코드 블록 (lowlight 하이라이트)
│   │   │   ├── ToggleBlock.tsx   # 접고/펼치는 토글 블록
│   │   │   ├── KanbanBlock.tsx   # 칸반 보드 블록 (중첩 dnd-kit)
│   │   │   ├── AdmonitionBlock.tsx # 콜아웃 블록 (팁/정보/경고/위험)
│   │   │   ├── MentionPopup.tsx  # @멘션 팝업
│   │   │   ├── EmojiPicker.tsx   # 페이지 아이콘 이모지 선택기
│   │   │   ├── CoverPicker.tsx   # 페이지 커버 선택기
│   │   │   ├── GlobalSearch.tsx  # 전체 텍스트 검색 팝업 (Ctrl+K)
│   │   │   └── ShortcutModal.tsx # 단축키 안내 모달
│   │   │
│   │   ├── settings/
│   │   │   ├── SettingsModal.tsx  # 설정 모달 (6탭 레이아웃)
│   │   │   └── tabs/
│   │   │       ├── AppearanceTab.tsx # 테마 (라이트/다크/시스템)
│   │   │       ├── EditorTab.tsx     # 글꼴/크기/줄간격
│   │   │       ├── PluginsTab.tsx    # 플러그인 ON/OFF 토글
│   │   │       ├── DataTab.tsx       # JSON·MD 내보내기 / 가져오기
│   │   │       ├── StorageTab.tsx    # vault 경로 + 통계
│   │   │       └── DebugTab.tsx      # 서버 로그 뷰어
│   │   │
│   │   └── ui/
│   │       ├── command.tsx       # shadcn/ui Command (cmdk 래퍼)
│   │       └── dialog.tsx        # shadcn/ui Dialog
│   │
│   ├── store/
│   │   ├── pageStore.ts          # 페이지/카테고리 전역 상태 + API 동기화 (562줄)
│   │   └── settingsStore.ts      # 앱 설정 전역 상태 (localStorage 영속)
│   │
│   ├── lib/
│   │   ├── api.ts                # FastAPI 통신 함수 모음
│   │   └── utils.ts              # tailwind-merge 유틸
│   │
│   └── types/
│       └── block.ts              # 모든 타입 정의 (Block, Page, Category 등)
│
├── vault/                        # 실제 데이터 저장소 (gitignore 권장)
│   ├── _index.json               # 메타데이터 (페이지 순서, 카테고리, 현재 페이지)
│   ├── {제목_날짜_uuid}/
│   │   ├── content.json          # 페이지 데이터
│   │   └── images/               # 해당 페이지의 이미지
│   └── {카테고리폴더}/{페이지폴더}/
│       └── content.json
│
├── BLUEPRINT.md                  # 이 파일
├── package.json
└── next.config.ts
```

---

## 4. 핵심 아키텍처

### 4-1. 데이터 흐름
```
사용자 입력
  → Tiptap 에디터 (Editor.tsx)
  → usePageStore.updateBlock() [Zustand + immer]
  → scheduleSave() [500ms 디바운스]
  → api.savePage() [fetch PUT]
  → FastAPI backend/main.py
  → vault/{pageFolder}/content.json 파일 저장
```

### 4-2. 블록 아키텍처 (핵심 개념)
- **1블록 = 1 Tiptap 인스턴스** (노션과 동일한 방식)
- 각 블록은 `Editor.tsx`로 렌더링
- 특수 블록(image, table, kanban, toggle)은 Tiptap 에디터를 건너뛰고 별도 컴포넌트로 렌더링
- 블록 간 이동: `PageEditor.tsx`의 dnd-kit `DndContext + SortableContext`

### 4-3. vault 폴더 구조
```
_index.json = {
  "currentPageId": "uuid",
  "pageOrder": ["uuid1", "uuid2", ...],
  "pages": [{ "id": "uuid", "folder": "제목_날짜_uuid" }, ...],
  "categories": [{ "id": "uuid", "name": "이름", "folder": "폴더명" }, ...],
  "categoryMap": { "pageId": "categoryId" },
  "categoryOrder": ["categoryId1", ...]
}

content.json = {
  "id": "uuid",
  "title": "페이지 제목",
  "icon": "📝",
  "cover": "gradient:linear-gradient(...)" | "color:#hexcode" | "https://...",
  "coverPosition": 50,
  "tags": ["태그1", "태그2"],
  "starred": false,
  "blocks": [...],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### 4-4. 설정 시스템
- `settingsStore.ts`: Zustand + persist → `localStorage['notion-clone-settings']`에 자동 저장
- 테마: `applyTheme(theme)` → `<html>` 요소에 `.dark` 클래스 토글
- 다크모드: `globals.css`의 `html.dark` CSS 변수 오버라이드 + `!important`로 Tailwind 유틸 오버라이드
- 편집기 스타일: `applyEditorStyle()` → `--editor-font`, `--editor-size`, `--editor-lh` CSS 변수로 주입
- 플러그인 ON/OFF: `plugins.kanban` 등 → `SlashCommand.tsx`에서 메뉴 필터링

---

## 5. 현재까지 구현된 기능 목록

### ✅ 에디터 핵심
- [x] 블록 기반 에디터 (paragraph, heading1~3, bulletList, orderedList, taskList)
- [x] 슬래시 커맨드 메뉴 (`/` 입력 시 블록 선택)
- [x] 블록 드래그앤드롭 정렬 (dnd-kit)
- [x] 블록 간 Enter/Backspace 네비게이션
- [x] 인라인 서식 툴바 — BubbleMenuBar (굵게, 이탤릭, 취소선, 링크, 글자색, 배경색)
- [x] 블록 컨텍스트 메뉴 (점 3개) — 삭제, 복제, 위/아래 이동

### ✅ 특수 블록
- [x] 이미지 블록 — 업로드 + `/static/...` URL로 서빙
- [x] 테이블 블록 — 3×3 기본, 행/열 추가·삭제 툴바
- [x] 코드 블록 — lowlight 구문 강조 (40개+ 언어)
- [x] 토글 블록 — 접고/펼치기, 자식 블록 지원
- [x] 칸반 블록 — 3열 기본, 카드 추가/삭제/열 간 드래그
- [x] 콜아웃(Admonition) 블록 — 팁/정보/경고/위험 4종류, 아이콘 클릭으로 종류 순환
- [x] 구분선 블록

### ✅ 페이지 관리
- [x] 페이지 생성/삭제/복제
- [x] 페이지 제목 편집 (vault 폴더 자동 rename)
- [x] 페이지 아이콘 이모지 선택
- [x] 페이지 커버 — URL / 그라디언트 / 단색 / 위치 조정
- [x] 페이지 태그 (생성/삭제/필터)
- [x] 페이지 즐겨찾기 (⭐ 상단 고정)
- [x] 페이지 검색 (사이드바 검색창)
- [x] 페이지 드래그앤드롭 정렬

### ✅ 카테고리 (폴더) 시스템
- [x] 카테고리 생성/삭제/이름 변경
- [x] 페이지를 카테고리로 드래그 이동
- [x] 카테고리 드래그 정렬
- [x] 카테고리 접고/펼치기

### ✅ 설정 패널 (⚙️)
- [x] 모양 탭 — 라이트/다크/시스템 테마
- [x] 편집기 탭 — 글꼴(sans/serif/mono), 크기(14~20px), 줄간격
- [x] 플러그인 탭 — 칸반(ON), 캘린더(ON), 콜아웃(ON), 최근 파일(ON), 빠른 캡처(ON), Excalidraw(준비 중)
- [x] 데이터 탭 — JSON 백업 다운로드, 마크다운 ZIP 다운로드, JSON 가져오기
- [x] 저장 위치 탭 — vault 경로, 페이지 수, 용량 표시
- [x] 디버그 탭 — 서버 로그 뷰어 (최근 100개)

### ✅ 기타
- [x] @멘션 팝업 (`@` / `[[` 입력 시 페이지+블록 통합 검색 팝업)
- [x] 내부 페이지 링크 — 연보라 칩 스타일, 클릭 시 해당 페이지로 이동
- [x] 내부 블록 링크 — 청록 칩 스타일, 클릭 시 해당 페이지로 이동 후 블록으로 스크롤
- [x] 팝업 포지셔닝 UX — 화면 절반 기준 (위쪽 절반→팝업 아래, 아래쪽 절반→팝업 위) + 뷰포트 잘림 방지
- [x] 팝업 외부 클릭 닫기 — 클릭 시 트리거 텍스트(`@`, `[[`, `/`) 자동 삭제 (팝업 재오픈 방지)
- [x] 단축키 안내 모달
- [x] 이미지 업로드 + FastAPI 정적 파일 서빙
- [x] 500ms 디바운스 자동 저장
- [x] 최근 파일 위젯 — 사이드바 하단, 최근 열어본 페이지 5개 표시 (localStorage 영속)
- [x] 빠른 노트 캡처 (Quick Add) — `Ctrl+Alt+N`으로 미니 팝업, 제목+메모 즉시 저장
- [x] 캘린더 위젯 — 메모 목록 상단 미니 달력, 날짜 클릭으로 해당 날짜 메모 필터
- [x] 개별 페이지 내보내기 — 에디터 상단 ⬇ 버튼 → Markdown(.md) / PDF(브라우저 인쇄)
- [x] 전체 텍스트 검색 (`Ctrl+K`) — 페이지 제목 + 블록 내용 전문 검색, 키보드 탐색(↑↓ Enter), 검색어 하이라이트

---

## 6. FastAPI 엔드포인트 전체 목록

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/pages` | 모든 페이지 + 카테고리 + 순서 조회 |
| POST | `/api/pages` | 새 페이지 생성 |
| PUT | `/api/pages/{id}` | 페이지 저장 (upsert) |
| DELETE | `/api/pages/{id}` | 페이지 삭제 |
| PATCH | `/api/pages/reorder` | 페이지 순서 변경 |
| PATCH | `/api/current` | 현재 페이지 ID 저장 |
| POST | `/api/pages/{id}/images` | 이미지 업로드 |
| PATCH | `/api/pages/{id}/category` | 페이지 카테고리 이동 |
| POST | `/api/categories` | 카테고리 생성 |
| PUT | `/api/categories/{id}` | 카테고리 이름 변경 |
| DELETE | `/api/categories/{id}` | 카테고리 삭제 |
| PATCH | `/api/categories/reorder` | 카테고리 순서 변경 |
| GET | `/api/export/json` | vault → JSON 파일 다운로드 |
| GET | `/api/export/markdown` | vault → 마크다운 ZIP 다운로드 |
| POST | `/api/import` | JSON 백업에서 vault 복구 |
| GET | `/api/settings/vault-path` | vault 경로 + 통계 |
| GET | `/api/debug/logs` | 서버 로그 (최근 100개) |
| GET | `/api/search?q=` | 페이지 제목 + 블록 내용 전문 검색 |
| GET | `/static/{path}` | 이미지 파일 정적 서빙 |

---

## 7. Tiptap 확장 구성 (Editor.tsx)

```typescript
// 현재 등록된 확장 목록
StarterKit.configure({
  heading: { levels: [1, 2, 3] },
  link: { openOnClick: false },  // StarterKit 내장 Link
})
Placeholder          // 빈 블록 힌트 텍스트
Typography           // 자동 타이포그래피 교정
Highlight.configure({ multicolor: true })  // 배경색 피커
TextStyle            // 인라인 스타일 마크
Color                // 글자색 피커
TaskList             // 체크박스 목록
TaskItem.configure({ nested: true })
Table.configure({ resizable: false })
TableRow, TableHeader, TableCell
CodeBlockLowlight.configure({ lowlight })  // 구문 강조
```

**주의:** `@tiptap/extension-link`를 별도로 import하면 충돌 → StarterKit 내장만 사용

---

## 8. 설정 스토어 구조 (settingsStore.ts)

```typescript
// localStorage 키: 'notion-clone-settings'
{
  theme: 'light' | 'dark' | 'auto',
  fontFamily: 'sans' | 'serif' | 'mono',
  fontSize: 14 | 16 | 18 | 20,
  lineHeight: number,  // 1.4 ~ 2.0
  plugins: {
    kanban: boolean,      // ✅ 구현됨
    calendar: boolean,    // ✅ 구현됨
    admonition: boolean,  // ✅ 구현됨
    excalidraw: boolean,  // ⬜ 미구현
    recentFiles: boolean, // ✅ 구현됨
    quickAdd: boolean,    // ✅ 구현됨
  }
}
```

---

## 9. 앞으로 개발할 기능 (우선순위 순)

### 🔴 우선순위 높음

#### ~~9-1. Admonition (콜아웃) 블록~~ ✅ 완료 (2026-02-21)
- `src/components/editor/AdmonitionBlock.tsx` 신규 생성
- `block.ts`에 `'admonition'` 타입 추가
- 아이콘 클릭으로 팁→정보→경고→위험 순환
- `/콜아웃` 슬래시 커맨드로 삽입
- 설정 패널 플러그인 탭에서 ON/OFF 가능

#### ~~9-2. 최근 파일 위젯~~ ✅ 완료 (2026-02-21)
- `pageStore.ts`에 `recentPageIds` + `pushRecentPage()` 추가
- `PageList.tsx` 사이드바 하단에 최근 5개 페이지 표시
- `localStorage['notion-clone-recent']`에 자동 저장/복원
- 설정 패널 플러그인 탭에서 ON/OFF 가능

#### ~~9-3. Quick Add (빠른 노트 캡처)~~ ✅ 완료 (2026-02-21)
- `src/components/editor/QuickAddModal.tsx` 신규 생성
- `Ctrl+Alt+N` 전역 단축키로 미니 팝업 창 열기/닫기
- 제목(필수) + 메모(선택) 입력 → `addPage()` 후 첫 블록에 content 저장
- `page.tsx`에 `quickAddOpen` 상태 + `plugins.quickAdd` 체크
- 설정 패널 플러그인 탭에서 ON/OFF 가능 (기본값: ON)

### 🟡 우선순위 중간

#### ~~9-4. 캘린더 사이드바 위젯~~ ✅ 완료 (2026-02-21)
- `src/components/editor/CalendarWidget.tsx` 신규 생성
- `PageList.tsx` 검색바 아래에 월간 달력 삽입
- 날짜 클릭 → `selectedDate` 필터로 해당 날짜 생성 페이지만 표시
- 페이지가 있는 날짜에 파란 점(●) 표시, 오늘 파란 배경
- 같은 날짜 재클릭 또는 "필터 해제" 버튼으로 필터 취소
- 설정 패널 플러그인 탭에서 ON/OFF 가능 (기본값: ON)

#### ~~9-5. 페이지 내 전체 검색 (Ctrl+K)~~ ✅ 완료 (2026-02-21)
- `src/components/editor/GlobalSearch.tsx` 신규 생성
- 백엔드: `GET /api/search?q=검색어` 엔드포인트 추가 (HTML 스트립 + 자식 블록 포함)
- 프론트: `Ctrl+K` 전역 단축키 → 오버레이 팝업
- 결과: 페이지 아이콘 + 제목 + 스니펫 + 블록 타입 배지
- 키보드 탐색: ↑↓ 이동, Enter 선택, Esc 닫기, 검색어 하이라이트

#### ~~9-6. 블록 링크 / 페이지 링크~~ ✅ 완료 (2026-02-21)
- `[[페이지이름` 입력으로 페이지 링크 팝업 열기 (기존 `@` 트리거와 동일 팝업)
- `Editor.tsx` `checkMention()` — `@` + `[[` 두 가지 트리거 감지
- `MentionPopup.tsx` — `trigger` prop 추가, 헤더 문구 변경
- `globals.css` — `a[href^="#page-"]` 연보라 칩 스타일 + 다크모드 지원
- 클릭 시 해당 페이지로 이동하는 기능은 기존부터 동작 (`setCurrentPage` 연결됨)

#### ~~9-6 확장. 블록 수준 멘션~~ ✅ 완료 (2026-02-21)
- **팝업 UI 개편**: 페이지/블록 두 섹션으로 그룹화 (📄 페이지 / 🧱 블록)
- `MentionPopup.tsx` 완전 리라이트
  - `MentionItem` 유니언 타입 export: `{ kind:'page'; page }` | `{ kind:'block'; page; block; plainText }`
  - 클라이언트 사이드 검색 (`useMemo` — 서버 API 불필요, pages 스토어 활용)
  - heading 블록 우선 표시, 한 페이지 최대 2개, 전체 최대 6개
  - 브레드크럼 표시: `{pageIcon} {pageTitle} › [타입배지] 블록내용`
  - **화면 절반 기준 포지셔닝**: 커서 Y < 화면 절반 → 팝업 아래, 커서 Y ≥ 화면 절반 → 팝업 위
  - **X 잘림 방지**: `clamp(left, 8, vw - POPUP_W - 8)`
  - **`onClickOutside` prop 추가**: 외부 클릭 시 `@query`/`[[query` 텍스트 삭제 후 닫힘
- `Editor.tsx` 수정
  - `handleMentionSelect(item: MentionItem)` — 페이지/블록 분기 처리
  - 블록 링크 href: `#block-{pageId}:{blockId}` (콜론 구분자로 UUID 하이픈과 혼동 방지)
  - 클릭 핸들러: `#block-` 링크 → `setCurrentPage(pageId)` + 150ms 후 `scrollIntoView`
  - 5개 루트 div에 `id={block.id}` 추가 (scrollIntoView 앵커)
  - `onClickOutside` 콜백: `deleteRange({ from: mentionMenu.from, to: cursorPos })` + 팝업 닫기
- `SlashCommand.tsx` 수정
  - **`popupRef` + 외부 클릭 핸들러 추가** (`onClickOutside` prop)
  - **X 잘림 방지**: `useMemo`로 `adjustedLeft` 계산
  - `Editor.tsx`의 `checkSlash`: 화면 절반 기준 Y 포지셔닝 + `from` 위치 저장
  - `onClickOutside` 콜백: `deleteRange({ from: slashMenu.from, to: cursorPos })` + 팝업 닫기
- `globals.css` — `a[href^="#block-"]` 청록(teal) 칩 스타일 + 다크모드 지원

### 🟢 앞으로 개발할 기능

#### 9-7. Excalidraw 손그림 블록 (추천 1순위)
- `excalidraw` npm 패키지 설치: `npm install @excalidraw/excalidraw`
- `src/components/editor/ExcalidrawBlock.tsx` 신규 생성
  - Excalidraw 컴포넌트 동적 임포트 (`next/dynamic`, SSR: false)
  - content에 JSON 직렬화 저장: `{ elements: [...], appState: {...} }`
  - 저장 버튼 또는 onChange 디바운스로 `updateBlock` 호출
- `src/types/block.ts` — `BlockType`에 `'excalidraw'` 추가
- `src/store/settingsStore.ts` — `plugins.excalidraw` (기본값 false → 켜면 활성화)
- `src/components/editor/SlashCommand.tsx` — `{ icon: '✏️', name: 'Excalidraw', type: 'excalidraw' }` 추가
- `src/components/editor/Editor.tsx` — `ExcalidrawBlock` 렌더 브랜치 추가
- `src/components/settings/tabs/PluginsTab.tsx` — `available: true`로 변경

#### 9-8. 블록 히스토리 / Undo-Redo 개선
- 현재 Tiptap 내부 undo만 동작 (블록 삭제·이동은 undo 안 됨)
- `src/store/pageStore.ts`에 undo/redo 스택 추가
  ```ts
  undoStack: PageSnapshot[]  // 최대 50개
  redoStack: PageSnapshot[]
  undo() / redo() 액션
  ```
- `Ctrl+Z` / `Ctrl+Shift+Z` 글로벌 단축키 연결 (page.tsx)
- 대상 동작: 블록 추가, 삭제, 이동, 타입 변경

#### ~~9-9. 페이지 내보내기 (개별)~~ ✅ 완료 (2026-02-21)
- `PageEditor.tsx` 상단 우측에 `⬇ 내보내기` 드롭다운 버튼 추가
- Markdown: 블록별 변환 함수 `blockToMarkdown()` → `.md` 파일 다운로드
  - 토글: header + body 항상 완전히 펼쳐서 변환
  - 칸반: 열별 섹션으로 변환, 어드모니션: `> [!TIP]` 형식
  - 테이블: 마크다운 표 형식으로 변환
- PDF: `window.print()` + `@media print` CSS
  - 이미지: `max-width: 100%` 자동 축소
  - 사이드바/버튼 숨기기, 페이지 여백 설정
  - 배경색 인쇄 허용 (`print-color-adjust: exact`)

#### ~~9-10. 전체 페이지 검색 (Ctrl+K)~~ ✅ 완료 (9-5와 통합)

#### 9-11. 모바일 반응형
- 현재 데스크탑 전용 레이아웃
- 구현 범위:
  - `page.tsx` — 사이드바 햄버거 메뉴 (`md:flex hidden` 토글)
  - `PageList.tsx` — 모바일에서 전체 너비 드로어(drawer)로 변환
  - `PageEditor.tsx` — 패딩/마진 반응형 조정 (`px-4 md:px-16`)
  - `BubbleMenuBar.tsx` — 버튼 크기 터치 친화적으로 확대
  - dnd-kit 터치 센서 추가: `TouchSensor` (`activationConstraint: { delay: 250 }`)

#### 9-12. 페이지 간 블록 이동/복사
- 블록 컨텍스트 메뉴(점 3개)에 "다른 페이지로 이동/복사" 추가
- 대상 페이지 선택 팝업 (MentionPopup 재활용 가능)
- `pageStore.ts`에 `moveBlock(fromPageId, toPageId, blockId)` 추가

#### 9-13. 페이지 템플릿
- 자주 쓰는 페이지 구조를 템플릿으로 저장/불러오기
- 새 페이지 생성 시 "템플릿으로 시작" 옵션
- `vault/_templates/` 폴더에 저장
- 기본 제공 템플릿: 회의록, 프로젝트 계획, 일일 저널

---

## 10. 새 플러그인 블록 추가 방법 (패턴)

새 블록 타입을 추가할 때 반드시 수정해야 하는 파일들:

```
1. src/types/block.ts
   → BlockType union에 새 타입 추가
   예: | 'admonition'

2. src/store/settingsStore.ts
   → PluginSettings 인터페이스에 새 플러그인 키 추가
   예: admonition: boolean

3. src/components/editor/SlashCommand.tsx
   → COMMANDS 배열에 새 항목 추가
   → pluginBlockMap에 새 블록↔플러그인 매핑 추가

4. src/components/editor/Editor.tsx
   → applyBlockType() 함수에 새 타입 guard 추가
   → handleSlashSelect()에 초기 content 설정
   → JSX 렌더 영역에 새 블록 컴포넌트 렌더 브랜치 추가

5. src/components/editor/NewBlock.tsx (새로 생성)
   → 실제 블록 UI 컴포넌트

6. src/components/settings/tabs/PluginsTab.tsx
   → PLUGIN_LIST에 새 플러그인 항목 추가, available: true로 변경
```

---

## 11. 알려진 버그 및 주의사항

### PDF 내보내기 레이아웃 (해결됨 — 2026-02-21)
- **증상 1:** 사이드바가 함께 출력되고 본문이 잘림
  - **원인:** `#app-layout`이 `flex h-screen overflow-hidden` → `main`이 flex 자식으로 높이 제한
  - **해결:** `@media print { #app-layout { display: block; height: auto; overflow: visible } }`
- **증상 2:** 커버 이미지가 본문과 겹침
  - **원인:** `@media print { img { height: auto !important } }`가 커버 `h-full`을 덮어씀
  - **해결:** `.cover-area` 클래스 추가 → `@media print { .cover-area { height: 13rem; overflow: hidden } .cover-area img { height: 100%; object-fit: cover } }`
- **증상 3:** 피커 영역 `h-12`가 인쇄 시 빈 공간 차지
  - **해결:** `h-12` 래퍼에 `print-hide` 추가
- **내용 시작 위치 최적화:**
  - `.content-body` 클래스 추가 → `@media print { padding-left: 1rem; padding-right: 2rem; max-width: none }`
  - `@page { margin: 1cm 1.5cm }` (기존 1.5cm 2cm에서 축소)

### dnd-kit hydration 에러 (해결됨 — 2026-02-21)
- **증상:** `aria-describedby="DndDescribedBy-0"` vs `"DndDescribedBy-1"` 불일치
- **원인:** `DndContext`에 `id`를 미지정 → 전역 카운터 자동 증가 → SSR/CSR 순서 불일치
- **해결:** 모든 `DndContext`에 고정 `id` 부여
  - `page.tsx`: `id="dnd-main"`
  - `PageEditor.tsx`: `id="dnd-blocks"`
  - `KanbanBlock.tsx`: `id={\`dnd-kanban-${blockId}\`}`

### BubbleMenuBar 다중 인스턴스 문제 (해결됨)
- 각 블록마다 BubbleMenuBar 인스턴스가 있고 모두 `document.selectionchange` 구독
- **반드시** `editor.view.dom.contains(range.commonAncestorContainer)` 체크로 자신의 에디터인지 확인
- 이 체크 없으면 다른 블록에 서식이 적용되는 버그 발생

### className 멀티라인 금지
```tsx
// ❌ 금지 — Next.js hydration 에러
className={`
  flex items-center
  text-gray-500
`}

// ✅ 올바른 방식
className="flex items-center text-gray-500"
// 또는
className={condition ? "flex items-center" : "hidden"}
```

### Tiptap Color/Highlight 동작
- `setColor(color)` → selection이 collapsed이면 "stored mark" → 이후 입력에만 적용
- 기존 텍스트에 색 적용하려면 반드시 텍스트를 선택한 상태에서 실행
- `editor.commands.X()`는 항상 `true` 반환 (성공/실패 구분 불가)

### 이미지 URL 구조
- 업로드된 이미지: `http://localhost:8000/static/{pageFolder}/images/{uuid}.jpg`
- 페이지 제목/카테고리 변경 시 폴더가 rename → 이미지 URL도 함께 갱신 (백엔드에서 처리)

---

## 12. 개발 환경 설정

```bash
# 의존성 설치
npm install
pip install -r backend/requirements.txt

# 개발 서버 실행 (Next.js 3000 + FastAPI 8000 동시)
npm run dev

# Next.js만 실행
npm run dev:next

# FastAPI만 실행
npm run dev:api
```

**포트:**
- Next.js: http://localhost:3000
- FastAPI: http://localhost:8000
- FastAPI 문서: http://localhost:8000/docs

---

## 13. 중요 파일별 핵심 로직 요약

### `backend/main.py`
- `VAULT_DIR = Path(__file__).parent.parent / "vault"` — 데이터 루트
- `load_index() / save_index()` — `_index.json` 읽기/쓰기
- 페이지 폴더명 형식: `{제목}_{날짜}_{uuid8자리}` (특수문자 제거)
- 제목 변경 시 폴더 rename + 이미지 URL 일괄 교체 로직 포함
- `MemoryLogHandler` — deque(maxlen=100)로 최근 로그 보관

### `src/store/pageStore.ts`
- `scheduleSave(pageId)` — 500ms 디바운스 후 API 저장
- `loadPages()` — 앱 시작 시 백엔드에서 전체 데이터 로드
- `updateBlock(pageId, blockId, updates)` — immer로 불변 업데이트

### `src/components/editor/Editor.tsx`
- 한 블록 = 한 Tiptap 인스턴스
- `applyBlockType(type)` — 슬래시 커맨드로 블록 타입 변환
- 특수 블록(image/table/kanban/toggle)은 Tiptap 없이 별도 컴포넌트로 렌더
- `useSortable({ id: block.id })` — PageEditor의 DndContext와 연결

### `src/components/editor/PageEditor.tsx`
- `DndContext + SortableContext` — 블록 드래그앤드롭
- `activationConstraint: { distance: 8 }` — 오발동 방지
- 커버 이미지, 이모지, 태그 입력 UI 포함

### `src/components/editor/KanbanBlock.tsx`
- 중첩 `DndContext` (PageEditor DndContext 안에 또 하나)
- `useDroppable` — 열(column)을 드롭 영역으로 등록
- `columnsRef` — 드래그 핸들러의 stale closure 방지
- content에 JSON 직렬화: `{ columns: [{id, title, cards: [{id, title}]}] }`

---

*이 청사진은 2026-02-21 기준 구현 상태를 반영합니다.*
*새 기능 구현 후 해당 섹션(5번, 9번)을 업데이트해 주세요.*
