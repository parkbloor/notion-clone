# Day Planner Phase 2 — 잔여 기능 개발 계획

> 작성일: 2026-04-06
> Phase 1 완료 기준: 드래그·리사이즈, Clock In/Out UI, 주간 뷰(WeekPlannerBlock), 타임라인 시작시각·스냅 설정 모두 구현됨

---

## Phase 2 개발 대상 (미구현 6개)

| 순위 | 기능 | 난이도 | 영향 파일 |
|---|---|:---:|---|
| 1 | **완료 이벤트 숨기기 토글** | 🟢 쉬움 | `DayPlannerBlock.tsx` |
| 2 | **저장 시 시간순 자동 정렬** | 🟢 쉬움 | `DayPlannerBlock.tsx` |
| 3 | **타임라인 줌 레벨 조정** | 🟡 중간 | `DayPlannerBlock.tsx`, `settingsStore.ts`, `EditorTab.tsx` |
| 4 | **미예약(Unscheduled) 이벤트 섹션** | 🟡 중간 | `DayPlannerBlock.tsx`, `types/block.ts` |
| 5 | **주간 시작 요일 설정** | 🟡 중간 | `WeekPlannerBlock.tsx`, `settingsStore.ts`, `EditorTab.tsx` |
| 6 | **데스크탑 알림** | 🔴 어려움 | `DayPlannerBlock.tsx`, `settingsStore.ts` |

---

## 1. 완료 이벤트 숨기기 토글

### 목표
- 헤더에 👁 토글 버튼 추가
- `hideDone` 상태: ON 시 `event.done === true` 이벤트를 타임라인 + 목록에서 모두 숨김
- 블록 로컬 state (저장 불필요)

### 구현 방식
```tsx
// DayPlannerBlock 헤더에 추가
const [hideDone, setHideDone] = useState(false)

// 렌더 시 이벤트 필터
const visibleEvents = hideDone ? data.events.filter(e => !e.done) : data.events
const layoutItems   = useMemo(() => layoutEvents(visibleEvents), [visibleEvents])
```

### UI
- 헤더 완료 수 뱃지 (`2/5 완료`) 옆에 토글 버튼
- `hideDone=true`: 눈 닫힘 아이콘 + 파란 배경
- `hideDone=false`: 눈 아이콘 + 기본 스타일

---

## 2. 저장 시 시간순 자동 정렬

### 목표
- `upsertEvent()` 호출 후 `data.events`가 항상 `start` 오름차순으로 저장됨
- AI 일정 적용(`applyAiSchedule`), 루틴 적용(`applyRoutinesToday`)도 동일하게 정렬

### 구현 방식
```tsx
// save() 래퍼에서 events를 항상 정렬하거나
// upsertEvent 내부에서 sort 적용
const upsertEvent = useCallback((ev: PlanEvent) => {
  const events = (data.events.some(e => e.id === ev.id)
    ? data.events.map(e => e.id === ev.id ? ev : e)
    : [...data.events, ev]
  ).sort((a, b) => a.start.localeCompare(b.start))  // ← 추가
  save({ ...data, events })
}, [data, save])
```

- `applyAiSchedule`, `applyRoutinesToday`, `changeDate` 내부 `save()` 호출에도 동일 정렬 적용

---

## 3. 타임라인 줌 레벨 조정

### 목표
- 헤더에 확대(+) / 축소(-) 버튼 또는 슬라이더
- `HOUR_PX` 를 동적으로 변경 (32 / 48 / 64 / 96px, 기본 64)
- `settingsStore.plannerZoom` 으로 전역 영속 저장

### 구현 방식
```ts
// settingsStore.ts에 추가
plannerZoom: number   // 기본 64 (px/hour)
setPlannerZoom: (z: number) => void
```

```tsx
// DayPlannerBlock.tsx
const plannerZoom = useSettingsStore(s => s.plannerZoom)
// HOUR_PX 상수 제거 → plannerZoom 사용
const HOUR_PX = plannerZoom  // 32 | 48 | 64 | 96
```

```tsx
// 헤더 버튼
const ZOOM_STEPS = [32, 48, 64, 96]
<button onClick={() => setPlannerZoom(prev - step)}>-</button>
<span>{plannerZoom}px</span>
<button onClick={() => setPlannerZoom(next + step)}>+</button>
```

### 설정 탭
- `EditorTab.tsx` → "Day Planner" 섹션에 줌 슬라이더 추가

