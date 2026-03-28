# 02. Stores — 전역 상태 관리

> Zustand + immer 조합으로 전역 상태를 관리한다.
> `persist` 미들웨어를 사용한 스토어는 localStorage에 자동 저장/복원된다.

---

## [src/store/pageStore.ts](../src/store/pageStore.ts)

**역할:** 페이지·카테고리의 전역 상태 관리 + FastAPI 백엔드 동기화. 앱에서 가장 핵심적인 스토어.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `usePageStore` | `Zustand store` | 페이지/카테고리 전체 상태 + 액션. `immer` 미들웨어 사용 (불변 상태를 mutable 스타일로 작성) |

### 주요 상태 (State)

| 상태 | 타입 | 설명 |
|------|------|------|
| `pages` | `Page[]` | 전체 페이지 목록 |
| `currentPageId` | `string \| null` | 현재 선택된 페이지 ID |
| `openTabs` | `string[]` | 열린 탭 ID 목록 (순서 유지, 중복 없음) |
| `categories` | `Category[]` | 전체 카테고리(폴더) 목록 |
| `categoryMap` | `Record<string, string \| null>` | pageId → categoryId 매핑 (null = 미분류) |
| `categoryOrder` | `string[]` | 최상위 카테고리 표시 순서 |
| `categoryChildOrder` | `Record<string, string[]>` | 하위 폴더 순서 `{ parentCatId: [childCatId, ...] }` |
| `currentCategoryId` | `string \| null` | 선택된 카테고리 (null = 전체보기) |
| `recentPageIds` | `string[]` | 최근 열어본 페이지 ID 목록 (최대 10개, localStorage 동기화) |
| `trashedItems` | `TrashItem[]` | 휴지통 아이템 목록 |
| `activeTagFilter` | `string \| null` | 사이드바 태그 필터 (null = 필터 없음) |
| `historyVersion` | `number` | 블록 구조 변경 시 증가 → 버튼 활성화 리렌더링 트리거 |

### 페이지 액션

| 액션 | 설명 |
|------|------|
| `loadFromServer()` | FastAPI에서 페이지+카테고리 목록 최초 로딩 |
| `addPage(title?, categoryId?)` | 새 페이지 생성 후 서버 저장 |
| `setCurrentPage(id)` | 현재 페이지 변경 + 탭에 추가 + 최근 파일 갱신 |
| `updatePageTitle(pageId, title)` | 제목 변경 + 디바운스 자동 저장 |
| `deletePage(pageId)` | 소프트 삭제 (isTrashed 플래그) |
| `updatePageIcon(pageId, icon)` | 이모지 아이콘 변경 |
| `updatePageCover(pageId, cover)` | 커버 이미지 URL 변경 |
| `updatePageCoverPosition(pageId, position)` | 커버 이미지 Y 위치 조정 (0~100) |
| `togglePageStar(pageId)` | 즐겨찾기 토글 |
| `duplicatePage(pageId)` | 페이지+블록 전체 복제, 원본 바로 아래 삽입 |
| `lockPage(pageId, pinHash)` | PIN 해시로 페이지 잠금 |
| `unlockPage(pageId)` | 페이지 잠금 해제 |
| `toggleCanvasMode(pageId)` | 문서 ↔ 캔버스 모드 전환 |
| `sortBlocksByCanvas(pageId)` | 캔버스 Y/X 좌표 기준으로 블록 순서 재정렬 |

### 블록 액션

| 액션 | 설명 |
|------|------|
| `addBlock(pageId, afterBlockId?)` | 블록 추가 (지정 위치 아래 또는 끝) |
| `addBlockBefore(pageId, beforeBlockId)` | 지정 블록 앞에 추가 |
| `updateBlock(pageId, blockId, content)` | 블록 텍스트 내용 업데이트 |
| `updateBlockType(pageId, blockId, type)` | 블록 타입 변경 |
| `deleteBlock(pageId, blockId)` | 블록 삭제 |
| `moveBlock(pageId, fromIndex, toIndex)` | 블록 순서 이동 |
| `duplicateBlock(pageId, blockId)` | 블록 복제 |
| `moveBlockToPage(fromPageId, toPageId, blockId)` | 블록을 다른 페이지로 이동 |
| `copyBlockToPage(fromPageId, toPageId, blockId)` | 블록을 다른 페이지로 복사 |
| `setPageBlocks(pageId, blocks)` | 블록 배열 직접 교체 (그리드 템플릿 적용) |
| `applyTemplate(pageId, markdownContent)` | 마크다운 파싱 후 블록으로 삽입 |
| `updateBlockCanvas(pageId, blockId, canvas)` | 캔버스 위치/크기 업데이트 |
| `updateBlockBackground(pageId, blockId, color)` | 블록 배경색 변경 |

