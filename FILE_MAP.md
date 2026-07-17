# FILE_MAP — 파일 역할 설계도

> 이 파일은 프로젝트에 직접 관여하는 모든 파일의 역할을 정리한 설계도입니다.
> 새 기능 추가 시 어떤 파일을 수정/추가해야 할지 빠르게 파악하기 위해 사용합니다.

---

## 1. 진입점 (Entry Points) → [상세 문서](docs/01_EntryPoints.md)

| 파일 | 역할 |
|------|------|
| [src/app/layout.tsx](src/app/layout.tsx) | 루트 레이아웃. Google Fonts 로딩, html/body 구조 |
| [src/app/page.tsx](src/app/page.tsx) | 메인 페이지. 사이드바 + 에디터 + 오버레이 조합, 전역 단축키 등록 |
| [src/app/globals.css](src/app/globals.css) | 전역 CSS. Tiptap 스타일, 한국어 폰트 @import, CSS 변수 |

---

## 2. 상태 관리 (Stores) → [상세 문서](docs/02_Stores.md)

| 파일 | 역할 |
|------|------|
| [src/store/pageStore.ts](src/store/pageStore.ts) | 페이지/카테고리 CRUD, 선택 상태, 탭, 드래그앤드롭 순서 |
| [src/store/pageStoreHelpers.ts](src/store/pageStoreHelpers.ts) | pageStore 저장 디바운서 + 히스토리 유틸 (pageStore.ts에서 분리) |
| [src/store/settingsStore.ts](src/store/settingsStore.ts) | 전역 설정 (폰트/테마/플러그인 ON·OFF), PluginSettings 키 관리 |
| [src/store/findReplaceStore.ts](src/store/findReplaceStore.ts) | 찾기/바꾸기 패널 열림 상태 + 검색어 공유 |
| [src/store/arrowStore.ts](src/store/arrowStore.ts) | 캔버스 블록 간 SVG 화살표 연결 상태 |

---

## 3. 타입 정의 (Types) → [상세 문서](docs/03_Types.md)

| 파일 | 역할 |
|------|------|
| [src/types/block.ts](src/types/block.ts) | Block, Page, Category, Property 등 전체 도메인 타입 정의 |
| [src/types/pageStore.ts](src/types/pageStore.ts) | PageStore 인터페이스 정의 (pageStore.ts에서 분리) |

---

## 3-1. i18n / 다국어 (Locales)

| 파일 | 역할 |
|------|------|
| [src/locales/index.ts](src/locales/index.ts) | 로케일 진입점 — `useLocale()` (컴포넌트용) + `getLocale()` (외부용) |
| [src/locales/ko.ts](src/locales/ko.ts) | 한국어 문자열 맵 |
| [src/locales/en.ts](src/locales/en.ts) | 영어 문자열 맵 |

---

## 4. Tiptap 확장 (Extensions) → [상세 문서](docs/04_Extensions.md)

| 파일 | 역할 |
|------|------|
| [src/extensions/FontSize.ts](src/extensions/FontSize.ts) | 인라인 글자 크기 커스텀 확장 (BubbleMenuBar에서 사용) |
| [src/extensions/InlineMath.ts](src/extensions/InlineMath.ts) | `$...$` InputRule → 인라인 수식 노드 변환 |
| [src/extensions/SearchHighlight.ts](src/extensions/SearchHighlight.ts) | ProseMirror 검색 하이라이트 데코레이션 확장 |
| [src/extensions/FootnoteInline.ts](src/extensions/FootnoteInline.ts) | 각주 인라인 노드 확장 |
| [src/extensions/ArrowMark.ts](src/extensions/ArrowMark.ts) | 캔버스 화살표 연결용 마크 확장 |
| [src/extensions/editorExtensions.ts](src/extensions/editorExtensions.ts) | Tiptap 에디터 확장 배열 조립 — Editor.tsx의 useEditor에 전달 |

---