---

## 4. 미예약(Unscheduled) 이벤트 섹션

### 목표
- `start === ''` 또는 `start === '00:00' && end === '00:00'`인 이벤트를 **미예약** 처리
- 타임라인 하단 또는 이벤트 목록 패널 하단에 별도 섹션으로 표시
- 타임라인에서는 그리드에 배치하지 않음

### 타입 변경
```ts
// types/block.ts (PlanEvent는 DayPlannerBlock에서 export)
// start/end 빈 문자열 허용 — 기존 'HH:MM' 검증 완화
```

### 이벤트 목록 패널 변경
```tsx
// 예약/미예약 분리
const scheduled   = data.events.filter(e => e.start && e.start !== '00:00')
const unscheduled = data.events.filter(e => !e.start || e.start === '00:00')

// 미예약 섹션
{unscheduled.length > 0 && (
  <div className="border-t border-dashed border-gray-200 mt-2 pt-2">
    <span className="text-[10px] text-gray-400 px-3">미예약</span>
    {unscheduled.map(ev => <EventRow ev={ev} />)}
  </div>
)}
```

### 새 이벤트 폼에 "시간 미지정" 체크박스 추가

---

## 5. 주간 시작 요일 설정

### 목표
- 현재 `WeekPlannerBlock`은 월요일 고정 (`mondayOf()`)
- `settingsStore.weekStartDay` 로 0(일)~6(토) 설정 가능
- 기본값: 1 (월요일)

### 구현 방식
```ts
// settingsStore.ts
weekStartDay: number  // 0=일, 1=월(기본), 6=토
setWeekStartDay: (d: number) => void
```

```tsx
// WeekPlannerBlock.tsx — mondayOf() → weekStartOf() 로 교체
function weekStartOf(ds: string, startDay: number): string {
  const d = new Date(ds + 'T00:00:00')
  const dow = d.getDay()
  const diff = (dow - startDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return `${d.getFullYear()}-${...}`
}
```

### 설정 탭
- `EditorTab.tsx` → "주간 시작 요일" 드롭다운 (일/월/토)

---

## 6. 데스크탑 알림

### 목표
- 이벤트 시작 N분 전 `Notification` API로 데스크탑 알림
- 기본 5분 전, 설정 가능 (0, 5, 10, 15, 30분)
- 오늘 날짜 이벤트만 적용
- `settingsStore.plannerNotifyBefore` 로 설정

### 구현 방식
```tsx
// DayPlannerBlock.tsx 마운트 시 알림 스케줄링
useEffect(() => {
  if (!plannerNotifyBefore || data.date !== todayStr()) return

  // 권한 요청
  Notification.requestPermission()

  const timers = data.events
    .filter(e => !e.done)
    .map(ev => {
      const startMin = timeToMin(ev.start)
      const nowMin   = new Date().getHours() * 60 + new Date().getMinutes()
      const diffMs   = (startMin - plannerNotifyBefore - nowMin) * 60_000
      if (diffMs <= 0) return null
      return setTimeout(() => {
        new Notification(`📅 ${ev.title}`, {
          body: `${ev.start} 시작 — ${plannerNotifyBefore}분 후`,
          icon: '/favicon.ico',
        })
      }, diffMs)
    })
    .filter(Boolean)

  return () => timers.forEach(t => t && clearTimeout(t))
}, [data.date, data.events, plannerNotifyBefore])
```

### 권한 UI
- 알림 권한 미허용 시 헤더에 노란 경고 뱃지 표시
- 클릭 시 `Notification.requestPermission()` 재시도

---

## 파일별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `DayPlannerBlock.tsx` | hideDone 토글, 정렬, 줌, 미예약 섹션, 알림 |
| `WeekPlannerBlock.tsx` | weekStartOf() 동적 시작 요일 |
| `settingsStore.ts` | plannerZoom, weekStartDay, plannerNotifyBefore 추가 |
| `src/components/settings/tabs/EditorTab.tsx` | 위 3개 설정 UI |
| `src/locales/ko.ts` + `en.ts` | 새 i18n 문자열 |

---

## 개발 순서

```
1. 완료 이벤트 숨기기 (30분)
2. 시간순 자동 정렬 (15분)
3. 타임라인 줌 레벨 (45분)
4. 미예약 이벤트 섹션 (60분)
5. 주간 시작 요일 설정 (45분)
6. 데스크탑 알림 (60분)
```