### 카테고리 액션

| 액션 | 설명 |
|------|------|
| `addCategory(name, parentId?)` | 카테고리 생성 (parentId 있으면 하위 폴더) |
| `renameCategory(categoryId, name)` | 이름 변경 + 서버 저장 |
| `deleteCategory(categoryId)` | 삭제 (페이지/하위폴더 있으면 실패 반환) |
| `movePageToCategory(pageId, categoryId)` | 페이지를 카테고리로 이동 |
| `moveCategoryToParent(categoryId, newParentId)` | 폴더를 다른 부모로 이동 |
| `reorderCategories(newOrder)` | 최상위 카테고리 순서 변경 |
| `reorderChildCategories(parentId, newOrder)` | 하위 폴더 순서 변경 |
| `reorderPages(fromId, toId)` | 페이지 목록 내 순서 변경 |
| `updateCategoryColor(categoryId, color)` | 폴더 색상 변경 |

### 히스토리 (Undo/Redo)

| 함수/액션 | 설명 |
|-----------|------|
| `undoPage(pageId)` | 블록 구조 Undo (텍스트 변경은 Tiptap 내장 History가 처리) |
| `redoPage(pageId)` | 블록 구조 Redo |
| `canUndo(pageId)` | Undo 가능 여부 |
| `canRedo(pageId)` | Redo 가능 여부 |

### 내부 헬퍼 (모듈 비공개)

| 함수 | 설명 |
|------|------|
| `scheduleSave(pageId, getState, setState)` | 500ms 디바운스 자동 저장. 저장 후 서버 응답으로 블록 병합 (canvasX/Y 등 로컬 전용 필드 보존) |
| `pushBlockHistory(pageId, blocks)` | 블록 배열 스냅샷을 JSON으로 직렬화 후 past 스택에 푸시 (최대 50개) |
| `getHistory(pageId)` | 히스토리 엔트리 조회 (없으면 생성) |
| `parseBlocksFromJson(json)` | JSON 문자열 → Block 배열 역직렬화 |

---

## [src/store/settingsStore.ts](../src/store/settingsStore.ts)

