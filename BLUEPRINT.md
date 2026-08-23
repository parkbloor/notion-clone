# Notion Clone — 개발 청사진 (Blueprint)

> **작성일:** 2026-02-21 | **최종 수정:** 2026-08-23 (일정 데이터 안정화 P5)
> **목적:** 이 문서는 개발을 이어받는 AI(또는 개발자)가 맥락 없이도 즉시 작업을 이어갈 수 있도록 프로젝트의 모든 것을 기록합니다.

---

## 2026-08-22 작업 기록

- 포스트잇 기반 야간 정리 흐름을 기존 Day Planner와 충돌 없이 적용하기 위한 단계별 계획을 `docs/postit-daily-workflow-plan.md`에 기록했다. 일정 홈은 일정의 단일 저장소, 일간 노트는 날짜별 포스트잇 작업대로 분리하며, 첫 구현은 일간 노트 생성 경로 통합과 기존 데이터 무변경 검증으로 제한한다.
- 일간 노트 생성은 `src/lib/dailyNotes.ts`의 공통 경로로 통합했다. 계획 허브·`Ctrl+Alt+D`·월간 캘린더가 같은 한/영 제목 탐색, 사용자 템플릿 우선순위, 카테고리 폴백과 기본 템플릿을 사용한다. 같은 볼트·날짜의 진행 중 요청을 공유하고 생성된 페이지 ID에 직접 템플릿을 적용한다.
- 일간 플래너 볼트는 `planner.dailyNoteTemplate`으로 표준 일간 계획·회고와 `포스트잇 야간 정리` 중 하나를 선택한다. 포스트잇 템플릿은 Day Planner 없이 미처리·오늘 기록·처리 결과·마감 기록 구역을 만들고, 신규 노트의 첫 미처리 블록에 포커스한다. 사용자 지정 일간 템플릿은 계속 최우선이며 일반 볼트에는 포스트잇 템플릿을 강제하지 않는다.
- 빈 볼트의 첫 메모 생성 경로에서도 `currentVaultName`을 저장하도록 수정했다. 이전에는 이 값 없이 조기 반환해 볼트 기능 설정의 `일간 플래너 볼트` 스위치가 비활성화되는 문제가 있었다.
- 앱 전체에서 하나의 일기 볼트를 지정하는 독립 워크플로우를 추가했다. 설정은 `vaults_root/.diary_config.json`에 저장하며, 지정 볼트에서는 사이드바가 `📔 일기` 허브로 바로 열리고 계획 탭과 `오늘 일정 보기`를 표시하지 않는다. 기존 플래너의 `자유 일기` 템플릿을 사용 중인 볼트도 같은 집중 화면을 제공하면서 기존 `일간 노트 YYYY-MM-DD` 메모를 그대로 이어서 연다. 새 전용 날짜별 일기는 `pageRole: diary-day`와 `periodKey: YYYY-MM-DD`로 식별하고 기존 블록 편집기를 사용한다. 플래너·포스트잇 설정과 기존 일정 데이터는 변경하지 않는다.
- 일정 데이터 안정화 계획은 `docs/planner-data-reliability-plan.md`에 기록했다. P0 일정 복구 센터는 모든 볼트의 현재·구버전 Day Planner 원본, 중복, 손상, 일정 홈 단절을 읽기 전용으로 감사한다. 사용자가 명시적으로 실행한 경우에만 페이지 JSON과 플래너 메타파일을 ZIP으로 복사하고 CRC와 파일별 SHA-256을 검증하며 원본은 수정하지 않는다.
- Day Planner 저장 P1은 구버전 `date/events`를 보존하는 공통 파서와 손상 원본 쓰기 잠금을 추가했다. 일정 블록과 빠른 패널의 즉시 저장 결과를 확인해 실패 시 미저장 상태와 재시도를 표시하며, 아카이브 성공 확인 전에 90일 이전 원본을 제거하던 자동 분리 동작은 중단했다.
- Day Planner 저장 P2는 앱 전체에서 하나의 `일정 데이터 볼트`를 지정하고 그 안의 `_planner/planner.sqlite3`에 일정과 날짜별 회고를 트랜잭션으로 저장하는 전용 저장소를 추가했다. 이벤트 단위 생성·조회·수정·소프트 삭제와 revision 충돌 검사를 제공하지만, 검증 백업이 필요한 P3 전까지 기존 Day Planner 블록을 이전하거나 새 저장소로 전환하지 않는다.
- Day Planner 저장 P3는 사용자가 선택한 원본 볼트의 현재·구버전·혼합 Day Planner와 아카이브를 미리 집계하고, 현재 원본 전체와 해시가 정확히 일치하는 검증 ZIP이 있을 때만 SQLite로 복사한다. 날짜와 일정 ID가 같은 중복은 하나로 합치고 내용 충돌과 선택 원본을 먼저 표시한다. 미리보기 지문이 달라지면 실행을 거부하며, 반복 실행은 중복을 만들지 않고 기존 블록을 수정하거나 삭제하지 않는다.
- P3 마이그레이션 성공 후 우측 `오늘 일정` 패널은 SQLite를 단일 읽기·쓰기 원본으로 사용한다. 기존 Day Planner 블록은 원본 일정 수와 보존 상태만 보여 주는 읽기 전용 안내로 전환된다. 저장소 상태를 확인할 수 없을 때는 레거시 쓰기로 자동 후퇴하지 않고 편집을 잠가 이중 원본 발생을 막는다.
- P4 계획 허브는 `오늘 일정`을 하나의 주 행동으로 두고 완료 수를 바로 표시한다. 주간 타임라인과 루틴은 두 번째 영역에 유지하며, 일간 노트·캘린더·기록 통계·HTML 내보내기·주기 회고는 기본 접힌 `보조 도구`로 이동한다. SQLite 활성 시 오늘 완료 수와 기간 통계도 전용 저장소에서 읽는다.
- P5는 소프트 삭제된 SQLite 일정을 같은 ID로 복원하는 revision 보호 API를 추가했다. 임시 볼트의 실제 HTTP 라우터에서 생성·재접속·동시 수정 409·소프트 삭제·오래된 복원 409·정상 복원을 검증했으며 사용자 볼트와 실행 중인 개발 서버는 변경하지 않았다.
- 일정 데이터 안정화 전체 자동 검증은 백엔드 64건, 프런트 단위 24건, TypeScript, 변경 범위 ESLint와 Next.js 16.3.2 프로덕션 빌드를 통과했다. 실제 원본 백업·마이그레이션 및 실행 중 앱의 재시작·HMR·두 창 조작 검증은 사용자가 설정 화면에서 실행할 때 수행한다.
- 일정 안정화 후속 계획은 기존 Day Planner 기능을 전수 조사해 P6~P16의 SQLite 통합 단계로 고정했다. 다음 착수 범위는 기존 데이터를 가져오지 않고 빈 저장소를 활성화하는 P6 `새 일정으로 시작` 하나이며, API·UI·상태 필드·예상 변경 파일·완료 조건·검증 명령은 `docs/planner-data-reliability-plan.md`에 기록했다. 기존 블록과 실제 사용자 데이터는 P16 전까지 자동 삭제하거나 변환하지 않는다.
- 볼트별 플래너 설정에 역할(`planner.mode`: `off` / `daily`)과 일정 홈 메모 ID(`homePageId`)를 추가했다. 모든 기존·새 일반 볼트는 기본 `off`이며, 설정 → 볼트 기능에서 사용자가 직접 켠 볼트에서만 계획 메뉴·오늘 일정·플래너 슬래시 블록·단축키가 나타난다.
- 플래너를 켜도 폴더·메모·블록은 자동으로 생성하지 않는다. 주기적 노트 플러그인이 활성화되어 있어도 볼트를 불러오는 과정에서 일간/주간/월간 폴더를 만들지 않도록 자동 생성 코드를 제거했다.
- 일간 플래너 볼트에서는 현재 열린 메모를 일정 홈으로 지정할 수 있다. 우측 Day Planner의 일정 조회와 빠른 추가는 이 일정 홈의 `dayplanner` 블록만 대상으로 하므로, 일정 데이터가 일반 메모나 다른 볼트로 흩어지지 않는다. 연결은 언제든 해제할 수 있고 기존 메모/기록은 삭제하지 않는다. 신규 기본 일간 노트에는 Day Planner 블록을 넣지 않는다.
- 일간 플래너 블록의 목록을 `계획 → 실행 완료 → 마감 기록` 흐름으로 재배치했다. 일정 데이터 형식은 유지하며, 남은 계획 수·완료 수·마감 기록 여부를 함께 보여 준다.
- 검증: `npm.cmd exec -- tsc --noEmit`, 변경 파일 ESLint, `uv run --no-sync python -m unittest discover -s backend/tests -v`(28건) 및 `git diff --check`를 통과했다. 실제 앱 기동은 빈 사용자 볼트에 첫 메모를 만들 수 있어 수행하지 않았다.