## 5. 유틸리티 / 라이브러리 (Lib) → [상세 문서](docs/05_Lib.md)

| 파일 | 역할 |
|------|------|
| [src/lib/api.ts](src/lib/api.ts) | 백엔드 API 호출 함수 모음 (fetch 래퍼) |
| [src/lib/fonts.ts](src/lib/fonts.ts) | FONT_PRESETS 상수 — 폰트 목록 단일 진실 공급원 |
| [src/lib/graphData.ts](src/lib/graphData.ts) | 페이지 본문 파싱 → GraphNode/GraphEdge 생성 유틸 |
| [src/lib/templateGrid.ts](src/lib/templateGrid.ts) | 그리드 셀 배열 → Block 배열 변환 (gridCellsToBlocks) |
| [src/lib/templateParser.ts](src/lib/templateParser.ts) | 템플릿 문자열 파싱 유틸 |
| [src/lib/canvasLayout.ts](src/lib/canvasLayout.ts) | 캔버스 블록 자동 배치 레이아웃 알고리즘 |
| [src/lib/themeVars.ts](src/lib/themeVars.ts) | 테마 CSS 변수 상수 (PRESET_VARS / DEFAULT_VARS) |
| [src/lib/utils.ts](src/lib/utils.ts) | 공통 유틸 함수 (cn 등) |
| [src/lib/magazineAnalyzer.ts](src/lib/magazineAnalyzer.ts) | 블록 분석 → ContentProfile + 레이아웃 템플릿 선택 유틸 (analyzeBlocks / pickTemplate) |
| [src/lib/magazineLayout.ts](src/lib/magazineLayout.ts) | 블록 목록 → MagazineSection 그룹화 + AI 레이아웃 적용 유틸 |

---

## 6. 핵심 에디터 컴포넌트 (Editor Core) → [상세 문서](docs/06_EditorCore.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/Editor.tsx](src/components/editor/Editor.tsx) | 단일 블록 Tiptap 에디터. 확장 등록, 단축키, 컨텍스트 메뉴 연결 |
| [src/components/editor/PageEditor.tsx](src/components/editor/PageEditor.tsx) | 전체 페이지 렌더러. 블록 목록 + dnd-kit DnD + 커버/이모지 |
| [src/components/editor/BubbleMenuBar.tsx](src/components/editor/BubbleMenuBar.tsx) | 선택 시 나타나는 인라인 툴바 (글꼴/크기/색상/정렬) |
| [src/components/editor/SlashCommand.tsx](src/components/editor/SlashCommand.tsx) | `/` 슬래시 명령어 팝업 메뉴 |
| [src/components/editor/BlockMenu.tsx](src/components/editor/BlockMenu.tsx) | 블록 왼쪽 `⠿` 드래그 핸들 + 블록 메뉴 |
| [src/components/editor/ContextMenu.tsx](src/components/editor/ContextMenu.tsx) | 우클릭 컨텍스트 메뉴 (블록 추가/복제/삭제/타입변환) |
| [src/components/editor/BottomBar.tsx](src/components/editor/BottomBar.tsx) | 에디터 하단 고정바 (단어수 + 에디터 너비 슬라이더) |

---

