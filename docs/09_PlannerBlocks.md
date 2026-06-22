# 09. PlannerBlocks — 플래너 / 캘린더 컴포넌트

> 날짜·일정·루틴 관리에 특화된 블록 컴포넌트 모음.
> 대부분 서로 데이터를 참조: `DayPlannerBlock`의 이벤트 데이터를
> `WeeklyPlannerBlock`, `QuarterlyPlannerBlock`, `YearlyPlannerBlock`, `RoutineMatrixBlock`이 집계한다.

---

## [src/components/editor/DayPlannerBlock.tsx](../src/components/editor/DayPlannerBlock.tsx)

**역할:** Day Planner 인라인 타임라인 블록. 설정 가능한 시간 축에 이벤트를 시각화하고, 루틴/날씨/회고/아카이브/AI 일정 제안을 통합한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `DayPlannerBlock` | `default function` | Day Planner 블록 컴포넌트 |
| `PLANNER_SYSTEM_PROMPT` | `const string` | AI 일정 시스템 프롬프트 (GlobalAIChatButton 재사용) |
| `PlannerData` | `interface` | content JSON 포맷 `{ eventsByDate, reviewByDate? }` |

> `PlanEvent`, `SubTask`, `Routine` 타입은 [src/types/block.ts](../src/types/block.ts)에서 export된다.

### 내부 상수

| 상수 | 설명 |
|------|------|
| `_activePlannerBlockId` | 모듈 레벨 변수 — 마지막 활성 DayPlannerBlock ID. `ai-apply-schedule` 이벤트 수신 대상 결정 |
| `HISTORY_DAYS` | 90일 초과 이벤트를 아카이브로 이동할 기준 |
| `WMO_ICON` | WMO 날씨 코드 → 이모지 매핑 |

### 관련 모듈

| 파일 | 설명 |
|------|------|
| `src/components/editor/planner/PlannerTimeline.tsx` | 일간/아카이브 타임라인 공유 렌더러. `EVENT_COLORS`, `START_HOUR`, `END_HOUR`, 시간 계산 유틸도 export |
| `src/store/settingsStore.ts` | `weatherLocation`, `plannerStartHour`, `plannerEndHour`, `plannerZoom`, `plannerRoutines` 저장 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 타임라인 | `PlannerTimeline`으로 렌더링. `plannerStartHour`~`plannerEndHour`, `plannerZoom` 반영 |
| 빈 슬롯 클릭 | 클릭 위치 → `yToTime()` 계산 → 인라인 이벤트 생성 폼 |
| 시간 미지정 | `PlanEvent.scheduled === false`로 저장. 과거 `start === '00:00'` 판정과 구분 |
| 현재 시각선 | 1분 간격 `setInterval` 업데이트 |
| AI 일정 제안 | `AIChatPanel` 통합. 응답에서 JSON 코드블록 파싱 → `add`/`replace` 액션 |
| 루틴 | `settingsStore.plannerRoutines`를 기준으로 생성/적용. block content와 분리 저장 |
| 날씨 | `/api/weather/day` Next API 프록시 호출 |
| 회고 | `reviewByDate[date]`에 일일 회고 저장 |
| 아카이브 | 최근 데이터는 block content, 오래된 일정은 planner archive API에 보관 |
| 날짜 네비 | `←/→` 버튼으로 하루씩 이동 |

---

## [src/components/editor/planner/PlannerTimeline.tsx](../src/components/editor/planner/PlannerTimeline.tsx)