**역할:** 앱 전체 설정 관리 (테마, 편집기, 플러그인 ON/OFF). `persist` 미들웨어로 localStorage 자동 저장/복원.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useSettingsStore` | `Zustand store` | 설정 전체 상태 + 액션. `persist` + `immer` 미들웨어 사용 |
| `CustomLayoutTemplate` | `interface` | 커스텀 레이아웃 템플릿 저장 포맷 `{ id, name, orientation, cols }` |
| `PluginSettings` | `interface` | 플러그인 ON/OFF 키 목록 (19개 플러그인) |
| `SettingsStore` | `interface` | 전체 설정 스토어 타입 정의 |
| `applyThemePreset(preset)` | `function` | 색상 테마 프리셋 적용. `html[data-theme]` 속성 + CSS 변수 직접 주입 |
| `applyTheme(theme)` | `function` | 라이트/다크/auto 전환. `html.dark` 클래스 토글 후 `applyThemePreset` 재호출 |
| `applyEditorStyle(fontFamily, fontSize, lineHeight, editorMaxWidth?)` | `function` | 편집기 CSS 변수 주입 (`--editor-font`, `--editor-size`, `--editor-lh`, `--editor-max-width`) |

### 주요 상태

| 상태 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | 밝기 테마 |
| `themePreset` | `string` | `'default'` | 색상 테마 프리셋 (default/notion/sepia/minimal/forest) |
| `fontFamily` | `string` | `DEFAULT_FONT_ID` | 에디터 폰트 ID (FONT_PRESETS의 id) |
| `fontSize` | `number` | `16` | 에디터 기본 글자 크기 (px) |
| `lineHeight` | `number` | `1.6` | 줄 간격 |
| `editorMaxWidth` | `number` | `768` | 에디터 본문 최대 너비 (px) |
| `plugins` | `PluginSettings` | 전부 `true` | 19개 플러그인 활성화 여부 |
| `isFocusMode` | `boolean` | `false` | 집중 모드 (앱 재시작 시 초기화, localStorage 저장 안 함) |
| `weatherLocation` | `string` | `''` | Day/Weekly Planner 날씨 도시명 |
| `aiProvider` | `string` | `'openai'` | AI 공급자 (openai/claude/ollama) |
| `aiModel` | `string` | `'gpt-4o-mini'` | AI 모델 ID |
| `aiApiKey` | `string` | `''` | AI API 키 |
| `sidebarCollapsed` | `boolean` | `false` | 사이드바 접힘 여부 |
| `sidebarWidth` | `number` | `260` | 사이드바 너비 (px, 160~480) |
| `sidebarFolderHeight` | `number` | `220` | 사이드바 폴더/메모 분할 높이 (px) |

### PluginSettings 키 목록

| 키 | 설명 |
|----|------|
| `kanban` | 칸반 보드 블록 |
| `calendar` | 캘린더 사이드바 위젯 |
| `admonition` | 콜아웃(경고/정보) 블록 |
| `excalidraw` | 손그림 다이어그램 블록 |
| `recentFiles` | 최근 파일 목록 |
| `quickAdd` | 빠른 노트 캡처 |
| `wordCount` | 에디터 하단 단어/글자 수 표시 |
| `focusMode` | 집중 모드 (사이드바 숨김) |
| `pomodoro` | 포모도로 타이머 위젯 |
| `tableOfContents` | 페이지 내 목차 사이드 패널 |
| `periodicNotes` | 일간/주간/월간 노트 자동 생성 |
| `canvas` | 무한 캔버스 블록 |
| `videoAutoplay` | 비디오 자동 재생 |
| `videoLoop` | 비디오 반복 재생 |
| `layoutEnabled` | 레이아웃 블록 슬래시 메뉴 표시 |
| `backlinks` | 페이지 하단 백링크 패널 |
| `chart` | Bar/Line/Pie 차트 블록 |
| `gantt` | 갠트 차트 블록 |
| `mindmap` | AI 마인드맵 블록 |
| `globalAiChat` | 우하단 글로벌 AI 채팅 버튼 |

---

## [src/store/findReplaceStore.ts](../src/store/findReplaceStore.ts)

**역할:** 찾기/바꾸기 전역 상태. 모든 `Editor` 인스턴스가 구독하여 검색어 변경 시 동시 하이라이트 적용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useFindReplaceStore` | `Zustand store` | 찾기/바꾸기 상태 + 액션 |

### 상태 및 액션

| 이름 | 타입 | 설명 |
|------|------|------|
| `isOpen` | `boolean` | 패널 열림 여부 |
| `showReplace` | `boolean` | 바꾸기 입력 행 표시 여부 |
| `query` | `string` | 검색어 |
| `replaceStr` | `string` | 바꿀 문자열 |
| `caseSensitive` | `boolean` | 대소문자 구분 여부 |
| `open(showReplace?)` | 액션 | 패널 열기 |
| `close()` | 액션 | 패널 닫기 + query/replaceStr 초기화 |
| `setQuery(q)` | 액션 | 검색어 변경 → 모든 Editor에서 하이라이트 갱신 |
| `setReplaceStr(r)` | 액션 | 바꿀 문자열 변경 |
| `toggleCase()` | 액션 | 대소문자 구분 토글 |
| `toggleReplace()` | 액션 | 바꾸기 행 표시 토글 |

---

## [src/store/arrowStore.ts](../src/store/arrowStore.ts)

**역할:** 캔버스 블록의 화살표 연결 대기 상태와 화살표 컨텍스트 메뉴 상태 관리.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useArrowStore` | `Zustand store` | 화살표 연결/메뉴 상태 |
| `ConnectingState` | `interface` | 연결 대기 상태 타입 (arrowId, color, anchorX/Y 등) |
| `ContextMenuState` | `interface` | 컨텍스트 메뉴 상태 타입 (x, y, arrowId, attrs 등) |

### 상태 및 액션

| 이름 | 타입 | 설명 |
|------|------|------|
| `connectingState` | `ConnectingState \| null` | 연결 대기 모드 상태. `ArrowLayer`가 읽어 고무줄 선 렌더링 |
| `contextMenu` | `ContextMenuState \| null` | 우클릭 메뉴 상태. `ArrowContextMenu`가 읽어 UI 표시 |
| `setConnecting(state)` | 액션 | 연결 대기 시작 (시작 원 클릭 시 호출) |
| `clearConnecting()` | 액션 | 연결 대기 종료 |
| `setContextMenu(menu)` | 액션 | 컨텍스트 메뉴 열기 |
| `clearContextMenu()` | 액션 | 컨텍스트 메뉴 닫기 |