## 7. 사이드바 / 네비게이션 → [상세 문서](docs/07_Sidebar.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/CategorySidebar.tsx](src/components/editor/CategorySidebar.tsx) | 좌측 통합 사이드바. 폴더 트리 + 페이지 목록 + 검색 + 캘린더 + 최근파일 |
| [src/components/sidebar/CategoryRow.tsx](src/components/sidebar/CategoryRow.tsx) | 사이드바 카테고리(폴더) 행 컴포넌트 |
| [src/components/sidebar/DraggablePageRow.tsx](src/components/sidebar/DraggablePageRow.tsx) | dnd-kit 드래그 가능한 페이지 행 컴포넌트 |
| [src/components/sidebar/PageInlineMenu.tsx](src/components/sidebar/PageInlineMenu.tsx) | 페이지 행 우측 인라인 액션 메뉴 |
| [src/components/sidebar/sidebarUtils.ts](src/components/sidebar/sidebarUtils.ts) | 사이드바 공통 유틸 함수 |
| [src/components/editor/TabBar.tsx](src/components/editor/TabBar.tsx) | 상단 탭 바 (여러 페이지 동시 열기) |
| [src/components/editor/CommandPalette.tsx](src/components/editor/CommandPalette.tsx) | Ctrl+P 퍼지검색 팔레트 (페이지 이동 + 빠른 액션) |
| [src/components/editor/GlobalSearch.tsx](src/components/editor/GlobalSearch.tsx) | 전체 텍스트 검색 오버레이 |
| [src/components/editor/FindReplacePanel.tsx](src/components/editor/FindReplacePanel.tsx) | Ctrl+H/F 찾기/바꾸기 플로팅 패널 |

---

## 8. 특수 블록 컴포넌트 (Block Types) → [상세 문서](docs/08_Blocks.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/ImageBlock.tsx](src/components/editor/ImageBlock.tsx) | 이미지 업로드·표시 + 캡션 |
| [src/components/editor/VideoBlock.tsx](src/components/editor/VideoBlock.tsx) | HTML5 동영상 플레이어 (autoplay/loop 플러그인 연동) |
| [src/components/editor/EmbedBlock.tsx](src/components/editor/EmbedBlock.tsx) | YouTube/iframe 임베드 |
| [src/components/editor/FileBlock.tsx](src/components/editor/FileBlock.tsx) | 첨부파일 블록 |
| [src/components/editor/CodeBlockView.tsx](src/components/editor/CodeBlockView.tsx) | 코드 블록 (lowlight 구문 강조) |
| [src/components/editor/MathBlock.tsx](src/components/editor/MathBlock.tsx) | KaTeX 블록 수식 (edit/preview 2모드) |
| [src/components/editor/InlineMathView.tsx](src/components/editor/InlineMathView.tsx) | 인라인 수식 노드 뷰 |
| [src/components/editor/AdmonitionBlock.tsx](src/components/editor/AdmonitionBlock.tsx) | 콜아웃/경고 블록 (info/warning/error/tip) |
| [src/components/editor/ToggleBlock.tsx](src/components/editor/ToggleBlock.tsx) | 접기/펼치기 토글 블록 |
| [src/components/editor/TocBlock.tsx](src/components/editor/TocBlock.tsx) | 페이지 내 목차 블록 |
| [src/components/editor/KanbanBlock.tsx](src/components/editor/KanbanBlock.tsx) | 드래그앤드롭 칸반 보드 블록 |
| [src/components/editor/ChartBlock.tsx](src/components/editor/ChartBlock.tsx) | recharts 기반 Bar/Line/Pie 차트 블록 |
| [src/components/editor/GanttBlock.tsx](src/components/editor/GanttBlock.tsx) | 순수 CSS 갠트 차트 블록 (진행률·오늘선·툴팁) |
| [src/components/editor/MindmapBlock.tsx](src/components/editor/MindmapBlock.tsx) | 방사형 SVG 마인드맵 (AI 확장 + 팬/줌) |
| [src/components/editor/MermaidBlock.tsx](src/components/editor/MermaidBlock.tsx) | Mermaid 다이어그램 블록 |
| [src/components/editor/ExcalidrawBlock.tsx](src/components/editor/ExcalidrawBlock.tsx) | Excalidraw 손그림 화이트보드 (next/dynamic SSR:false) |
| [src/components/editor/CanvasBlock.tsx](src/components/editor/CanvasBlock.tsx) | 행/열 그리드 캔버스 블록 (열 너비 조절·블록 쌓기·readMode) |
| [src/components/editor/CanvasPageEditor.tsx](src/components/editor/CanvasPageEditor.tsx) | 캔버스 내부 페이지 에디터 (캔버스 노드용 미니 에디터) |
| [src/components/editor/LayoutBlock.tsx](src/components/editor/LayoutBlock.tsx) | 8종 다단 레이아웃 블록 (열/행/높이 조절) |
| [src/components/editor/LayoutSlot.tsx](src/components/editor/LayoutSlot.tsx) | 레이아웃 블록의 개별 슬롯 컴포넌트 |
| [src/components/editor/MagazineGrid.tsx](src/components/editor/MagazineGrid.tsx) | 존 기반 잡지 레이아웃 렌더러 (섹션 = 헤딩 + 피처존 + 본문존) |

