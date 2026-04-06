# DayPlanner 리팩터링 계획서

## 배경 / 목적

현재 DayPlannerBlock은 루틴·일정·날짜를 단일 `block.content` JSON에 묶어 저장한다.
이로 인해 HMR, 저장 타이밍, 날짜 이동 등 다양한 상황에서 루틴/일정이 소실된다.
이번 리팩터링으로 **데이터 안정성**과 **장기 보존**을 구조적으로 해결한다.

---

## 현재 구조 (문제)

```
block.content = {
  date:      "2026-04-06",   // 현재 보고 있는 날짜 (1개만 저장)
  events:    [...],          // 해당 날짜 이벤트만
  routines:  [...],          // 루틴 프리셋 — 여기서 소실됨
  autoApply: true
}
```

### 문제점 요약

| 문제 | 원인 |
|------|------|
| 루틴이 사라짐 | block.content와 함께 저장 → HMR·저장 타이밍에 소실 |
| 날짜 이동 시 이전 일정 소멸 | events가 단일 날짜만 보관 |
| 오래된 데이터 무제한 누적 | 정리 로직 없음 |

---

## 목표 구조

```
settingsStore (vault_config.json)
  plannerRoutines:  Routine[]   ← 루틴 프리셋 이동
  plannerAutoApply: boolean     ← autoApply 이동

block.content (block JSON)
  eventsByDate: {
    "2026-04-06": PlanEvent[],
    "2026-04-07": PlanEvent[],
    ...                          ← 최근 90일치만 유지
  }

vault/_planner_archive.json (별도 파일)
  "2025-10-01": PlanEvent[],
  "2025-10-02": PlanEvent[],
  ...                            ← 90일 초과 데이터 읽기 전용 보관
```

---

## 작업 단계

---

### Phase 1 — settingsStore에 루틴 추가

**파일:** `src/store/settingsStore.ts`

추가할 필드:
```ts
plannerRoutines:     Routine[]   // 루틴 프리셋 목록 (기본 [])
plannerAutoApply:    boolean     // 빈 날 이동 시 루틴 자동 적용 (기본 true)
setPlannerRoutines:  (r: Routine[]) => void
setPlannerAutoApply: (v: boolean) => void
```

- `Routine` 타입은 DayPlannerBlock.tsx에서 import (또는 types/block.ts로 이동)
- persist 미들웨어 대상이므로 vault_config.json에 자동 저장됨
- 기본값: `plannerRoutines: [], plannerAutoApply: true`

---

### Phase 2 — block.content 구조 변경

**파일:** `src/components/editor/DayPlannerBlock.tsx`

#### 2-1. 새 데이터 타입 정의

```ts
// 기존
interface PlannerData {
  date:      string
  events:    PlanEvent[]
  routines:  Routine[]
  autoApply: boolean
}

// 변경 후
interface PlannerData {
  eventsByDate: Record<string, PlanEvent[]>  // "YYYY-MM-DD" → events
}
```

#### 2-2. 파싱 로직 변경

```ts
// 기존
const data = useMemo(() => {
  const parsed = JSON.parse(block.content || '{}')
  return { date, events, routines, autoApply }
}, [block.content])

// 변경 후
const data = useMemo(() => {
  try {
    const parsed = JSON.parse(block.content || '{}')
    return {
      eventsByDate: parsed.eventsByDate ?? {}
    }
  } catch {
    return { eventsByDate: {} }
  }
}, [block.content])
```

#### 2-3. 현재 날짜 state 분리

```ts
// 날짜는 로컬 state로 관리 (저장 대상 아님)
const [currentDate, setCurrentDate] = useState(todayStr())

// 현재 날짜 이벤트 접근
const events = data.eventsByDate[currentDate] ?? []
```

#### 2-4. save 함수 변경 + 90일 정리 통합

```ts
const HISTORY_DAYS = 90

const save = useCallback((date: string, events: PlanEvent[]) => {
  // 1. 현재 날짜 이벤트 업데이트
  const next = {
    ...data.eventsByDate,
    [date]: events,
  }

  // 2. 90일 초과 날짜 분리
  const cutoff = (() => {
    const d = new Date()
    d.setDate(d.getDate() - HISTORY_DAYS)
    return d.toISOString().slice(0, 10)
  })()

  const toArchive: Record<string, PlanEvent[]> = {}
  const toKeep:   Record<string, PlanEvent[]> = {}

  for (const [d, evs] of Object.entries(next)) {
    if (d < cutoff) toArchive[d] = evs
    else            toKeep[d]   = evs
  }

  // 3. 아카이브 대상 있으면 백엔드에 append
  if (Object.keys(toArchive).length > 0) {
    api.appendPlannerArchive(toArchive)   // fire-and-forget
  }

  // 4. block.content에는 90일 이내만 저장
  updateBlock(pageId, block.id, JSON.stringify({ eventsByDate: toKeep }))
}, [data, updateBlock, pageId, block.id])
```

#### 2-5. 루틴 관련 코드 수정

- `data.routines` → `plannerRoutines` (settingsStore에서 읽기)
- `data.autoApply` → `plannerAutoApply` (settingsStore에서 읽기)
- `upsertRoutine`, `deleteRoutine` → settingsStore 액션으로 교체
- `save({ ...data, routines })` → `setPlannerRoutines(routines)` 로 교체

