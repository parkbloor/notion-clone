# 02. Stores 전역 상태 관리

> Zustand + immer 조합으로 앱 전역 상태를 관리한다.
> `persist` 미들웨어를 쓰는 스토어는 localStorage에 자동 저장/복원된다.

---

## [src/store/pageStore.ts](../src/store/pageStore.ts)

**역할:** 페이지, 카테고리, 블록, 휴지통, 매거진 레이아웃 상태를 관리하고 FastAPI 백엔드와 동기화하는 핵심 스토어.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `usePageStore` | `Zustand store` | 페이지/카테고리/블록 전역 상태와 액션. `persist` + `immer` 미들웨어 사용 |
| `currentPage(state)` | selector | `currentPageId`에 해당하는 현재 페이지를 찾아 반환 |

### 주요 상태

| 상태 | 타입 | 설명 |
|------|------|------|
| `pages` | `Page[]` | 전체 페이지 목록 |
| `currentPageId` | `string \| null` | 현재 선택된 페이지 ID |
| `openTabs` | `string[]` | 열린 탭 ID 목록 |
| `categories` | `Category[]` | 전체 카테고리/폴더 목록 |
| `categoryMap` | `Record<string, string \| null>` | pageId -> categoryId 매핑 |
| `categoryOrder` | `string[]` | 최상위 카테고리 표시 순서 |
| `categoryChildOrder` | `Record<string, string[]>` | 하위 폴더 표시 순서 |
| `currentCategoryId` | `string \| null` | 현재 선택된 카테고리 |
| `recentPageIds` | `string[]` | 최근 연 페이지 ID 목록 |
| `trashedItems` | `TrashItem[]` | 휴지통 항목 목록 |
| `activeTagFilter` | `string \| null` | 사이드바 태그 필터 |
| `currentVaultName` | `string` | 현재 볼트 이름 |
| `selectedBlockIds` | `string[]` | 다중 선택된 블록 ID 목록 |
| `pendingFocusBlockId` | `string \| null` | 새 블록 생성 뒤 포커스를 받을 블록 ID |
| `saveStatus` | `'saved' \| 'saving' \| 'unsaved'` | 자동 저장 상태 |
| `historyVersion` | `number` | undo/redo 가능 여부 갱신용 버전 |
| `layoutDescriptors` | `Record<string, LayoutDescriptor>` | pageId별 매거진 레이아웃 캐시 |
| `magazineModePages` | `Record<string, boolean>` | 매거진 모드가 켜진 페이지 ID 집합 |

### 페이지 액션

| 액션 | 설명 |
|------|------|
| `loadFromServer()` | FastAPI에서 페이지/카테고리/볼트 정보를 로드 |
| `resetStore()` | 볼트 전환 시 스토어를 초기 상태로 리셋 |
| `addPage(title?, categoryId?)` | 새 페이지 생성 후 서버 저장 |
| `setCurrentPage(id)` | 현재 페이지 변경, 탭/최근 파일 갱신 |
| `closeTab(id)` | 열린 탭 닫기 |
| `setOpenTabs(ids)` | 세션 복원 시 열린 탭 목록 적용 |
| `pushRecentPage(pageId)` | 최근 파일 목록 갱신 |
| `updatePageTitle(pageId, title)` | 제목 변경 후 자동 저장 |
| `deletePage(pageId)` | 페이지를 휴지통으로 이동. 백엔드는 `_vault_trash/`로 실제 파일 이동 |
| `updatePageIcon(pageId, icon)` | 페이지 아이콘 변경 |
| `updatePageCover(pageId, cover)` | 커버 이미지 URL 변경 |
| `updatePageCoverPosition(pageId, position)` | 커버 이미지 Y 위치 조정 |
| `togglePageStar(pageId)` | 즐겨찾기 토글 |
| `duplicatePage(pageId)` | 페이지와 블록 전체 복제 |
| `lockPage(pageId, pinHash)` | PIN 해시로 페이지 잠금 |
| `unlockPage(pageId)` | 페이지 잠금 해제 |
| `togglePageLock(pageId, pinHash?)` | 잠금/해제 토글 |
| `toggleCanvasMode(pageId)` | 문서/캔버스 모드 전환 |
| `sortBlocksByCanvas(pageId)` | 캔버스 좌표 기준으로 블록 순서 정렬 |