---

## 2026-07-26 작업 기록

- HTML 내보내기가 현재 이미지 블록의 다중 이미지 포맷(`images[]`)을 처리하도록 수정했다. 첨부 이미지마다 vault 파일을 읽어 base64 데이터 URI로 삽입하므로, 내려받은 단일 HTML 파일을 로컬에서 열어도 이미지가 표시된다. 실제 `2026-07-26 (가을 과일)` 페이지의 내보내기 응답에서 이미지 27개와 base64 임베딩 27개를 확인했다.
- 페이지 상단 도구 모음에 우측 통합 패널(목차·백링크·버전) 전체를 숨기고 다시 표시하는 버튼을 추가했다. 한 화면에 다른 앱을 함께 띄울 때 본문 너비를 확보할 수 있다.
- 목차 탭만 별도로 숨기고 표시하는 버튼도 추가했다. 목차를 숨겨도 백링크·버전 탭과 우측 패널 전체 토글은 계속 사용할 수 있다.
- `npx eslint src/components/editor/PageEditor.tsx` 및 `npx tsc --noEmit`로 프런트엔드 변경을 확인했다. ESLint에는 기존 경고 4개가 남아 있지만 오류는 없다.

---

## 2026-07-17 작업 기록

- `npm run dev` 하나로 FastAPI를 먼저 시작하고 준비 상태를 확인한 뒤 Next.js를 실행하도록 정리했다. 로컬 네트워크 주소로 접속할 때 사용할 사설 LAN CORS 처리도 추가했다.
- 설정의 저장소 탭에서 볼트 폴더를 새로 만들고 이름을 바꿀 수 있다. 실수 방지를 위해 앱 안에서 볼트를 삭제하는 기능은 제공하지 않고 Windows 탐색기에서만 삭제한다.
- 왼쪽 사이드바에서 다중 선택 모드를 켜고 여러 메모를 체크한 다음, 선택한 메모의 6점 드래그 핸들을 폴더로 끌어 한 번에 이동할 수 있다. 기존의 단일 메모 드래그와 정렬 동작은 유지한다.
- 본문 블록 드래그 중 다른 글자 크기의 블록 위를 지나가도 드래그 대상의 `scaleX/scaleY`를 1로 유지해 크기가 변하지 않게 했다.
- `npm run build:all`로 Windows NSIS 설치 파일을 생성했으며, 패키징된 앱에서 FastAPI와 Next.js가 모두 HTTP 200으로 시작되는 것을 확인했다. 자세한 결과는 `docs/14_Electron.md`에 기록한다.

---

## 1. 프로젝트 개요