---

### Phase 3 — 백엔드 아카이브 API 추가

**신규 파일:** `backend/routers/planner.py`

#### 엔드포인트 2개

```python
# 아카이브 전체 읽기 (열람용)
GET /api/planner/archive
→ { "2025-10-01": [...], "2025-11-15": [...] }

# 아카이브 append 저장 (프론트에서 자동 호출)
POST /api/planner/archive
body: { "2025-10-01": [...events] }
→ 기존 _planner_archive.json에 merge 저장 (기존 키 유지, 새 키 추가)
```

#### 저장 파일 경로

```
{VAULT_DIR}/_planner_archive.json
```

- `assert_inside_vault()` 보안 검사 적용
- 파일 없으면 `{}` 로 초기화
- POST는 기존 데이터에 merge (덮어쓰기 아님)

**`backend/main.py`:** `planner` 라우터 등록  
**`backend.spec`:** `hiddenimports`에 `backend.routers.planner` 추가

#### 프론트 API 클라이언트 (`src/lib/api.ts`)

```ts
appendPlannerArchive: (data: Record<string, PlanEvent[]>) =>
  fetch('/api/planner/archive', { method: 'POST', body: JSON.stringify(data) }),

getPlannerArchive: () =>
  fetch('/api/planner/archive').then(r => r.json()),
```

---

### Phase 4 — 아카이브 열람 UI

**파일:** `src/components/editor/DayPlannerBlock.tsx` (내부 컴포넌트 추가)

#### 트리거

DayPlannerBlock 헤더에 아카이브 아이콘 버튼 1개 추가.
아카이브 데이터가 없으면 버튼 숨김.

#### 모달 구조

```
┌─────────────────────────────────────┐
│  📁 아카이브                    [×] │
│─────────────────────────────────────│
│  ◀ 2025년 10월  ▶                   │
│─────────────────────────────────────│
│  10월 1일 (수)   [이벤트 3개]        │
│  10월 5일 (일)   [이벤트 1개]        │
│  10월 12일 (토)  [이벤트 5개]        │
│─────────────────────────────────────│
│  ┌──────────────────────────────┐   │
│  │  선택된 날짜 타임라인 (읽기 전용)  │
│  │  (기존 타임라인 렌더 재사용)       │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

#### 읽기 전용 보장

- 이벤트 클릭 팝업: 수정/삭제 버튼 없음
- 빈 슬롯 클릭: 이벤트 생성 폼 열지 않음
- `readOnly` prop을 타임라인 렌더 함수에 전달

---

### Phase 5 — i18n 문자열 추가

**파일:** `src/locales/ko.ts`, `src/locales/en.ts`

추가 키:
```ts
// ko.ts
plannerArchive:         '아카이브',
plannerArchiveEmpty:    '보관된 기록이 없습니다',
plannerArchiveReadOnly: '읽기 전용',

// en.ts
plannerArchive:         'Archive',
plannerArchiveEmpty:    'No archived records',
plannerArchiveReadOnly: 'Read only',
```

---

## 구버전 데이터 처리

기존 `block.content`에 `{ date, events, routines, autoApply }` 형식이 있을 수 있음.
**별도 마이그레이션 없음.** 파싱 시 `eventsByDate` 키가 없으면 `{}` 로 초기화.
기존 데이터는 그냥 버림.

---

## 파일 변경 목록

| 파일 | 작업 |
|------|------|
| `src/store/settingsStore.ts` | `plannerRoutines`, `plannerAutoApply` 필드 + setter 추가 |
| `src/components/editor/DayPlannerBlock.tsx` | PlannerData 구조 변경, 루틴 → settingsStore 연결, save 로직 변경, 아카이브 UI 추가 |
| `src/lib/api.ts` | `appendPlannerArchive`, `getPlannerArchive` 추가 |
| `backend/routers/planner.py` | 신규 — GET/POST /api/planner/archive |
| `backend/main.py` | planner 라우터 등록 |
| `backend.spec` | hiddenimports에 `backend.routers.planner` 추가 |
| `src/locales/ko.ts` | 아카이브 관련 문자열 추가 |
| `src/locales/en.ts` | 아카이브 관련 문자열 추가 |

---

## 작업 순서 권장

```
Phase 1 (settingsStore)
  → Phase 2 (block.content 구조 변경) — Phase 1 완료 후
    → Phase 3 (백엔드 API) — Phase 2와 병렬 가능
      → Phase 4 (아카이브 UI) — Phase 3 완료 후
        → Phase 5 (i18n) — Phase 4와 병렬 가능
```

---

## 완료 기준

- [ ] 루틴을 추가하고 코드 수정(HMR) 후에도 루틴이 유지됨
- [ ] 날짜를 앞뒤로 이동해도 각 날짜 이벤트가 독립 보존됨
- [ ] 90일 초과 이벤트가 `_planner_archive.json`으로 자동 이동됨
- [ ] 아카이브 모달에서 과거 날짜 이벤트 열람 가능
- [ ] 아카이브에서 수정/삭제 불가 (읽기 전용)