### 태그/속성 액션

| 액션 | 설명 |
|------|------|
| `addTagToPage(pageId, tag)` | 페이지 태그 추가 |
| `removeTagFromPage(pageId, tag)` | 페이지 태그 제거 |
| `setTagFilter(tag)` | 사이드바 태그 필터 설정 |
| `setPageProperty(pageId, property)` | 페이지 속성 추가/수정 |
| `removePageProperty(pageId, propertyId)` | 페이지 속성 제거 |

### 블록 액션

| 액션 | 설명 |
|------|------|
| `addBlock(pageId, afterBlockId?)` | 블록 추가 |
| `addBlockBefore(pageId, beforeBlockId)` | 지정 블록 앞에 추가 |
| `updateBlock(pageId, blockId, content)` | 블록 텍스트 내용 업데이트 |
| `savePageNow(pageId)` | 디바운스 없이 즉시 서버 저장 |
| `updateBlockType(pageId, blockId, type)` | 블록 타입 변경 |
| `deleteBlock(pageId, blockId)` | 블록 삭제 |
| `moveBlock(pageId, fromIndex, toIndex)` | 블록 순서 이동 |
| `duplicateBlock(pageId, blockId)` | 블록 복제 |
| `moveBlockToPage(fromPageId, toPageId, blockId)` | 블록을 다른 페이지로 이동 |
| `copyBlockToPage(fromPageId, toPageId, blockId)` | 블록을 다른 페이지로 복사 |
| `setPageBlocks(pageId, blocks)` | 블록 배열 직접 교체 |
| `applyTemplate(pageId, markdownContent)` | 마크다운 템플릿을 블록으로 파싱해 적용 |
| `updateBlockCanvas(pageId, blockId, canvas)` | 캔버스 위치/크기 업데이트 |
| `addCanvasBox(pageId, box)` | 캔버스 가상 박스 추가 |
| `updateCanvasBox(pageId, boxId, update)` | 캔버스 가상 박스 수정 |
| `deleteCanvasBox(pageId, boxId)` | 캔버스 가상 박스 삭제 |
| `updateBlockBackground(pageId, blockId, color)` | 블록 배경색 변경 |

### 블록 선택/토글 액션

| 액션 | 설명 |
|------|------|
| `toggleBlockSelection(blockId)` | 블록 선택/해제 토글 |
| `selectBlockRange(pageId, anchorId, targetId)` | Shift 선택 범위 지정 |
| `clearBlockSelection()` | 선택 상태 초기화 |
| `deleteSelectedBlocks(pageId)` | 선택 블록 일괄 삭제 |
| `duplicateSelectedBlocks(pageId)` | 선택 블록 일괄 복제 |
| `groupIntoToggle(pageId)` | 선택 블록을 토글 하위 블록으로 묶기 |
| `ungroupToggle(pageId, toggleId)` | 토글 블록 하위 항목을 상위로 풀기 |
| `updateToggleChild(pageId, toggleId, childId, content)` | 토글 하위 블록 내용 수정 |
| `deleteToggleChild(pageId, toggleId, childId)` | 토글 하위 블록 삭제 |

### 카테고리 액션

| 액션 | 설명 |
|------|------|
| `setCurrentCategory(categoryId)` | 현재 카테고리 설정 |
| `addCategory(name, parentId?)` | 카테고리 생성 |
| `renameCategory(categoryId, name)` | 이름 변경 후 서버 저장 |
| `deleteCategory(categoryId)` | 카테고리를 휴지통으로 이동. 백엔드는 폴더를 `_vault_trash/`로 실제 이동 |
| `movePageToCategory(pageId, categoryId)` | 페이지를 카테고리로 이동 |
| `moveCategoryToParent(categoryId, newParentId)` | 폴더를 다른 부모로 이동 |
| `reorderCategories(newOrder)` | 최상위 카테고리 순서 변경 |
| `reorderChildCategories(parentId, newOrder)` | 하위 카테고리 순서 변경 |
| `reorderPages(fromId, toId)` | 페이지 목록 순서 변경 |
| `updateCategoryColor(categoryId, color)` | 폴더 색상 변경 |

### 휴지통 액션

| 액션 | 설명 |
|------|------|
| `loadTrash()` | 휴지통 항목 로드 |
| `restoreFromTrash(itemId)` | 휴지통 항목 복원 |
| `permanentDelete(itemId)` | 휴지통 항목 영구 삭제 |
| `emptyTrash()` | 휴지통 비우기 |