---

## 9. 플래너 / 달력 블록 → [상세 문서](docs/09_PlannerBlocks.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/DayPlannerBlock.tsx](src/components/editor/DayPlannerBlock.tsx) | 일간 플래너 블록 |
| [src/components/editor/DayPlannerPanel.tsx](src/components/editor/DayPlannerPanel.tsx) | 일간 플래너 사이드 패널 |
| [src/components/editor/WeeklyPlannerBlock.tsx](src/components/editor/WeeklyPlannerBlock.tsx) | 주간 플래너 블록 |
| [src/components/editor/WeekPlannerBlock.tsx](src/components/editor/WeekPlannerBlock.tsx) | 멀티데이 주간 타임라인 블록 (7/5/3컬럼 그리드, DayPlannerBlock 이벤트 수집) |
| [src/components/editor/MonthlyCalendarBlock.tsx](src/components/editor/MonthlyCalendarBlock.tsx) | 월간 달력 블록 |
| [src/components/editor/QuarterlyPlannerBlock.tsx](src/components/editor/QuarterlyPlannerBlock.tsx) | 분기 플래너 블록 |
| [src/components/editor/YearlyPlannerBlock.tsx](src/components/editor/YearlyPlannerBlock.tsx) | 연간 플래너 블록 |
| [src/components/editor/RoutineMatrixBlock.tsx](src/components/editor/RoutineMatrixBlock.tsx) | 루틴 매트릭스 블록 (요일×시간 격자) |
| [src/components/editor/CalendarWidget.tsx](src/components/editor/CalendarWidget.tsx) | 소형 달력 위젯 (사이드바용) |
| [src/components/editor/CalendarOverlay.tsx](src/components/editor/CalendarOverlay.tsx) | 전체화면 달력 오버레이 |

---