**목표:** Notion을 로컬에서 완전히 동작하는 오픈소스 클론으로 구현
- 인터넷 없이 완전 오프라인 동작
- 파일은 `vault/` 폴더에 JSON으로 저장 (사람이 읽을 수 있는 형식)
- 백엔드: FastAPI (Python) — 파일 시스템 CRUD
- 프론트엔드: Next.js 16 + React 19 + Tiptap v3 에디터
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
│   ├── core.py                  # 공유 상수·Pydantic 모델·헬퍼·보안 검증
│   ├── main.py                  # FastAPI 앱 + 미들웨어 + 라우터 등록 (50줄)
│   ├── routers/
│   │   ├── pages.py             # 페이지 CRUD + 이미지 업로드
│   │   ├── categories.py        # 카테고리 CRUD
│   │   ├── export_import.py     # JSON·마크다운 내보내기 / JSON 가져오기
│   │   ├── search.py            # 전문 검색
│   │   ├── system.py            # vault 경로 통계·디버그 로그
│   │   ├── history.py           # ✅ 페이지 버전 히스토리 (3분 간격 스냅샷, 최대 50개)
│   │   └── trash.py             # ✅ 휴지통 (소프트 삭제, 개별/전체 복원·영구삭제)
│   └── requirements.txt         # fastapi, uvicorn, python-multipart
│
├── src/
│   ├── app/
│   │   ├── page.tsx             # 진입점 — 전체 레이아웃 (사이드바 + 에디터)
│   │   ├── layout.tsx           # HTML 루트 레이아웃 (Toaster 포함)
│   │   └── globals.css          # Tiptap 스타일 + CSS 변수 + 다크모드 + @media print
│   │
│   ├── components/
│   │   ├── editor/
│   │   │   ├── Editor.tsx        # 블록 1개 = Tiptap 인스턴스
│   │   │   ├── PageEditor.tsx    # 페이지 렌더러 + 블록 dnd-kit + TOC 레이아웃
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
│   │   │   ├── CanvasBlock.tsx   # 행/열 그리드 캔버스 (열 너비 드래그 조절·블록 쌓기·readMode)
│   │   │   ├── CanvasPageEditor.tsx # ✅ 캔버스 모드 페이지 렌더러 (블록 절대 배치)
│   │   │   ├── ArrowLayer.tsx    # ✅ 캔버스 화살표 SVG 렌더링 레이어
│   │   │   ├── ArrowContextMenu.tsx # ✅ 캔버스 화살표 우클릭 메뉴
│   │   │   ├── ExcalidrawBlock.tsx # ✅ Excalidraw 손그림 다이어그램 블록
│   │   │   ├── VideoBlock.tsx    # ✅ 로컬 비디오 파일 업로드 + 재생
│   │   │   ├── LayoutBlock.tsx   # ✅ A4 다단 레이아웃 블록 (8종 템플릿)
│   │   │   ├── LayoutSlot.tsx    # ✅ 레이아웃 블록 안의 슬롯 (미니 에디터)
│   │   │   ├── MathBlock.tsx     # ✅ LaTeX 수식 블록 (KaTeX, displayMode)
│   │   │   ├── InlineMathView.tsx # ✅ 인라인 수식 렌더링 ($...$)
│   │   │   ├── MermaidBlock.tsx  # ✅ Mermaid 다이어그램 (flowchart/sequence/gantt)
│   │   │   ├── TocBlock.tsx      # ✅ 인라인 목차 블록 (H1~H6 자동 목록)
│   │   │   ├── EmbedBlock.tsx    # ✅ URL 임베드 블록 (YouTube/Vimeo/iframe)
│   │   │   ├── FileBlock.tsx     # ✅ 파일 첨부 블록 (PDF/docx/zip 등)
│   │   │   ├── FootnoteView.tsx  # ✅ 각주/주석 렌더링
│   │   │   ├── BacklinkPanel.tsx # 백링크 패널 (이 페이지를 참조하는 페이지 목록)
│   │   │   ├── WordCountBar.tsx  # 에디터 하단 단어/글자 수 표시
│   │   │   ├── BottomBar.tsx     # ✅ 에디터 하단 바 (단어 수 + 너비 슬라이더 통합)
│   │   │   ├── PomodoroWidget.tsx # 포모도로 타이머 플로팅 위젯
│   │   │   ├── TocPanel.tsx      # 목차(TOC) 사이드 패널
│   │   │   ├── CalendarWidget.tsx # 메모 목록 상단 달력 위젯
│   │   │   ├── MentionPopup.tsx  # @멘션 팝업
│   │   │   ├── EmojiPicker.tsx   # 페이지 아이콘 이모지 선택기
│   │   │   ├── CoverPicker.tsx   # 페이지 커버 선택기
│   │   │   ├── GlobalSearch.tsx  # 전체 텍스트 검색 팝업 (Ctrl+K)
│   │   │   ├── CommandPalette.tsx # ✅ 명령어 팔레트 (Ctrl+P, 퍼지검색)
│   │   │   ├── FindReplacePanel.tsx # ✅ 찾기/바꾸기 패널 (Ctrl+H/F)
│   │   │   ├── QuickAddModal.tsx # 빠른 노트 캡처 팝업 (Ctrl+Alt+N)
│   │   │   ├── ShortcutModal.tsx # 단축키 안내 모달
│   │   │   ├── ContextMenu.tsx   # ✅ 블록 우클릭 컨텍스트 메뉴
│   │   │   ├── NewPageDialog.tsx # ✅ 새 페이지 생성 + 템플릿 선택 다이얼로그
│   │   │   ├── TemplateEditorModal.tsx # ✅ 비주얼 그리드 템플릿 에디터
│   │   │   ├── PropertyPanel.tsx # ✅ 페이지 속성 패널 (날짜/상태/선택/텍스트)
│   │   │   ├── DatabaseView.tsx  # ✅ 카테고리 페이지 테이블 뷰 (인라인 셀 편집)
│   │   │   ├── GraphView.tsx     # ✅ 페이지 링크 그래프 뷰 (Ctrl+G, SVG 물리 시뮬레이션)
│   │   │   ├── TabBar.tsx        # ✅ 뷰 전환 탭 (일반/캔버스 모드)
│   │   │   ├── LockModal.tsx     # ✅ 페이지 잠금 PIN 설정/해제 모달 (SHA-256)
│   │   │   ├── PeriodicNotesPanel.tsx # ✅ 주기적 노트 패널 (일간/주간/월간)
│   │   │   ├── ChartBlock.tsx    # ✅ 차트 블록 (Bar/Line/Pie — recharts)
│   │   │   ├── GanttBlock.tsx    # ✅ 갠트 차트 블록 (태스크 타임라인 — 순수 CSS)
│   │   │   ├── MindmapBlock.tsx  # ✅ AI 마인드맵 블록 (방사형 SVG + AI 채팅 패널)
│   │   │   ├── VersionHistoryPanel.tsx # ✅ 페이지 버전 히스토리 슬라이드인 패널
│   │   │   └── TrashPanel.tsx    # ✅ 휴지통 패널 (복원/영구삭제)
│   │   │
│   │   ├── ai/
│   │   │   └── AIChatPanel.tsx   # ✅ 재사용 가능한 AI 채팅 공통 컴포넌트 (sidebar/floating 2모드)
│   │   │
│   │   ├── settings/
│   │   │   ├── SettingsModal.tsx  # 설정 모달 (6탭 레이아웃)
│   │   │   └── tabs/
│   │   │       ├── AppearanceTab.tsx # 테마 (라이트/다크/시스템 + 색상 프리셋 5종)
│   │   │       ├── EditorTab.tsx     # 글꼴/크기/줄간격/에디터 너비
│   │   │       ├── PluginsTab.tsx    # 플러그인 ON/OFF 마스터-디테일
│   │   │       ├── DataTab.tsx       # JSON·MD 내보내기 / 가져오기
│   │   │       ├── StorageTab.tsx    # vault 경로 + 통계
│   │   │       ├── DebugTab.tsx      # 서버 로그 뷰어
│   │   │       ├── AITab.tsx         # ✅ AI 설정 (제공자/모델/API 키)
│   │   │       └── TemplatesTab.tsx  # ✅ 템플릿 생성·편집·삭제
│   │   │
│   │   └── ui/
│   │       ├── command.tsx       # shadcn/ui Command (cmdk 래퍼)
│   │       └── dialog.tsx        # shadcn/ui Dialog
│   │
│   ├── store/
│   │   ├── pageStore.ts          # 페이지/카테고리 전역 상태 + API 동기화
│   │   ├── settingsStore.ts      # 앱 설정 전역 상태 (localStorage 영속)
│   │   ├── findReplaceStore.ts   # ✅ 찾기/바꾸기 Zustand 전역 상태
│   │   └── arrowStore.ts         # ✅ 캔버스 블록 화살표 상태 관리
│   │
│   ├── extensions/
│   │   ├── FontSize.ts           # 커스텀 Tiptap FontSize 확장
│   │   ├── SearchHighlight.ts    # ProseMirror 검색 하이라이트 확장
│   │   ├── InlineMath.ts         # ✅ 인라인 수식 확장 ($...$ InputRule)
│   │   ├── ArrowMark.ts          # ✅ 캔버스 화살표 마크 확장
│   │   └── FootnoteInline.ts     # ✅ 각주 인라인 확장
│   │
│   ├── lib/
│   │   ├── api.ts                # FastAPI 통신 함수 모음
│   │   ├── fonts.ts              # FONT_PRESETS 상수 (폰트 목록 단일 진실 공급원)
│   │   ├── graphData.ts          # 페이지 링크 파싱 → GraphNode/GraphEdge 유틸
│   │   ├── templateGrid.ts       # 그리드 셀 → Block 변환 유틸 (gridCellsToBlocks)
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
  "isLocked": false,          // 페이지 잠금 여부 (PIN 설정 시 true)
  "lockPin": "sha256hexstr",  // PIN SHA-256 해시 (잠금 설정 시에만 존재)
  "canvasMode": false,        // 블록 절대 배치 모드
  "properties": [             // 페이지 속성 목록
    { "id": "uuid", "name": "마감일", "type": "date", "value": "2026-03-25", "reminder": true }
  ],
  "blocks": [...],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### 4-3-1. 멀티 볼트 구조