### 매거진 레이아웃 액션

| 액션 | 설명 |
|------|------|
| `toggleMagazineMode(pageId)` | 페이지의 매거진 모드 토글 |
| `setLayoutDescriptor(pageId, descriptor)` | 레이아웃 디스크립터 저장 |
| `updateLayoutCell(pageId, cellId, update)` | 특정 레이아웃 셀 수정 |
| `updateLayoutTheme(pageId, theme)` | 레이아웃 테마 수정 |
| `clearLayout(pageId, keepLocked?)` | 레이아웃 초기화 |

### 히스토리

| 액션 | 설명 |
|------|------|
| `undoPage(pageId)` | 블록 구조 undo |
| `redoPage(pageId)` | 블록 구조 redo |
| `canUndo(pageId)` | undo 가능 여부 |
| `canRedo(pageId)` | redo 가능 여부 |
| `clearPendingFocus()` | 포커스 대기 블록 초기화 |

---

## [src/store/pageStoreHelpers.ts](../src/store/pageStoreHelpers.ts)

**역할:** `pageStore.ts`에서 분리한 저장 디바운스, 즉시 저장, 블록 히스토리 유틸.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `saveTimers` | `Map` | pageId별 자동 저장 타이머 |
| `scheduleSave(pageId, getState, setState)` | function | 500ms 디바운스 저장. 저장 중 서버 응답과 로컬 전용 필드를 병합 |
| `saveNow(pageId, getState, setState)` | function | 디바운스 없이 즉시 저장 |
| `pageHistoryMap` | `Map` | pageId별 undo/redo 히스토리 |
| `getHistory(pageId)` | function | 페이지 히스토리 엔트리 조회/생성 |
| `pushBlockHistory(pageId, blocks)` | function | 블록 배열 스냅샷을 past 스택에 저장. 최대 50개 유지 |
| `parseBlocksFromJson(json)` | function | JSON 문자열을 `Block[]`로 역직렬화 |

---

## [src/types/pageStore.ts](../src/types/pageStore.ts)

**역할:** `PageStore` 인터페이스 정의. `pageStore.ts` 구현과 상태/액션 계약을 분리한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PageStore` | `interface` | pageStore의 전체 state/action 타입 계약 |

---

## [src/store/settingsStore.ts](../src/store/settingsStore.ts)

**역할:** 앱 전역 설정 관리. 테마, 편집기 스타일, 플러그인 ON/OFF, 플래너, AI, 레이아웃, 주기 노트, 언어 설정을 담당한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useSettingsStore` | `Zustand store` | 설정 상태와 액션. `persist` + `immer` 미들웨어 사용 |
| `CustomLayoutTemplate` | `interface` | 사용자 정의 레이아웃 템플릿 `{ id, name, orientation, cols }` |
| `PluginSettings` | `interface` | 플러그인 ON/OFF 목록. 현재 22개 키 |
| `SettingsStore` | `interface` | 전체 설정 스토어 타입 |
| `applyThemePreset(preset)` | function | `html[data-theme]`와 테마 CSS 변수 적용 |
| `applyTheme(theme, bgTone?)` | function | light/dark/auto 전환 후 배경 톤 적용 |
| `applyEditorStyle(fontFamily, fontSize, lineHeight, editorMaxWidth?)` | function | 편집기 CSS 변수 적용 |
| `applyBgTone(tone)` | function | warm/neutral/cool 배경 톤 CSS 변수 적용 |

### 주요 상태