## 10. 오버레이 / 모달 / 패널 → [상세 문서](docs/10_Overlays.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/PropertyPanel.tsx](src/components/editor/PropertyPanel.tsx) | 페이지 속성 패널 (날짜/상태/선택/텍스트 4종) |
| [src/components/editor/DatabaseView.tsx](src/components/editor/DatabaseView.tsx) | 카테고리를 테이블로 표시, 인라인 셀 편집 |
| [src/components/editor/GraphView.tsx](src/components/editor/GraphView.tsx) | Ctrl+G 그래프 뷰 오버레이 (물리 시뮬레이션 SVG) |
| [src/components/editor/TocPanel.tsx](src/components/editor/TocPanel.tsx) | 우측 목차 패널 (hidden xl:block, sticky) |
| [src/components/editor/BacklinkPanel.tsx](src/components/editor/BacklinkPanel.tsx) | 페이지 하단 역참조(백링크) 패널 |
| [src/components/editor/VersionHistoryPanel.tsx](src/components/editor/VersionHistoryPanel.tsx) | 버전 히스토리 슬라이드인 패널 (3분 스냅샷, 최대 50개) |
| [src/components/editor/TrashPanel.tsx](src/components/editor/TrashPanel.tsx) | 휴지통 패널 (소프트삭제, 30일 만료) |
| [src/components/editor/PeriodicNotesPanel.tsx](src/components/editor/PeriodicNotesPanel.tsx) | 주기적 노트 패널 (일/주/월 탭) |
| [src/components/editor/ShortcutModal.tsx](src/components/editor/ShortcutModal.tsx) | 단축키/슬래시커맨드/플러그인 3탭 안내 모달 |
| [src/components/editor/LockModal.tsx](src/components/editor/LockModal.tsx) | 페이지 잠금 확인 모달 |
| [src/components/editor/NewPageDialog.tsx](src/components/editor/NewPageDialog.tsx) | 새 페이지 생성 + 템플릿 선택 다이얼로그 |
| [src/components/editor/TemplatePanel.tsx](src/components/editor/TemplatePanel.tsx) | 템플릿 갤러리 패널 |
| [src/components/editor/TemplateEditorModal.tsx](src/components/editor/TemplateEditorModal.tsx) | 비주얼 그리드 템플릿 에디터 (드래그앤드롭) |
| [src/components/editor/QuickAddModal.tsx](src/components/editor/QuickAddModal.tsx) | 빠른 메모 추가 모달 |
| [src/components/editor/CoverPicker.tsx](src/components/editor/CoverPicker.tsx) | 페이지 커버 이미지 선택 |
| [src/components/editor/EmojiPicker.tsx](src/components/editor/EmojiPicker.tsx) | 이모지/아이콘 선택 팝업 |
| [src/components/editor/MentionPopup.tsx](src/components/editor/MentionPopup.tsx) | @멘션 자동완성 팝업 |
| [src/components/editor/FootnoteView.tsx](src/components/editor/FootnoteView.tsx) | 각주 노드 뷰 컴포넌트 |
| [src/components/editor/TableToolbar.tsx](src/components/editor/TableToolbar.tsx) | 테이블 선택 시 상단 툴바 |
| [src/components/editor/ArrowLayer.tsx](src/components/editor/ArrowLayer.tsx) | 캔버스 SVG 화살표 레이어 |
| [src/components/editor/ArrowContextMenu.tsx](src/components/editor/ArrowContextMenu.tsx) | 화살표 우클릭 컨텍스트 메뉴 |

---

## 11. 커스텀 훅 (Hooks)

| 파일 | 역할 |
|------|------|
| [src/hooks/useEditorLatex.ts](src/hooks/useEditorLatex.ts) | 에디터 내 KaTeX 수식 입력 처리 훅 |
| [src/hooks/useEditorMention.ts](src/hooks/useEditorMention.ts) | 에디터 내 @멘션 자동완성 처리 훅 |

---

## 12. 위젯 / 플로팅 UI → [상세 문서](docs/12_Widgets.md)

| 파일 | 역할 |
|------|------|
| [src/components/editor/PomodoroWidget.tsx](src/components/editor/PomodoroWidget.tsx) | 플로팅 포모도로 타이머 위젯 (fixed bottom-16 right-5) |
| [src/components/editor/WordCountBar.tsx](src/components/editor/WordCountBar.tsx) | 에디터 하단 단어/글자 수 표시 |
| [src/components/ai/AIChatPanel.tsx](src/components/ai/AIChatPanel.tsx) | 재사용 AI 채팅 공통 컴포넌트 (sidebar/floating 2모드, SSE 스트리밍) |
| [src/components/ai/GlobalAIChatButton.tsx](src/components/ai/GlobalAIChatButton.tsx) | 전역 AI 채팅 플로팅 버튼 |

---

## 13. 설정 모달 (Settings) → [상세 문서](docs/13_Settings.md)