- 앱은 단일 `vault/` 고정 경로가 아니라 `vault_config.json`의 `vaults_root` 하위 폴더들을 독립 볼트로 취급한다.
- `vault_config.json` 핵심 필드:
  ```json
  {
    "vaults_root": "E:\\MyNotes",
    "current_vault": "기본",
    "recent_vaults": ["기본", "업무"]
  }
  ```
- `backend/core.py`의 `get_vault_dir()` / `set_vault_dir()`가 현재 활성 볼트 경로의 단일 진실 공급원이다.
- 설정 > 저장 위치(`StorageTab.tsx`)를 열면 `/api/settings/vault-info`가 `vaults_root` 하위 폴더를 스캔해 볼트 목록을 반환한다.
- 새 볼트는 설정 화면에서 이름을 입력해 `/api/settings/vaults`로 생성할 수 있고, 목록에서 폴더명을 변경할 수 있다. 생성 시 현재 볼트는 유지하며, 실수 방지를 위해 볼트 삭제는 앱에서 제공하지 않고 탐색기에서만 수행한다.
- 볼트 전환은 `/api/settings/switch-vault`로 처리한다. 백엔드는 `vaults_root/current_vault`로 활성 경로를 바꾸고, 프론트는 `pageStore.resetStore()` 후 페이지/카테고리를 다시 로드한다.
- `_index.nct`가 없는 새 볼트 폴더는 첫 진입 시 빈 인덱스를 만들거나 폴더 스캔으로 자동 초기화한다.

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
- [x] 블록 드래그앤드롭 정렬 (dnd-kit, 드래그 중 블록 크기 고정)
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
- [x] 캔버스 블록 — 무한 캔버스, 더블클릭 노드 추가, SVG 베지어 엣지, 팬/줌, 노드 색상 6종, 리사이즈·연결 핸들, 스냅
- [x] **Excalidraw 블록** — 손그림 스타일 다이어그램, 전체화면 토글, 800ms 디바운스 저장, ko-KR 로케일
- [x] **차트 블록** — Bar/Line/Pie 3종, 표 편집 UI + recharts 렌더링, 시리즈별 색상 커스텀
- [x] **갠트 차트 블록** — 태스크 테이블 편집 + 순수 CSS 타임라인, 오늘 표시선, hover 툴팁, 진행률 막대
- [x] **AI 마인드맵 블록** — 방사형 SVG 트리 + AI 채팅 패널 통합. Tab/Enter/Del 단축키, 접기/펼치기, 우클릭 AI 확장, 팬/줌
- [x] **플로팅 AI 글쓰기 패널** — `Ctrl+I` / `/ai` 슬래시 커맨드로 열기. 현재 페이지 전체를 컨텍스트로 전달. 적용 클릭 시 마지막 포커스 커서 위치에 텍스트 삽입
- [x] **LaTeX 수식 블록** — `/수식` 슬래시 → MathBlock.tsx (edit/preview 2모드, KaTeX displayMode)
- [x] **인라인 수식** — `$...$` InputRule → InlineMath.ts + InlineMathView.tsx (인라인 KaTeX 렌더링)
- [x] **Mermaid 다이어그램 블록** — flowchart/sequence/gantt 지원, 편집↔미리보기 2모드
- [x] **인라인 목차 블록 (TocBlock)** — `/목차` 슬래시 → 페이지 내 H1~H6 헤딩 자동 목록화 (TocPanel 사이드 패널과 별도)
- [x] **URL 임베드 블록** — `/임베드` 슬래시 → EmbedBlock.tsx (YouTube/Vimeo/일반 iframe URL 임베드)
- [x] **파일 첨부 블록** — `/파일` 슬래시 → FileBlock.tsx (PDF/docx/zip 등 일반 파일 업로드 + 다운로드)
- [x] **캔버스 화살표** — 노드 간 연결 SVG 베지어 곡선, 스타일 5종, 우클릭 메뉴 (ArrowLayer.tsx + arrowStore.ts)
- [x] **캔버스 읽기/잠금 모드** — 읽기 전용(편집 비활성화) + 잠금(팬/줌만 허용) 모드 전환 (2026-03-24)