| 상태 | 타입/기본값 | 설명 |
|------|-------------|------|
| `theme` | `'light'` | light/dark/auto 테마 |
| `themePreset` | `'warm-moss'` | 색상 테마 프리셋 |
| `accentColor` | `'#5B7F5A'` | 강조색 |
| `bgTone` | `'warm'` | 배경 톤 |
| `fontFamily` | `DEFAULT_FONT_ID` | 편집기 폰트 ID |
| `fontSize` | `16` | 편집기 기본 글자 크기 |
| `lineHeight` | `1.6` | 줄 간격 |
| `editorMaxWidth` | `768` | 편집기 본문 최대 너비 |
| `plugins` | `PluginSettings` | 플러그인 활성화 상태. `excalidraw`, `videoAutoplay`, `videoLoop`은 기본 false, 나머지는 기본 true |
| `isFocusMode` | `false` | 집중 모드 활성 상태 |
| `weatherLocation` | `''` | Day/Weekly Planner 날씨 위치 |
| `plannerStartHour` | `0` | Day Planner 타임라인 시작 시각 |
| `plannerSnapMin` | `15` | 드래그 스냅 간격 |
| `plannerZoom` | `64` | 1시간당 픽셀 높이 |
| `weekStartDay` | `1` | 주간 뷰 시작 요일 |
| `plannerNotifyBefore` | `5` | 일정 시작 전 알림 시간 |
| `plannerRoutines` | `[]` | 플래너 루틴 프리셋 |
| `plannerAutoApply` | `true` | 빈 날 이동 시 루틴 자동 적용 |
| `aiProvider` | `'openai'` | AI 공급자 |
| `aiModel` | `'gpt-4o-mini'` | AI 모델 ID |
| `aiApiKey` | `''` | 구버전 호환용 API 키 |
| `openaiApiKey` | `''` | OpenAI API 키 |
| `anthropicApiKey` | `''` | Anthropic API 키 |
| `ollamaUrl` | `'http://localhost:11434'` | Ollama 서버 URL |
| `sidebarCollapsed` | `false` | 사이드바 접힘 여부 |
| `sidebarWidth` | `260` | 사이드바 너비 |
| `sidebarFolderHeight` | `220` | 사이드바 폴더/메모 분할 높이 |
| `layoutDefaultOrientation` | `'portrait'` | 새 레이아웃 블록 기본 방향 |
| `layoutDefaultTemplate` | `''` | 기본 레이아웃 템플릿 ID |
| `customLayoutTemplates` | `[]` | 사용자 정의 레이아웃 템플릿 |
| `periodicNoteTemplates` | `{ daily, weekly, monthly, quarterly, yearly }` | 주기 노트 템플릿 ID |
| `periodicBuiltinOverrides` | `{}` | 내장 주기 노트 템플릿 오버라이드 |
| `locale` | `'ko'` | UI 언어 |

### PluginSettings 키 목록

| 키 | 설명 |
|----|------|
| `kanban` | 칸반 보드 블록 |
| `calendar` | 캘린더 사이드바 패널 |
| `admonition` | 콜아웃/경고/정보 블록 |
| `excalidraw` | 드로잉 다이어그램 블록 |
| `recentFiles` | 최근 파일 목록 |
| `quickAdd` | 빠른 노트 캡처 |
| `wordCount` | 편집기 하단 단어/글자 수 표시 |
| `focusMode` | 집중 모드 |
| `pomodoro` | 포모도로 타이머 |
| `tableOfContents` | 페이지 목차 패널 |
| `periodicNotes` | 일간/주간/월간/분기/연간 노트 |
| `canvas` | 무한 캔버스 블록 |
| `videoAutoplay` | 비디오 자동 재생 |
| `videoLoop` | 비디오 반복 재생 |
| `layoutEnabled` | 레이아웃 블록 |
| `backlinks` | 페이지 하단 백링크 패널 |
| `chart` | Bar/Line/Pie 차트 블록 |
| `gantt` | 간트 차트 블록 |
| `mindmap` | AI 마인드맵 블록 |
| `globalAiChat` | 전역 AI 채팅 버튼 |
| `math` | LaTeX 수식 |
| `arrowConnect` | 텍스트 화살표 연결 오버레이 |

### 주요 액션