| 파일 | 역할 |
|------|------|
| [src/components/settings/SettingsModal.tsx](src/components/settings/SettingsModal.tsx) | 설정 모달 쉘 (탭 라우팅) |
| [src/components/settings/tabs/AppearanceTab.tsx](src/components/settings/tabs/AppearanceTab.tsx) | 외관 설정 (밝기 모드 + 색상 테마 프리셋) |
| [src/components/settings/tabs/EditorTab.tsx](src/components/settings/tabs/EditorTab.tsx) | 편집기 설정 (폰트/크기/줄간격/너비) |
| [src/components/settings/tabs/PluginsTab.tsx](src/components/settings/tabs/PluginsTab.tsx) | 플러그인 ON/OFF 토글 관리 |
| [src/components/settings/tabs/AITab.tsx](src/components/settings/tabs/AITab.tsx) | AI 설정 (공급자/모델/API 키) |
| [src/components/settings/tabs/DataTab.tsx](src/components/settings/tabs/DataTab.tsx) | 데이터 관리 (내보내기/가져오기) |
| [src/components/settings/tabs/StorageTab.tsx](src/components/settings/tabs/StorageTab.tsx) | Vault 생성·이름 변경·목록·전환·경로 설정 (삭제는 탐색기 전용) |
| [src/components/settings/tabs/CloudSyncTab.tsx](src/components/settings/tabs/CloudSyncTab.tsx) | 클라우드 동기화 설정 (Google Drive / OneDrive OAuth 연동) |
| [src/components/settings/tabs/TemplatesTab.tsx](src/components/settings/tabs/TemplatesTab.tsx) | 사용자 정의 템플릿 관리 |
| [src/components/settings/tabs/DebugTab.tsx](src/components/settings/tabs/DebugTab.tsx) | 디버그 로그 뷰어 |

---

## 14. 공통 UI 컴포넌트

| 파일 | 역할 |
|------|------|
| [src/components/ui/command.tsx](src/components/ui/command.tsx) | shadcn/ui Command 컴포넌트 (CommandPalette에서 사용) |
| [src/components/ui/dialog.tsx](src/components/ui/dialog.tsx) | shadcn/ui Dialog 컴포넌트 |
| [src/components/editor/Sidebar.tsx](src/components/editor/Sidebar.tsx) | 구형 사이드바 (현재 CategorySidebar로 대체됨) |
| [src/components/editor/PageList.tsx](src/components/editor/PageList.tsx) | 구형 페이지 목록 (현재 CategorySidebar로 통합됨) |

---

## 15. 백엔드 (Python FastAPI) → [상세 문서](docs/15_Backend.md)

| 파일 | 역할 |
|------|------|
| [backend/main.py](backend/main.py) | FastAPI 앱 진입점. 미들웨어 + 라우터 등록. `if __name__ == '__main__'` uvicorn 실행 |
| [backend/core.py](backend/core.py) | 공유 상수, Pydantic 모델, 헬퍼, 보안 검증 (UUID 검증, 경로 트래버설 차단) |
| [backend/routers/pages.py](backend/routers/pages.py) | 페이지 CRUD + 이미지/비디오 파일 업로드 |
| [backend/routers/categories.py](backend/routers/categories.py) | 카테고리 CRUD (폴더 계층 관리) |
| [backend/routers/export_import.py](backend/routers/export_import.py) | 내보내기(ZIP/MD) · 가져오기 |
| [backend/routers/history.py](backend/routers/history.py) | 버전 히스토리 API (180초 간격 스냅샷, 최대 50개) |
| [backend/routers/trash.py](backend/routers/trash.py) | 휴지통 API (isTrashed 소프트삭제, trashGroupId 그룹핑) |
| [backend/routers/search.py](backend/routers/search.py) | 전문 검색 (페이지 본문 인덱싱) |
| [backend/routers/ai.py](backend/routers/ai.py) | AI 프록시 라우터 (OpenAI/Claude/Ollama, SSE 스트리밍) |
| [backend/routers/templates.py](backend/routers/templates.py) | 기본 템플릿 5종 시드 |
| [backend/routers/system.py](backend/routers/system.py) | Vault 경로 조회·변경, 디버그 로그 |
| [backend/routers/cloud_sync.py](backend/routers/cloud_sync.py) | Google Drive / OneDrive OAuth 2.0 + vault 전체 업로드/다운로드 |
| [backend/routers/planner.py](backend/routers/planner.py) | Day Planner 아카이브 API (GET/POST /api/planner/archive, 90일 초과 이벤트 저장) |
| [backend/requirements.txt](backend/requirements.txt) | Python 의존성 목록 |
| [backend/backend.spec](backend/backend.spec) | PyInstaller 빌드 스펙 (hiddenimports 포함) |