**역할:** Day Planner 계열에서 공유하는 타임라인 렌더러와 시간 계산 유틸.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `EVENT_COLORS` | `const` | 이벤트 컬러 팔레트 16종 |
| `START_HOUR` / `END_HOUR` | `const` | 기본 시간 범위 `0` / `24` |
| `timeToMin(t)` | `function` | `HH:MM` → 분 |
| `minToTime(min)` | `function` | 분 → `HH:MM` |
| `eventPx(event, hourPx, startHour?, endHour?)` | `function` | 이벤트 위치/높이 계산 |
| `layoutEvents(events, hourPx, startHour?, endHour?)` | `function` | 겹치는 이벤트를 컬럼으로 배치 |
| `yToTime(y, hourPx, startHour?, endHour?, snapMin?)` | `function` | 클릭/드래그 Y좌표 → 시간 |
| `isScheduledEvent(event)` | `function` | 예약 이벤트 판정. `scheduled=false`면 시간 미지정 |
| `isUnscheduledEvent(event)` | `function` | 시간 미지정 이벤트 판정 |
| `PlannerTimeline` | `default function` | 타임라인 UI 컴포넌트 |

---

## [src/components/editor/DayPlannerPanel.tsx](../src/components/editor/DayPlannerPanel.tsx)

**역할:** Day Planner 우측 플로팅 패널. 에디터 옆에 항상 열어두고 일정 확인. 전체 페이지 DayPlannerBlock에서 날짜별 이벤트 수집.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `DayPlannerPanel` | `default function` | Day Planner 패널 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 패널 닫기 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `todayStr()` | 오늘 날짜 `YYYY-MM-DD` 반환 |
| `shiftDate(ds, delta)` | 날짜 문자열 ± N일 계산 |
| `formatDate(ds)` | `YYYY-MM-DD` → `M/D (요일)` 포맷 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `COLOR_DOT` | 컬러 ID → dot Tailwind 클래스 |
| `COLOR_BAR` | 컬러 ID → bar 배경 클래스 |
| `COLOR_TEXT` | 컬러 ID → 텍스트 색상 클래스 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 이벤트 수집 | 전체 페이지의 `dayplanner` 블록 스캔 → `eventsByDate[selectedDate]` 집계 |
| 이벤트 클릭 | `setCurrentPage()` → 해당 페이지로 이동 |
| 빠른 추가 | 현재 페이지의 `dayplanner` 블록에 이벤트 저장 (없으면 자동 생성) |
| 날짜 네비 | `←/→` 버튼으로 하루씩 이동 |

---

## [src/components/editor/WeekPlannerBlock.tsx](../src/components/editor/WeekPlannerBlock.tsx)

**역할:** 멀티데이 주간 타임라인 블록. 모든 페이지의 Day Planner 이벤트를 날짜 열로 모아 보여주고 날짜 간 드래그 이동을 지원한다.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `WeekPlannerData` | `interface` | `{ weekStart, range }`. `range`는 `'7' \| '5' \| '3'` |
| `WeekPlannerBlock` | `default function` | 멀티데이 타임라인 블록 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 주 시작 | `settingsStore.weekStartDay` 기준으로 `weekStart` 계산 |
| 이벤트 수집 | 모든 `dayplanner` 블록의 `eventsByDate`에서 표시 날짜 이벤트 집계 |
| 범위 모드 | 7일/5일/3일 표시 |
| 드래그 이동 | 이벤트를 다른 날짜 컬럼으로 이동하면 원본/대상 Day Planner content 갱신 |
| 현재 시각선 | 오늘 컬럼에만 표시 |

---

## [src/components/editor/WeeklyPlannerBlock.tsx](../src/components/editor/WeeklyPlannerBlock.tsx)

**역할:** 주간 플래너 블록. 7일 날짜 그리드 + 날씨(자동/수동) + 할 일 인라인 편집 + 루틴 매트릭스.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `WeeklyPlannerBlock` | `default function` | 주간 플래너 블록 컴포넌트 |
| `WeeklyPlannerData` | `interface` | content JSON 포맷 `{ weekStart, days, location? }` |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `WeekTask` | `{ id, text, done }` | 할 일 항목 |
| `WeekDayWeather` | `{ icon, temp }` | 날씨 (이모지 + 온도 문자열) |
| `WeekDayData` | `{ weather?, tasks: WeekTask[] }` | 하루 데이터 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `WMO_ICON` | WMO 날씨 코드 → 이모지 매핑 (Open-Meteo API 응답) |
| `WEATHER_ICONS` | 수동 날씨 선택 아이콘 10종 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `getMondayOf(ds)` | 해당 날짜가 속한 주의 월요일 반환 |
| `wmoToIcon(code)` | WMO 코드 → 이모지 (매핑 없으면 `'🌡️'`) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 날씨 자동 | `/api/weather/day` Next API 프록시를 날짜별 호출. `settingsStore.weatherLocation` 공유 |
| 날씨 수동 | 날씨 아이콘 클릭 → 수동 선택 팝업 |
| 루틴 달성 | `plannerRoutines`와 Day Planner `eventsByDate`의 `done` 데이터 집계 → 하단 매트릭스 표시 |
| 주 네비 | `←/→` 버튼으로 주 단위 이동 |