### ✅ 페이지 관리
- [x] 페이지 생성/삭제/복제
- [x] 페이지 제목 편집 (vault 폴더 자동 rename)
- [x] 페이지 아이콘 이모지 선택
- [x] 페이지 커버 — URL / 그라디언트 / 단색 / 위치 조정
- [x] 페이지 태그 (생성/삭제/필터)
- [x] **태그 브라우저** — 사이드바 태그 섹션, 사용 빈도순 정렬, 개수 표시, 클릭 필터
- [x] 페이지 즐겨찾기 (⭐ 상단 고정)
- [x] 페이지 검색 (사이드바 검색창)
- [x] 페이지 드래그앤드롭 정렬
- [x] **휴지통** — 물리 파일 이동 방식(`_vault_trash/` 폴더), 이름 충돌 시 `_N` 접미사, 원래 위치 복원, 개별/전체 영구삭제, 레거시 소프트삭제 자동 마이그레이션
- [x] **페이지 버전 히스토리** — 3분 간격 스냅샷, 최대 50개 보관, 미리보기·복원

#### 휴지통 저장 방식
- 삭제된 페이지/카테고리는 `isTrashed` 플래그로 숨기지 않고 현재 볼트의 `_vault_trash/` 폴더로 실제 이동한다.
- `_vault_trash/index.json`이 휴지통 메타데이터(원본 폴더명, 실제 보관 폴더명, 원래 카테고리/부모, 삭제 시각)를 관리한다.
- 활성 `_index.nct`에는 삭제되지 않은 항목만 남긴다. 볼트 자동 스캔은 `_vault_trash/`를 건너뛰어 삭제 항목이 되살아나지 않게 한다.
- 삭제/복원 시 같은 이름의 폴더가 있으면 `resolve_trash_name()` 규칙으로 `_1`, `_2` 접미사를 붙인다.
- 원래 카테고리나 부모 폴더가 사라진 상태에서 복원하면 볼트 루트로 복원한다.
- 서버 시작 시 `backend/main.py`가 레거시 `isTrashed=True` 항목을 `_vault_trash/`로 자동 마이그레이션한다.

### ✅ 카테고리 (폴더) 시스템
- [x] 카테고리 생성/삭제/이름 변경
- [x] 페이지를 카테고리로 드래그 이동 (다중 선택 후 6점 핸들로 묶음 이동 지원)
- [x] 카테고리 드래그 정렬
- [x] 카테고리 접고/펼치기

### ✅ 설정 패널 (⚙️)
- [x] 모양 탭 — 라이트/다크/시스템 테마
- [x] 편집기 탭 — 글꼴(sans/serif/mono), 크기(14~20px), 줄간격
- [x] 플러그인 탭 — 칸반(ON), 캘린더(ON), 콜아웃(ON), 최근 파일(ON), 빠른 캡처(ON), Excalidraw(준비 중)
- [x] 데이터 탭 — JSON 백업 다운로드, 마크다운 ZIP 다운로드, JSON 가져오기
- [x] 저장 위치 탭 — vault 경로, 페이지 수, 용량 표시, 경로 변경(재시작 방식)
- [x] 디버그 탭 — 서버 로그 뷰어 (최근 100개)