---

## 15-1. Next.js API 라우트 (App Router)

| 파일 | 역할 |
|------|------|
| [src/app/api/magazine-layout/route.ts](src/app/api/magazine-layout/route.ts) | Claude/OpenAI API로 블록 목록 → 잡지 레이아웃 계획(JSON) 반환 (POST) |

---

## 16. Electron (데스크탑 패키징) → [상세 문서](docs/16_Electron.md)

| 파일 | 역할 |
|------|------|
| [electron/main.js](electron/main.js) | Electron 메인 프로세스. BrowserWindow 생성, 백엔드 프로세스 관리 |
| [electron/preload.js](electron/preload.js) | 렌더러 ↔ 메인 프로세스 IPC 브릿지 |
| [electron/loading.html](electron/loading.html) | 백엔드 시작 대기 중 로딩 화면 |

---

## 17. 빌드 스크립트

| 파일 | 역할 |
|------|------|
| [scripts/build-electron.js](scripts/build-electron.js) | electron-builder NSIS 인스톨러 빌드 |
| [scripts/copy-next-static.js](scripts/copy-next-static.js) | Next.js standalone 빌드 후 정적 파일 복사 |
| [scripts/start-backend.js](scripts/start-backend.js) | 개발 모드에서 FastAPI 백엔드 subprocess 실행 |

---

## 18. 루트 설정 파일

| 파일 | 역할 |
|------|------|
| [package.json](package.json) | npm 스크립트 + 의존성 목록 |
| [tsconfig.json](tsconfig.json) | TypeScript 컴파일러 설정 |
| [next.config.ts](next.config.ts) | Next.js 설정 (standalone 출력, 리다이렉트 등) |
| [postcss.config.mjs](postcss.config.mjs) | PostCSS 설정 (Tailwind v4) |
| [eslint.config.mjs](eslint.config.mjs) | ESLint 설정 |
| [electron-builder.yml](electron-builder.yml) | electron-builder NSIS 패키저 설정 |
| [components.json](components.json) | shadcn/ui CLI 설정 |
| [BLUEPRINT.md](BLUEPRINT.md) | 기능 명세·API 목록·폴더 구조 설계 문서 |
| [FILE_MAP.md](FILE_MAP.md) | 이 파일. 파일별 역할 설계도 |

---

## 빠른 참조: "이 기능 고치려면?"

| 목적 | 수정 파일 |
|------|-----------|
| 새 블록 타입 추가 | `types/block.ts` → `Editor.tsx` → `SlashCommand.tsx` → `PageEditor.tsx` |
| 새 슬래시 명령어 추가 | `SlashCommand.tsx` |
| 새 플러그인 추가 | `settingsStore.ts` (PluginSettings 키) → `PluginsTab.tsx` → 해당 컴포넌트 |
| 새 설정 항목 추가 | `settingsStore.ts` → 해당 `settings/tabs/*.tsx` |
| 새 API 엔드포인트 추가 | `backend/routers/*.py` → `backend/main.py` 라우터 등록 → `src/lib/api.ts` |
| 폰트 추가 | `src/lib/fonts.ts` (FONT_PRESETS) → `src/app/globals.css` (한국어) 또는 `layout.tsx` (영문) |
| 테마 색상 변경 | `src/lib/themeVars.ts` + `src/app/globals.css` |
| 단축키 추가 | `src/app/page.tsx` (전역) 또는 `Editor.tsx` (에디터 내) |
| Electron 빌드 오류 | `backend/backend.spec` (hiddenimports) + `scripts/build-electron.js` |
