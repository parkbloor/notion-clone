# 11. Widgets — 위젯 / AI 패널

> 에디터와 독립적으로 플로팅하거나 하단 바에 고정되는 위젯 컴포넌트들.

---

## [src/components/editor/PomodoroWidget.tsx](../src/components/editor/PomodoroWidget.tsx)

**역할:** 포모도로 타이머 플로팅 위젯. 25분 집중 → 5분 휴식 사이클. `bottom-12 right-14` 고정 위치.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PomodoroWidget` | `default function` | 포모도로 타이머 위젯 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `Phase` | `'work' \| 'break'` |
| `WORK_SECONDS` | `1500` (25분) |
| `BREAK_SECONDS` | `300` (5분) |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `fmtTime(s)` | 초 → `MM:SS` 포맷 |

### 상태

| 상태 | 설명 |
|------|------|
| `phase` | 현재 단계 (work/break) |
| `secondsLeft` | 남은 초 |
| `isRunning` | 타이머 실행 여부 |
| `completedCount` | 완료된 포모도로 수 |
| `minimized` | 최소화 여부 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| tick | `setInterval` 1초마다 감소. `phaseRef` 패턴으로 stale closure 방지 |
| 단계 전환 | 0초 도달 → 단계 전환 + 4초간 `document.title` 알림 |
| 최소화 | 시계 아이콘만 표시 모드 |

---

## [src/components/editor/WordCountBar.tsx](../src/components/editor/WordCountBar.tsx)

**역할:** 에디터 하단 단어·글자 수 표시 바. `wordCount` 플러그인 ON 시만 렌더링.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `WordCountBar` | `default function` | 단어/글자 수 표시 바 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `blocks` | `Block[]` | 현재 페이지 블록 목록 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML → 순수 텍스트 |
| `countText(blocks)` | `{ words, chars }` 집계. 미디어·플래너·다이어그램 등 JSON 전용 블록 제외 |

---

## [src/components/editor/CalendarWidget.tsx](../src/components/editor/CalendarWidget.tsx)

**역할:** 계획 탭 사이드바의 미니 월간 달력. 페이지 생성일을 로컬 날짜 기준으로 표시하고, 날짜 클릭으로 페이지 목록을 필터링한다.

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pages` | `Page[]` | 생성일 표시 대상 페이지 목록 |
| `selectedDate` | `string \| null` | 선택된 `YYYY-MM-DD` 날짜 |
| `onSelectDate` | `(date: string \| null) => void` | 날짜 필터 변경 콜백 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 날짜 표시 | 서버 UTC `createdAt`을 브라우저 로컬 날짜로 변환해 점·월별 개수를 표시 |
| 날짜 필터 | 같은 날짜 재클릭 시 필터 해제, 다른 날짜 클릭 시 페이지 목록 필터 변경 |

---

## [src/components/ai/AIChatPanel.tsx](../src/components/ai/AIChatPanel.tsx)

**역할:** 재사용 가능한 AI 대화 패널 공통 컴포넌트. `sidebar` / `floating` 2모드. SSE 스트리밍 지원. `ChartBlock`, `MindmapBlock`, `DayPlannerBlock`, `GlobalAIChatButton`에서 사용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `AIChatPanel` | `default function` | AI 채팅 패널 컴포넌트 |
| `ChatMsg` | `interface` | `{ role: 'user' \| 'assistant' \| 'system', content: string }` |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `title` | `string` | 패널 헤더 제목 |
| `icon` | `string` | 이모지 아이콘 |
| `emptyHint` | `string` | 빈 상태 안내 문구 |
| `systemPrompt` | `string` | AI 역할 지시문 |
| `context?` | `string \| (() => string)` | 블록 내용 컨텍스트 (함수면 매 요청 시 최신값 호출) |
| `placeholder?` | `string` | 입력창 placeholder (기본은 로케일 문자열) |
| `quickCommands?` | `string[]` | 빠른 명령어 칩 버튼 목록 |
| `mode` | `'sidebar' \| 'floating'` | 표시 모드 |
| `applyLabel?` | `string` | 적용 버튼 텍스트 (기본: `'✓ 적용'`) |
| `onApply` | `(text: string) => string \| void` | AI 응답 적용 콜백. 반환값 있으면 성공 메시지로 추가 |
| `onClose` | `() => void` | 패널 닫기 콜백 |
| `initialHistory?` | `ChatMsg[]` | 초기 히스토리 (저장된 대화 복원) |
| `onHistoryChange?` | `(history: ChatMsg[]) => void` | 히스토리 변경 알림 (저장 연동) |
| `initialPos?` | `{ right, bottom }` | floating 모드 초기 위치 (기본: `{ right:16, bottom:16 }`) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 스트리밍 | FastAPI SSE 엔드포인트 → `ReadableStream` → `streamText` 상태 실시간 업데이트 |
| 제공자 | `settingsStore`의 `aiProvider` (`openai` / `claude` / `ollama`) + `aiModel` + `aiApiKey` + `ollamaUrl` |
| 메시지 전송 | Enter 또는 전송 버튼. 전송 중 중복 방지 |
| 적용 버튼 | 어시스턴트 메시지별 `✓ 적용` 버튼. 한 번 적용 후 비활성화 (`appliedIndices`) |
| 드래그 (floating) | 패널 헤더 드래그로 위치 이동 |
| 자동 스크롤 | 메시지 추가 시 `chatEndRef.scrollIntoView()` |

---

## [src/components/ai/GlobalAIChatButton.tsx](../src/components/ai/GlobalAIChatButton.tsx)

**역할:** 컨텍스트 인식 전역 AI 채팅 FAB(Floating Action Button). 우하단 고정. 선택 블록 타입에 따라 AI 모드 자동 전환.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GlobalAIChatButton` | `default function` | 전역 AI 채팅 FAB 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `AiTarget` | `{ blockId, blockType }` — 현재 선택된 블록 |
| `TEXT_BLOCK_TYPES` | 텍스트 블록 타입 집합 (paragraph, heading1~6, bulletList, 등) |
| `MINDMAP_SYSTEM_PROMPT` | 마인드맵 전용 시스템 프롬프트 (JSON: `set_all` / `add_children` / `rename` 액션) |
| `CHART_SYSTEM_PROMPT` | 차트 전용 시스템 프롬프트 (JSON: `chartType`, `labels`, `series`) |
| `BlockAiConfig` | `{ title, icon, fabBg, systemPrompt, quickCommands, emptyHint }` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 블록 감지 | `'ai-block-select'` 커스텀 이벤트 수신 → `AiTarget` 업데이트 |
| 모드 전환 | 블록 타입별 자동 설정: `dayplanner` → 일정 AI, `mindmap` → 마인드맵 AI, `chart` → 차트 AI, 텍스트 블록 → 글쓰기 AI |
| 응답 적용 | 블록 타입에 따라 다름: `dayplanner` → `ai-apply-schedule` 이벤트 발행, 마인드맵 → `ai-apply-mindmap` 이벤트, 차트 → `ai-apply-chart` 이벤트, 텍스트 → Tiptap `insertContent()` |
| 히스토리 | 블록 ID별로 `chatHistoryMap` 독립 유지 → `initialHistory` + `onHistoryChange`로 `AIChatPanel`에 연동 |
| PLANNER_SYSTEM_PROMPT | `DayPlannerBlock`에서 `export`한 것을 import해서 재사용 |