### ✅ 플러그인 시스템
- [x] 단어 수 표시 (WordCountBar) — 에디터 하단 실시간 단어/글자 수
- [x] 백링크 패널 (BacklinkPanel) — 페이지 하단, @멘션/[[ 링크로 참조하는 페이지 카드 목록
- [x] 집중 모드 — `Ctrl+Shift+F`, 사이드바 숨김, `isFocusMode` + `toggleFocusMode()`
- [x] 포모도로 타이머 — 25분+5분 플로팅 위젯, 최소화 지원, 완료 횟수 🍅 표시
- [x] 목차(TOC) 패널 — `xl:` 이상에서만 우측 sticky 표시, 헤딩 클릭 시 스크롤
- [x] **Periodic Notes** — `Ctrl+Alt+D`, 일간/주간/월간 노트 탭 (PeriodicNotesPanel.tsx). 연도/월 네비게이션 추가 (2026-03-26)
- [x] **WeeklyPlannerBlock** — 주간 캘린더 블록. 요일별 할일(스크롤 고정 높이), 날씨, 루틴 달성 연동
- [x] **RoutineMatrixBlock** — 독립 루틴 달성 매트릭스 블록. 주간 DayPlanner 스캔 → Mon-Sun ✅/✗ 그리드
- [x] **MonthlyCalendarBlock** — 월간 달력 블록. 6주 그리드, 일간 노트 연결, 날짜 메모
- [x] **QuarterlyPlannerBlock** — 분기 플래너 블록. OKR(목표+KR+진행률), 3개월 미니링크, 13주 루틴 히트맵
- [x] **YearlyPlannerBlock** — 연간 플래너 블록. 카테고리별 목표, 12개월 그리드, 4분기 그리드, 52주 잔디 히트맵
- [x] **PeriodicNotesPanel 단기/장기 2단 구조** — 단기(일간/주간/월간) + 장기(분기Q1~Q4/연간). 분기·연간 노트 각 1개 제한
- [x] **날씨 위치 통합** — settingsStore.weatherLocation 전역 저장, DayPlannerBlock/WeeklyPlannerBlock/PropertyPanel 공유

### ✅ 보안 + 백엔드
- [x] `validate_uuid()` — UUID 형식 검증, 400 에러로 경로 트래버설 차단
- [x] `assert_inside_vault()` — resolve() 후 VAULT_DIR 하위 여부 확인
- [x] 이미지 업로드 — 확장자 화이트리스트(jpg/png/gif/webp) + 10MB 제한
- [x] 라우터 분리 (`backend/routers/`) — pages, categories, export_import, search, system
- [x] API 실패 시 토스트 알림 (sonner)

### ✅ AI 시스템
- [x] AI 통합 (OpenAI / Claude / Ollama + SSE 스트리밍) — `backend/routers/ai.py` + `AITab.tsx`
- [x] BubbleMenuBar ✨ 버튼 — 다듬기/요약/계속쓰기/번역
- [x] **AIChatPanel 공통 컴포넌트** (`src/components/ai/AIChatPanel.tsx`) — sidebar/floating 2모드, 스트리밍 SSE, 적용 시 `ai-insert-text` 이벤트 디스패치
- [x] **플로팅 AI 글쓰기 패널** — `Ctrl+I` 토글 + `/ai` 슬래시 커맨드로 열기. 현재 페이지 전체 텍스트를 컨텍스트로 전달. `_aiInsertTarget` 모듈 변수로 마지막 포커스 커서 위치 추적 → 엉뚱한 블록 삽입 방지

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
- [x] **명령어 팔레트** (`Ctrl+P`) — 페이지 이동 + 빠른 액션 퍼지 검색 (CommandPalette.tsx)
- [x] **찾기/바꾸기** (`Ctrl+H`/`Ctrl+F`) — 플로팅 패널, 에디터 내 텍스트 검색·치환 (FindReplacePanel.tsx + findReplaceStore.ts + SearchHighlight.ts)
- [x] **그래프 뷰** (`Ctrl+G`) — 페이지 링크 관계 SVG 그래프. 자체 물리 시뮬레이션, 팬/줌/드래그 (GraphView.tsx)
- [x] **페이지 속성 패널** — 제목 아래 날짜/상태/선택/텍스트 4종 속성 인라인 편집 (PropertyPanel.tsx)
- [x] **데이터베이스 뷰** — 카테고리 페이지를 테이블로 표시, 인라인 셀 편집, page.tsx에서 dbViewActive로 토글 (DatabaseView.tsx)
- [x] **H4/H5/H6 헤딩 레벨** — SlashCommand 추가, StarterKit levels [1..6], globals.css 스타일
- [x] **텍스트 정렬** — BubbleMenuBar에 Left/Center/Right/Justify 버튼 (@tiptap/extension-text-align)
- [x] **커스텀 테마 프리셋** — default/notion/sepia/minimal/forest 5종 (AppearanceTab.tsx + settingsStore themePreset)
- [x] **통합 파일 사이드바** — 폴더 트리 + 페이지 인라인 + 검색 + 캘린더 + 최근파일 통합 (CategorySidebar.tsx). 리사이즈 핸들, 접힘 모드 지원
- [x] **카테고리 하위 폴더** — parentId 기반 중첩 폴더 트리, 재귀 UI, depth별 색상
- [x] **우클릭 컨텍스트 메뉴** — 블록 우클릭 → 타입 변환/복제/삭제/위아래 추가 (ContextMenu.tsx)
- [x] **에디터 너비 슬라이더** — BottomBar.tsx 통합, --editor-max-width CSS 변수 (settingsStore.editorMaxWidth)
- [x] **PDF 다운로드 (서버사이드)** — xhtml2pdf 백엔드 변환. `/api/export/pdf/{page_id}`. 내보내기 드롭다운에 "PDF 다운로드" + "인쇄(폴백)" 분리
- [x] **달력 뷰 (DatabaseView)** — 테이블|달력 탭 전환. 날짜 속성 기준 페이지 카드 배치. 날짜 없는 페이지는 하단 섹션에 표시
- [x] **페이지 잠금 (PIN)** — 4자리 이상 PIN 설정/해제. SHA-256 해시 저장. LockModal.tsx 신규. lockPage/unlockPage 스토어 액션
- [x] **알림/리마인더** — 날짜 속성에 🔔 토글 추가. 앱 시작 시 오늘 이하 날짜 reminder=true 속성 스캔 → Web Notification 발송. localStorage 중복 방지
- [x] **i18n 다국어 지원** — 한국어/영어 전환. `src/locales/ko.ts` (소스), `src/locales/en.ts` (Locale = typeof ko). `useLocale()` 훅. 설정 > 모양 탭에서 언어 선택. 전체 컴포넌트 적용 완료 (2026-03-28)

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
| POST | `/api/settings/vault-path` | vault 경로 변경 (vault_config.json 저장, 재시작 필요) |
| GET | `/api/debug/logs` | 서버 로그 (최근 100개) |
| GET | `/api/search?q=` | 페이지 제목 + 블록 내용 전문 검색 |
| POST | `/api/ai/stream` | AI SSE 스트리밍 (OpenAI/Claude/Ollama) |
| GET | `/api/templates` | 템플릿 목록 조회 |
| POST | `/api/templates` | 템플릿 생성 |
| PUT | `/api/templates/{id}` | 템플릿 수정 |
| DELETE | `/api/templates/{id}` | 템플릿 삭제 |
| POST | `/api/pages/{id}/files` | 파일 첨부 업로드 |
| GET | `/api/export/html/{page_id}` | 단일 페이지 HTML 내보내기 (이미지 base64 인라인) |
| GET | `/api/export/pdf/{page_id}` | 단일 페이지 PDF 내보내기 (xhtml2pdf 서버사이드 변환) |
| GET | `/static/{path}` | 이미지 파일 정적 서빙 |
| GET | `/api/pages/{id}/history` | 페이지 버전 목록 (filename, snapshotAt, title, blockCount) |
| GET | `/api/pages/{id}/history/{filename}` | 특정 버전 전체 데이터 (미리보기) |
| POST | `/api/pages/{id}/history/restore/{filename}` | 특정 버전으로 복원 (현재 버전 백업 후 복원) |
| GET | `/api/trash` | 휴지통 목록 (페이지·폴더 통합) |
| PATCH | `/api/trash/{item_id}/restore` | 항목 복원 (원래 위치로) |
| DELETE | `/api/trash/{item_id}` | 항목 영구 삭제 |
| DELETE | `/api/trash` | 휴지통 전체 비우기 |

---

## 7. Tiptap 확장 구성 (Editor.tsx)

```typescript
// 현재 등록된 확장 목록
StarterKit.configure({
  heading: { levels: [1, 2, 3, 4, 5, 6] },  // H1~H6 모두 지원
  link: { openOnClick: false },  // StarterKit 내장 Link
})
Placeholder          // 빈 블록 힌트 텍스트
Typography           // 자동 타이포그래피 교정
Highlight.configure({ multicolor: true })  // 배경색 피커
TextStyle            // 인라인 스타일 마크
Color                // 글자색 피커
FontFamily           // 인라인 글꼴 변경 (BubbleMenuBar)
FontSize             // 커스텀 확장 (src/extensions/FontSize.ts)
TextAlign.configure({ types: ['heading', 'paragraph'] })  // 텍스트 정렬
TaskList             // 체크박스 목록
TaskItem.configure({ nested: true })
Table.configure({ resizable: false })
TableRow, TableHeader, TableCell
CodeBlockLowlight.configure({ lowlight })  // 구문 강조
SearchHighlight      // 커스텀 확장 (찾기/바꾸기 하이라이트)
InlineMath           // 커스텀 확장 ($...$ 인라인 수식)
FootnoteInline       // 커스텀 확장 (각주)
```

**주의:** `@tiptap/extension-link`를 별도로 import하면 충돌 → StarterKit 내장만 사용

---

## 8. 설정 스토어 구조 (settingsStore.ts)

```typescript
// localStorage 키: 'notion-clone-settings'
{
  theme: 'light' | 'dark' | 'auto',
  themePreset: 'default' | 'notion' | 'sepia' | 'minimal' | 'forest',  // 색상 프리셋
  fontFamily: string,  // FONT_PRESETS의 id (예: 'noto-sans')
  fontSize: number,    // 에디터 전체 기본 크기 (px)
  lineHeight: number,  // 1.4 ~ 2.0
  editorMaxWidth: number,  // 에디터 최대 너비 (px, 기본 768) → --editor-max-width
  sidebarWidth: number,    // 사이드바 너비 (160~480, 기본 260)
  sidebarCollapsed: boolean, // 사이드바 접힘 모드 (아이콘만 표시)
  isFocusMode: boolean,  // volatile — 앱 재시작 시 항상 false
  plugins: {
    kanban: boolean,          // ✅ 구현됨
    calendar: boolean,        // ✅ 구현됨
    admonition: boolean,      // ✅ 구현됨
    excalidraw: boolean,      // ✅ 구현됨 (기본값 false)
    recentFiles: boolean,     // ✅ 구현됨
    quickAdd: boolean,        // ✅ 구현됨
    wordCount: boolean,       // ✅ 구현됨
    focusMode: boolean,       // ✅ 구현됨
    pomodoro: boolean,        // ✅ 구현됨
    tableOfContents: boolean, // ✅ 구현됨
    periodicNotes: boolean,   // ✅ 구현됨
    canvas: boolean,          // ✅ 구현됨
    chart: boolean,           // ✅ 구현됨 (Bar/Line/Pie)
    gantt: boolean,           // ✅ 구현됨 (타임라인/갠트 차트)
    mindmap: boolean,         // ✅ 구현됨 (AI 마인드맵 블록)
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

### 🟡 우선순위 중간 (다음 개발 후보)

#### ~~9-A. AI 마인드맵 블록~~ ✅ 완료 (2026-03-18)
- `src/components/editor/MindmapBlock.tsx` 신규 생성
  - 방사형 레이아웃: 리프 수 비례 각도 배분, 깊이별 반지름 축소, 최소 각도 보장
  - 노드 인터랙션: 더블클릭 편집, Tab 자식추가, Enter 형제추가, Delete 삭제, Escape 선택해제
  - 접기/펼치기: ±버튼, collapsed 노드 하위 전체 숨김
  - 팬/줌: 배경 드래그 팬, Ctrl+스크롤 줌 (0.25~3배)
  - 우클릭 컨텍스트 메뉴: 자식추가, 이름편집, AI로 확장, 삭제
  - AI 채팅 패널: set_all / add_children / rename JSON 액션 3종
  - 기존 `/api/ai/stream` SSE 재사용, 응답 누적 후 JSON 파싱
  - 500ms 디바운스 저장 (block.content JSON)

#### ~~9-B. PDF 내보내기 개선~~ ✅ 완료 (2026-03-25)
- `xhtml2pdf` (pure Python) 백엔드 변환 → `GET /api/export/pdf/{page_id}`
- PageEditor 내보내기 드롭다운: "PDF 다운로드"(서버) + "인쇄"(window.print 폴백) 분리

#### ~~9-C. 달력 뷰~~ ✅ 완료 (2026-03-25)
- `DatabaseView.tsx` 상단 "테이블 | 달력" 탭 추가
- 날짜 속성(type==='date') 값 기준으로 해당 날짜 셀에 페이지 카드 표시
- 날짜 없는 페이지 → 하단 "날짜 없음" 섹션에 칩으로 표시

#### ~~9-D. 페이지 잠금~~ ✅ 완료 (2026-03-25)
- `Page.lockPin?: string` 필드 추가 (SHA-256 해시 저장)
- `lockPage(pageId, pinHash)` / `unlockPage(pageId)` 스토어 액션 추가
- `LockModal.tsx` 신규 — lock/unlock 2가지 모드, Web Crypto API SHA-256
- PageEditor 잠금 버튼 → PIN 설정 모달 / 해제 시 PIN 검증 모달

#### ~~9-E. 알림/리마인더~~ ✅ 완료 (2026-03-25)
- `PageProperty.reminder?: boolean` 필드 추가
- PropertyPanel의 date 속성 행에 🔔 토글 버튼 추가
- page.tsx 앱 시작 시 reminder=true + 오늘이거나 지난 날짜 → Web Notification 발송
- `localStorage['notion-clone-notified']`로 중복 방지 (최대 500개)

### 🟢 낮은 우선순위

#### 9-F. 플래시카드
- 페이지 내용으로 간격 반복 학습 카드 생성 (SM-2 알고리즘)

#### 9-G. 웹 클리퍼
- 브라우저 확장으로 웹페이지 → 노트 저장

#### 9-H. 음성 메모
- 마이크 녹음 → 텍스트 변환 (Whisper API)

#### 9-I. 페이지 게시
- 로컬 HTTP 서버로 노트 공유 링크 생성

---

### 🟢 앞으로 개발할 기능 (기존 완료됨)

#### ~~9-7. Excalidraw 손그림 블록~~ ✅ 완료 (2026-02-26)
- `@excalidraw/excalidraw` v0.18.0 설치
- `src/components/editor/ExcalidrawBlock.tsx` 신규 생성
  - `next/dynamic` + `ssr: false` 동적 임포트
  - `initialData` — blockId를 키로 useMemo, 첫 마운트 시에만 파싱
  - `onChange` — 800ms 디바운스 후 `updateBlock` 호출
  - 전체화면 토글 버튼 (fixed inset-0 z-50)
  - `langCode="ko-KR"` 한국어 로케일
- `src/types/block.ts` — `'excalidraw'` 추가
- `src/components/editor/SlashCommand.tsx` — Excalidraw 항목 + pluginBlockMap 추가
- `src/components/editor/Editor.tsx` — 초기 content `{}` + 렌더 브랜치 추가
- `src/components/settings/tabs/PluginsTab.tsx` — `available: true`, version `'1.0.0'`로 변경
- content 저장 형식: `{ "elements": [...], "appState": { "viewBackgroundColor": "#ffffff" } }`

#### ~~9-8. 블록 히스토리 / Undo-Redo 개선~~ ✅ 완료
- `pageHistoryMap` — 페이지별 `{ past: string[], future: string[] }` 외부 Map (최대 50개)
- `pushBlockHistory()` — 구조 변경 직전 스냅샷 저장 (addBlock/deleteBlock/moveBlock/updateBlockType/duplicateBlock/addBlockBefore/applyTemplate 모두 적용)
- `undoPage(pageId)` / `redoPage(pageId)` — past↔future 교환 + 복원
- `canUndo(pageId)` / `canRedo(pageId)` — 버튼 활성화 상태 계산
- `historyVersion` (Zustand 상태) — 구조 변경마다 증가 → 버튼 리렌더링 트리거
- `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` 글로벌 단축키 → `page.tsx` (contenteditable 내에서는 Tiptap에 위임)
- Undo2 / Redo2 버튼 UI → `PageEditor.tsx` 에디터 상단 우측, `disabled` 상태 연동

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

#### ~~9-11. 모바일 반응형~~ ✅ 완료 (2026-02-27)
- `page.tsx` — `sidebarOpen` 상태 + ☰ 햄버거 버튼 (`md:hidden fixed top-3 left-3 z-50`)
  - 모바일: 사이드바 패널 기본 숨김(`hidden md:flex`) → 햄버거 탭 시 `fixed inset-y-0 left-0 z-40` 드로어
  - 오버레이 배경(`fixed inset-0 z-30 bg-black/40`) 탭 시 사이드바 닫힘
  - `<main className="pt-14 md:pt-0">` — 모바일 햄버거 버튼 공간 확보
  - `TouchSensor { delay:250, tolerance:5 }` 추가 (카테고리/페이지 드래그)
- `PageList.tsx` — `onCloseMobile?: () => void` prop 추가, 페이지 선택·최근 파일 클릭 시 사이드바 자동 닫힘
- `PageEditor.tsx` — `px-4 sm:px-8 md:px-16` 반응형 본문 패딩 + `TouchSensor` (블록 드래그)
- `BubbleMenuBar.tsx` — 버튼 `py-1` → `py-2` (터치 친화적 높이, 모든 서식/색상/링크 버튼 일괄 적용)

#### 9-12. ✅ 페이지 간 블록 이동/복사 (2026-02-26 완료)
- **BlockMenu.tsx** `+` 버튼 메뉴에 "다른 페이지로 이동 ↗️" / "다른 페이지로 복사 🔗" 추가
- **PagePickerPopup** 인라인 컴포넌트: 검색창 + 페이지 목록, fixed 위치(anchor rect 기준)
  - 현재 페이지 자동 제외, Escape·외부클릭 닫기, 즉시 포커스
- **pageStore.ts** 새 액션:
  - `moveBlockToPage(fromPageId, toPageId, blockId)` — 원본 삭제 + 대상 마지막에 추가 + 양쪽 undo 스냅샷
  - `copyBlockToPage(fromPageId, toPageId, blockId)` — 원본 유지 + 대상에 새 ID로 복사본 추가
- 완료 후 sonner 토스트: `"블록이 '페이지명'으로 이동/복사됐습니다"`

#### 9-13. ✅ 페이지 템플릿 (2026-02-26 완료)
- **TemplatePanel.tsx** — 빈 페이지(블록 1개, 내용 없음) 자동 표시, 템플릿 카드 선택 시 `applyTemplate()` 호출
- **TemplatesTab.tsx** — 설정 > 템플릿 탭: 생성·편집·삭제 UI (인라인 폼, 마크다운 입력, sonner 토스트)
- **backend/routers/templates.py** — CRUD API + 서버 시작 시 기본 템플릿 5종 자동 시드
  - 시드 조건: `vault/_templates/` 폴더가 비어 있을 때만 실행 (기존 사용자 데이터 보존)
  - 기본 템플릿: 📋 회의록, 📊 프로젝트 계획, 📅 일일 저널, 📖 독서 노트, 🎯 목표 설정
- **templateParser.ts** — 마크다운 → Block 배열 파서 (heading/list/taskList/code/divider 지원)
- **vault/_templates/** — JSON 파일로 저장 (`{id}.json`), UUID 형식 검증으로 경로 트래버설 차단

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

---

## 14. Excalidraw 블록 패턴

### 동적 임포트 (SSR 비활성화)
```tsx
// Excalidraw는 브라우저 전용 API를 사용하므로 반드시 SSR: false
const ExcalidrawComponent = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw')
    return mod.Excalidraw
  },
  { ssr: false, loading: () => <div>✏️ 로딩 중...</div> }
)
```

### initialData 재렌더 방지
```tsx
// blockId가 바뀔 때만 재계산 — content 변경 시 Excalidraw 내부 상태 보존
const initialData = useMemo(() => {
  try {
    const p = JSON.parse(content)
    return { elements: p.elements ?? [], appState: { viewBackgroundColor: p.appState?.viewBackgroundColor ?? '#ffffff' }, scrollToContent: true }
  } catch {
    return { elements: [], appState: { viewBackgroundColor: '#ffffff' }, scrollToContent: false }
  }
}, [blockId])  // ← content 의존성 의도적으로 제외
```

### CSS 임포트
```tsx
import '@excalidraw/excalidraw/index.css'  // 컴포넌트 상단에 포함
```

---

---

## 향후 검토 라이브러리

### pretext (chenglou/pretext)
- **GitHub**: https://github.com/chenglou/pretext
- **역할**: DOM 없이 텍스트 높이/레이아웃을 사전 계산하는 순수 JS/TS 라이브러리
- **성능**: `prepare()` ~19ms (일회성) / `layout()` ~0.09ms (캐시 기반)
- **검토 배경**: 캔버스 블록에 LaTeX·이미지·텍스트 혼합 콘텐츠 지원 시 블록 높이 사전 계산 용도로 검토
- **현재 불필요한 이유**: 현재 캔버스는 CSS flex 기반 DOM 레이아웃으로 브라우저가 높이를 자동 처리함
- **필요해지는 시점**:
  - 캔버스를 Figma/Miro처럼 x/y 절대좌표 자유 배치 방식으로 전환할 때
  - 수천 개 블록의 가상 스크롤(virtual scroll) 구현 시
  - 캔버스를 PDF/이미지로 서버사이드 내보내기 구현 시
  - `<canvas>` API로 직접 그리는 렌더러로 전환 시

---

*이 청사진은 2026-03-25 기준 구현 상태를 반영합니다. (9-B~9-E 모두 완료)*
*새 기능 구현 후 해당 섹션(3번 폴더구조, 5번 기능목록, 6번 API, 9번 계획)을 업데이트해 주세요.*
