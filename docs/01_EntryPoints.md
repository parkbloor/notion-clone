# 01. Entry Points — 진입점

> 앱이 시작될 때 가장 먼저 실행되는 파일들.
> Next.js App Router 구조상 `layout.tsx` → `page.tsx` 순서로 마운트된다.

---

## [src/app/layout.tsx](../src/app/layout.tsx)

**역할:** Next.js 루트 레이아웃. 모든 페이지를 감싸는 최상위 HTML 구조를 정의하고, 전역 폰트와 CSS를 로딩한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `metadata` | `const` | 앱 title/description 메타데이터 (Next.js 빌드 타임 주입) |
| `RootLayout` | `default function` | `<html lang="ko">` + `<body>` 껍데기. 폰트 CSS 변수를 className에 등록하고 `<Toaster>`를 마운트 |

### 내부 로직

| 이름 | 설명 |
|------|------|
| `geistSans` / `geistMono` | UI 기본 폰트. `--font-geist-sans` / `--font-geist-mono` CSS 변수로 주입 |
| `inter` | 에디터 영문 폰트 프리셋 1. `--font-inter` CSS 변수 |
| `playfairDisplay` | 에디터 영문 폰트 프리셋 2. `--font-playfair` CSS 변수 |
| `jetbrainsMono` | 에디터 코드 폰트 프리셋. `--font-jetbrains-mono` CSS 변수 |

> **한국어 폰트**(Noto Sans KR, Noto Serif KR, Gowun Dodum)는 `next/font/google`가 미지원이라 `globals.css`에서 Google Fonts CDN `@import`로 별도 로딩.

---

## [src/app/page.tsx](../src/app/page.tsx)

**역할:** 앱의 실질적인 진입점 (`'use client'`). 사이드바 + 에디터 + 모든 오버레이를 조합하는 최상위 컴포넌트. 전역 단축키 등록과 DnD 컨텍스트 제공도 담당한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `Home` | `default function` | 앱 전체 UI를 렌더링하는 루트 컴포넌트 |

### 주요 내부 상태 (useState)

| 상태 | 타입 | 설명 |
|------|------|------|
| `shortcutOpen` | `boolean` | 단축키 안내 모달 열림 여부 |
| `sidebarOpen` | `boolean` | 모바일 사이드바 열림 여부 (햄버거 토글) |
| `settingsOpen` | `boolean` | 설정 모달 열림 여부 |
| `quickAddOpen` | `boolean` | 빠른 노트 팝업 열림 여부 |
| `searchOpen` | `boolean` | 전체 검색 팝업 열림 여부 |
| `commandPaletteOpen` | `boolean` | 커맨드 팔레트 열림 여부 |
| `dbViewActive` | `boolean` | `true`이면 에디터 대신 DatabaseView 렌더링 |
| `graphViewOpen` | `boolean` | 그래프 뷰 오버레이 열림 여부 |
| `calendarOpen` | `boolean` | 전체 캘린더 오버레이 열림 여부 |
| `dayPlannerOpen` | `boolean` | Day Planner 패널 열림 여부 |
| `trashOpen` | `boolean` | 휴지통 패널 열림 여부 |
| `splitPageId` | `string \| null` | 스플릿 뷰 오른쪽 패널에 표시할 페이지 ID |
| `splitRatio` | `number` | 스플릿 뷰 좌우 비율 (0.2 ~ 0.8, 기본 0.5) |

### 주요 내부 함수

| 함수 | 설명 |
|------|------|
| `getISOWeek(date)` | ISO 8601 주차 계산 (1월 첫째 목요일이 속한 주 = 1주) |
| `openDailyNote()` | 오늘 날짜 `일간 노트 YYYY-MM-DD` 페이지를 찾거나 없으면 템플릿으로 생성 |
| `openWeeklyNote()` | 이번 주 `주간 노트 YYYY-WNN` 페이지를 찾거나 없으면 생성 |
| `openMonthlyNote()` | 이번 달 `월간 노트 YYYY-MM` 페이지를 찾거나 없으면 생성 |
| `handleSplitResizeStart(e)` | 스플릿 구분선 드래그 시작. `mousemove` 리스너 등록 → `splitRatio` 실시간 갱신 |

### 전역 단축키 등록 (useEffect)