---

## [src/components/editor/MonthlyCalendarBlock.tsx](../src/components/editor/MonthlyCalendarBlock.tsx)

**역할:** 월간 캘린더 블록. 5~6주 그리드. 날짜 클릭 → 일간 노트 이동/생성. 날짜별 메모.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MonthlyCalendarBlock` | `default function` | 월간 캘린더 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `MonthlyCalData` | `{ year, month, memos: Record<string, string> }` | content JSON 포맷 |
| `CalCell` | `{ dateStr, day, isCurrentMonth }` | 달력 셀 하나 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 달력 그리드 | 일~토 7열 고정. 당월 외 날짜 흐리게, 주말 색상, 오늘 강조 |
| 날짜 클릭 | `YYYY-MM-DD` 제목의 일간 노트 탐색 → 없으면 `addPage()` + `setCurrentPage()` |
| 일간 노트 표시 | 날짜에 해당하는 페이지 존재 시 하단 파란 점 인디케이터 |
| 메모 | hover → 인라인 `<input>` → blur 시 `memos` 저장 |
| 월 네비 | `←/→` 버튼 |

---

## [src/components/editor/QuarterlyPlannerBlock.tsx](../src/components/editor/QuarterlyPlannerBlock.tsx)

**역할:** 분기 플래너 블록. OKR (목표 + 핵심 결과 + 진행률) + 3개월 링크 + 13주 루틴 히트맵.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `QuarterlyPlannerBlock` | `default function` | 분기 플래너 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `KeyResult` | `{ id, title, progress: 0–100 }` | OKR 핵심 결과 |
| `Objective` | `{ id, title, keyResults: KeyResult[] }` | OKR 목표 |
| `QuarterlyData` | `{ year, quarter: 1~4, objectives: Objective[] }` | content JSON 포맷 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `QUARTER_MONTHS` | `{ 1:[1,2,3], 2:[4,5,6], 3:[7,8,9], 4:[10,11,12] }` |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `heatColor(ratio)` | 달성률 → Tailwind 색상 클래스 (gray~emerald 스케일) |
| `getMondayOf(d)` | 날짜 → 해당 주 월요일 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| OKR | 목표/핵심결과 CRUD + 진행률 슬라이더 |
| 월간 링크 | 해당 분기 3개월 → 월간 노트 페이지 이동/생성 |
| 히트맵 | 13주 × 7일 DayPlannerBlock 루틴 달성 집계 |
| 분기 네비 | `←/→` Q1/Q2/Q3/Q4 이동 |
| readMode | `readMode=true`면 편집 컨트롤 숨김 |

---

## [src/components/editor/YearlyPlannerBlock.tsx](../src/components/editor/YearlyPlannerBlock.tsx)

**역할:** 연간 플래너 블록. 연간 목표(카테고리별) + 12개월 링크 + 4분기 링크 + 53주 루틴 히트맵(GitHub 잔디 스타일).

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `YearlyPlannerBlock` | `default function` | 연간 플래너 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `YearlyGoal` | `{ id, category, title, done }` | 연간 목표 하나 |
| `YearlyData` | `{ year, goals: YearlyGoal[] }` | content JSON 포맷 |

### 내부 상수

| 상수 | 설명 |
|------|------|

### 내부 함수

| 함수 | 설명 |
|------|------|
| `heatColor(ratio, inYear)` | 달성률 + 해당 연도 여부 → emerald 히트맵 색상 |
| `getMondayOf(d)` | 날짜 → 해당 주 월요일 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 연간 목표 | 카테고리별 CRUD + done 토글 |
| 12개월 그리드 | 월 클릭 → 월간 노트 이동/생성 |
| 4분기 그리드 | 분기 클릭 → 분기 노트 이동/생성 |
| 히트맵 | 53주 × 7일 루틴 달성 (GitHub 잔디 스타일) |
| 연도 네비 | `←/→` 이전/다음 년도 |
| readMode | `readMode=true`면 편집 컨트롤 숨김 |

---

## [src/components/editor/RoutineMatrixBlock.tsx](../src/components/editor/RoutineMatrixBlock.tsx)

**역할:** 루틴 달성 매트릭스 독립 블록. 전체 페이지의 DayPlannerBlock을 스캔해 주간 루틴 완료 여부 집계. 요일별 ✅/✗/─ 표시 + 달성률.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `RoutineMatrixBlock` | `default function` | 루틴 매트릭스 블록 컴포넌트 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `RoutineMatrixData` | `{ weekStart: string }` — content JSON 포맷 (월요일 기준 날짜만 저장) |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `getMondayOf(ds)` | 날짜 문자열 → 해당 주 월요일 반환 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 데이터 수집 | 전체 `pages` 스캔 → `dayplanner` 블록 → `PlannerData` 파싱 → 루틴 완료 여부 집계 |
| 표시 | 루틴명 × 요일(월~일) 매트릭스. 완료=✅, 미완료=✗, 해당일 없음=─ |
| 달성률 | 행 우측에 `X/7` 형태 |
| 주 네비 | `←/→` 버튼으로 주 단위 이동 |

---

## [src/components/editor/CalendarWidget.tsx](../src/components/editor/CalendarWidget.tsx)

**역할:** 미니 월간 달력 위젯. `CategorySidebar` 안에 내장. 날짜별 페이지 존재 표시 + 날짜 필터.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CalendarWidget` | `default function` | 미니 달력 위젯 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pages` | `Page[]` | 전체 페이지 목록 (날짜 인디케이터 계산용) |
| `selectedDate` | `string \| null` | 선택된 날짜 `YYYY-MM-DD` 또는 null |
| `onSelectDate` | `(date: string \| null) => void` | 날짜 클릭 콜백. 같은 날짜 재클릭 → null |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `toDateStr(date)` | `Date` → `YYYY-MM-DD` (로컬 타임존) |
| `isoToLocalDateStr(val)` | `Date | string` → `YYYY-MM-DD`. ISO 문자열이면 앞 10자 추출 |

---

## [src/components/editor/CalendarOverlay.tsx](../src/components/editor/CalendarOverlay.tsx)

**역할:** 전체 vault 캘린더 오버레이 (`Ctrl+Shift+C`). 월간/주간/일간 3탭 뷰. `date`+`time` 속성 기반 타임 블록 시각화.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CalendarOverlay` | `default function` | 캘린더 오버레이 컴포넌트 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `ViewTab` | `'month' \| 'week' \| 'day'` |
| `HOUR_PX` | `64` — 시간 슬롯 1시간당 픽셀 높이 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `makeCalGrid(year, month)` | 월 달력 그리드 셀 배열 (앞뒤 null 포함, 7열 고정) |
| `getWeekDates(anchor)` | 앵커 날짜 기준 주간 7일 배열 (월요일 시작) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 월간 탭 | 월요일 시작 달력 그리드. 날짜별 페이지 목록 미리보기 |
| 주간 탭 | 월요일 시작 7열 타임라인. `time` 속성 기반 시간 블록 절대 위치 계산 (`HOUR_PX` 기준) |
| 일간 탭 | 단일 날짜 타임라인 |
| 빈 슬롯 클릭 | 날짜·시간 자동 설정된 새 페이지 생성 (속성 패널 date+time 자동 입력) |