| 액션 | 설명 |
|------|------|
| `setTheme(theme)` | 테마 변경 후 DOM 적용 |
| `setThemePreset(preset)` | 색상 프리셋 변경 |
| `setAccentColor(color)` | 강조색 CSS 변수 갱신 |
| `setBgTone(tone)` | 배경 톤 변경 |
| `setFontFamily(font)` | 편집기 폰트 변경 |
| `setFontSize(size)` | 편집기 글자 크기 변경 |
| `setLineHeight(lh)` | 편집기 줄 간격 변경 |
| `setEditorMaxWidth(width)` | 편집기 최대 너비 변경 |
| `togglePlugin(name)` | 플러그인 활성화 토글 |
| `toggleFocusMode()` | 집중 모드 토글 |
| `setWeatherLocation(loc)` | 날씨 위치 저장 |
| `setPlannerStartHour(h)` | 플래너 시작 시각 설정 |
| `setPlannerSnapMin(m)` | 플래너 스냅 간격 설정 |
| `setPlannerZoom(z)` | 플래너 확대 정도 설정 |
| `setWeekStartDay(d)` | 주 시작 요일 설정 |
| `setPlannerNotifyBefore(m)` | 플래너 알림 시간 설정 |
| `setPlannerRoutines(r)` | 루틴 목록 저장. 백엔드가 켜져 있으면 파일에도 저장 |
| `loadRoutinesFromFile()` | 백엔드에서 루틴 파일 로드 |
| `setPlannerAutoApply(v)` | 루틴 자동 적용 설정 |
| `setAiProvider(provider)` | AI 공급자 변경 |
| `setAiModel(model)` | AI 모델 변경 |
| `setOpenaiApiKey(key)` | OpenAI API 키 저장 |
| `setAnthropicApiKey(key)` | Anthropic API 키 저장 |
| `setOllamaUrl(url)` | Ollama URL 저장 |
| `toggleSidebarCollapsed()` | 사이드바 접힘 토글 |
| `setSidebarWidth(width)` | 사이드바 너비 저장 |
| `setSidebarFolderHeight(height)` | 사이드바 분할 높이 저장 |
| `setLayoutDefaults(orientation, template)` | 레이아웃 기본값 저장 |
| `addCustomLayoutTemplate(tpl)` | 사용자 레이아웃 템플릿 추가 |
| `deleteCustomLayoutTemplate(id)` | 사용자 레이아웃 템플릿 삭제 |
| `setPeriodicNoteTemplate(kind, templateId)` | 주기 노트 템플릿 ID 지정 |
| `setPeriodicBuiltinOverride(kind, markdown)` | 내장 주기 노트 템플릿 오버라이드 |
| `resetPeriodicBuiltinOverride(kind)` | 내장 템플릿 오버라이드 제거 |
| `setLocale(locale)` | 언어 변경 |

---

## [src/store/findReplaceStore.ts](../src/store/findReplaceStore.ts)

**역할:** 찾기/바꾸기 전역 상태. 모든 `Editor` 인스턴스가 구독하여 검색어 변경 시 하이라이트를 동기화한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useFindReplaceStore` | `Zustand store` | 찾기/바꾸기 상태와 액션 |

### 상태 및 액션

| 이름 | 타입 | 설명 |
|------|------|------|
| `isOpen` | `boolean` | 패널 열림 여부 |
| `showReplace` | `boolean` | 바꾸기 입력 표시 여부 |
| `query` | `string` | 검색어 |
| `replaceStr` | `string` | 바꿀 문자열 |
| `caseSensitive` | `boolean` | 대소문자 구분 여부 |
| `open(showReplace?)` | 액션 | 패널 열기 |
| `close()` | 액션 | 패널 닫기 및 입력 초기화 |
| `setQuery(q)` | 액션 | 검색어 변경 |
| `setReplaceStr(r)` | 액션 | 바꿀 문자열 변경 |
| `toggleCase()` | 액션 | 대소문자 구분 토글 |
| `toggleReplace()` | 액션 | 바꾸기 UI 토글 |

---

## [src/store/arrowStore.ts](../src/store/arrowStore.ts)

**역할:** 캔버스/텍스트 화살표 연결 대기 상태와 화살표 컨텍스트 메뉴 상태 관리.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `useArrowStore` | `Zustand store` | 화살표 연결/메뉴 상태 |
| `ConnectingState` | `interface` | 연결 대기 상태 |
| `ContextMenuState` | `interface` | 컨텍스트 메뉴 상태 |

### 상태 및 액션

| 이름 | 타입 | 설명 |
|------|------|------|
| `connectingState` | `ConnectingState \| null` | 연결 대기 모드 상태 |
| `contextMenu` | `ContextMenuState \| null` | 우클릭 메뉴 상태 |
| `setConnecting(state)` | 액션 | 연결 대기 시작 |
| `clearConnecting()` | 액션 | 연결 대기 종료 |
| `setContextMenu(menu)` | 액션 | 컨텍스트 메뉴 열기 |
| `clearContextMenu()` | 액션 | 컨텍스트 메뉴 닫기 |