| 단축키 | 동작 | 플러그인 조건 |
|--------|------|--------------|
| `Ctrl+Alt+N` | 빠른 노트 팝업 토글 | `plugins.quickAdd` ON |
| `Ctrl+K` | 전체 검색 토글 | 없음 |
| `Ctrl+P` | 커맨드 팔레트 토글 | 없음 |
| `Ctrl+Shift+F` | 집중 모드 토글 | `plugins.focusMode` ON |
| `Ctrl+G` | 그래프 뷰 토글 | 없음 |
| `Ctrl+Shift+C` | 캘린더 오버레이 토글 | 없음 |
| `Ctrl+Shift+D` | Day Planner 패널 토글 | 없음 |
| `Ctrl+Alt+D` | 오늘 일간 노트 열기 | `plugins.periodicNotes` ON |
| `Ctrl+Alt+W` | 이번 주 주간 노트 열기 | `plugins.periodicNotes` ON |
| `Ctrl+Alt+M` | 이번 달 월간 노트 열기 | `plugins.periodicNotes` ON |
| `Ctrl+Shift+R` | 읽기 모드 토글 (`toggle-read-mode` CustomEvent 발행) | 없음 |
| `Ctrl+Z` | 블록 구조 Undo | contenteditable 외부에서만 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 블록 구조 Redo | contenteditable 외부에서만 |

### 초기화 로직 (useEffect)

| 순서 | 동작 |
|------|------|
| 1 | `loadFromServer()` — FastAPI에서 페이지+카테고리 목록 로딩 |
| 2 | `applyTheme()` + `applyThemePreset()` + `applyEditorStyle()` — 저장된 외관 설정 복원 |
| 3 | 세션 복원 — `localStorage['notion-clone-session']`에서 탭/스플릿 상태 복원 |
| 4 | Web Notification 스케줄러 — `reminder=true`인 날짜 속성 탐색 후 알림 발송 |

### DnD 구조

`DndContext` (dnd-kit) 하나로 **카테고리 정렬**과 **페이지→카테고리 드래그**를 동시에 처리.
`onDragEnd`에서 드래그 대상 타입(`category` vs `page`)을 구분해 각각 `reorderCategories` / `movePageToCategory` 호출.

---

## [src/app/globals.css](../src/app/globals.css)

**역할:** 전역 CSS 파일. Tailwind v4 설정, Tiptap 에디터 전용 스타일, CSS 변수(테마 토큰), 다크 모드 변수를 정의한다.

### 주요 섹션

| 섹션 | 설명 |
|------|------|
| `@import` (상단) | 한국어 폰트 3종 Google CDN 로딩 (Noto Sans KR, Noto Serif KR, Gowun Dodum) |
| `@import "tailwindcss"` | Tailwind v4 코어 |
| `@theme inline { ... }` | Tailwind 색상/폰트/반경 토큰을 CSS 변수로 연결 |
| `.tiptap` 스타일 블록 | Tiptap 에디터 전용 — heading(H1~H6), 목록, 체크박스, 코드블록, 링크, 형광펜, 테이블 스타일 |
| lowlight hljs 클래스 | VS Code Dark 테마 기반 코드 구문 강조 색상 |
| `:root { ... }` | 앱 전역 CSS 변수 — `--bg-*`, `--text-*`, `--border-*`, `--editor-font`, `--editor-size`, `--editor-lh`, `--editor-max-width` |
| `html.dark { ... }` | 다크 모드 CSS 변수 오버라이드 |
| `html[data-theme="X"]` | 색상 테마 프리셋 4종 (notion / sepia / minimal / forest) CSS 변수 블록 |
| `html[data-theme] .bg-white` 등 | 테마 적용 시 Tailwind 유틸리티 클래스 일괄 오버라이드 (컴포넌트 수정 없이 테마 반영) |

### 핵심 CSS 변수 (`:root`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `--editor-font` | `'Noto Sans KR', sans-serif` | 에디터 본문 폰트. `applyEditorStyle()`이 덮어씀 |
| `--editor-size` | `16px` | 에디터 기본 글자 크기 |
| `--editor-lh` | `1.6` | 에디터 줄 간격 |
| `--editor-max-width` | `768px` | 에디터 본문 최대 너비. 하단 슬라이더로 조절 |

### 링크 스타일 규칙

| 선택자 | 스타일 | 용도 |
|--------|--------|------|
| `.tiptap a` | 파란색 밑줄 | 일반 외부 링크 |
| `.tiptap a[href^="#page-"]` | 연보라 배경 칩 | `@멘션` / `[[링크]]` 내부 페이지 링크 |
| `.tiptap a[href^="#block-"]` | 청록 배경 칩 | 내부 블록 링크 |
