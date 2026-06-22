# Codex Memory

## Recent Update

- 2026-06-11: Day Planner 높은 우선순위 정리 완료. `PlannerTimeline` 공용 컴포넌트/유틸을 분리하고, 메인/아카이브 타임라인 중복을 제거했다. `PlanEvent.scheduled?: boolean`을 추가해 미예약 이벤트의 `00:00` 해킹을 없앴고, `plannerEndHour` 설정과 설정 UI/locale을 추가했다. `npx tsc --noEmit`, `npm run lint`는 에러 없이 통과했으며 기존 lint warning은 101개 남아 있다.
- 2026-06-10: `docs/02_Stores.md`를 실제 store/type/helper 파일 기준으로 업데이트했다. `pageStoreHelpers.ts`, `src/types/pageStore.ts`, 블록 선택/토글, 휴지통, 매거진 레이아웃, planner/settings 상태, `math`, `arrowConnect` 플러그인 키를 반영했다.

이 파일은 이 저장소에서 Codex가 다음 작업을 유동적으로 이어가기 위한 로컬 메모리입니다.
세부 설계의 단일 진실 공급원은 `BLUEPRINT.md`와 `FILE_MAP.md`이고, 이 파일은 짧은 작업 상태와 선호를 보관합니다.

---

## 현재 작업 상태

- 2026-06-11: Day Planner 대대적 정리 중. 높은 우선순위는 완료했고, 다음 작업은 중간/낮음 항목부터 이어가면 된다.
  - 중간 1: 드래그/리사이즈 로직을 `PlannerTimeline` 또는 별도 hook으로 더 분리한다. 현재 좌표/preview 상태는 여전히 `DayPlannerBlock.tsx` 내부에 있다.
  - 중간 2: `plannerApi.getArchive/appendArchive` 타입을 `Record<string, PlanEvent[]>`로 좁힌다. 현재는 순환 import 회피로 `unknown[]` 기반이다.
  - 중간 3: 이벤트 저장/회고 저장/아카이브 저장의 JSON 업데이트 로직을 공용 updater로 모아 레이스 방지를 명시화한다.
  - 중간 4: 설정 문구와 동작 의미를 재검토한다. `plannerStartHour`는 이제 초기 스크롤이 아니라 표시 시작 시각이다.
  - 낮음 1: 전체 lint warning 정리. 현재 101개 warning이 남아 있고 DayPlanner 쪽은 `events` 기본값 dependency warning, `clockTick` unused warning이 남아 있다.
  - 낮음 2: 인앱 브라우저 시각 검증. 이번 세션에서는 Node 실행 권한 문제로 Browser 연결이 실패했다.
- 2026-06-10: `.md` 문서 정리 진행 중. 오래된 계획서는 핵심만 `BLUEPRINT.md`에 흡수한 뒤 삭제하는 방향을 사용한다.
- 2026-06-10: `PROJECT_STATUS.md` 삭제 완료. 오래된 2026-02-20 기준 상태 문서라 현재 구조와 충돌했다.
- 2026-06-10: `MULTI_VAULT_PLAN.md` 삭제 완료. 핵심은 `BLUEPRINT.md`의 `4-3-1. 멀티 볼트 구조`로 흡수했다.
- 2026-06-10: `TRASH_REFACTOR_PLAN.md` 삭제 완료. 핵심은 `BLUEPRINT.md`의 `휴지통 저장 방식`으로 흡수했다.
- 2026-06-10: `CODEX_HARNESS.md` 생성. 토큰 절약형 탐색/편집/검증 하네스로 사용한다.
- 2026-06-10: `.codexignore` 생성. Codex 기본 탐색에서 의존성, 빌드 산출물, 개인 vault, 바이너리를 제외한다.
- 2026-06-10: Python 격리는 `uv + .venv` 방식으로 복구했다. 기존 깨진 `.venv`는 `.venv_broken_20260610_184816`으로 백업했고, 새 `.venv`는 uv 관리 CPython 3.14.5 기반이다.
- 2026-06-10: `docs/01_EntryPoints.md`를 실제 `layout.tsx`, `page.tsx`, `globals.css` 기준으로 업데이트했다. KaTeX CSS, 루틴 로드, 세션 저장/복원, 저장 flush, `Ctrl+\`, 새 `--color-*` 토큰을 반영했다.

---

## 사용자 선호

- 문서 정리는 바로 삭제하기보다, 필요한 핵심을 `BLUEPRINT.md`에 남기고 원본 계획서를 제거하는 방식을 선호한다.
- 코딩 시 토큰 낭비를 줄이는 절차적 하네스를 원한다.
- 한국어로 짧고 실용적인 판단을 선호한다.

---

## 프로젝트 고정 기억

- `BLUEPRINT.md`와 `FILE_MAP.md`가 현재 구조 문서의 중심이다.
- 멀티 볼트는 `vault_config.json`의 `vaults_root`, `current_vault` 기반이다.
- 휴지통은 `_vault_trash/index.json`과 실물 폴더 이동 방식이다.
- 개발 규칙상 한국어 주석, Python 비교 주석, `className` 멀티라인 금지, Tailwind `@apply` 금지가 중요하다.

---

## 문서 정리 큐

- `README.md`: 실행 방법과 기술 스택이 현재 `npm run dev` / Next 16 / Electron 구조와 맞는지 나중에 업데이트 필요.
- `CLAUDE.md`: Claude 전용 규칙이라 Codex 하네스와 중복된다. Claude를 계속 쓰지 않으면 핵심만 `CODEX_HARNESS.md`에 남기고 삭제 후보.
- `docs/magazine-layout-plan.md`: MagazineGrid/API 구현 완료 흔적 있음. 삭제/아카이브 후보.
- `docs/redesign-plan.md`: 최근 untracked 문서이며 `TweaksPanel.tsx`와 함께 진행 중일 수 있어 보류.

---

## 반복 주의사항

- `git status`에 사용자/기존 변경이 많다. 요청받은 문서 외 코드 변경은 건드리지 않는다.
- PowerShell에서 전체 파일 재귀 검색은 `node_modules`, `.next`, `.venv`, `dist-*`를 제외하지 않으면 출력이 과해진다.
- 검색/읽기 전 `.codexignore`와 `CODEX_HARNESS.md`의 제외 하네스를 적용한다.
- 문서 삭제 전에는 `BLUEPRINT.md` 또는 `FILE_MAP.md`에 핵심이 남아 있는지 먼저 확인한다.
- PowerShell에서 `npm`은 실행 정책 때문에 막힐 수 있으므로 `npm.cmd`를 사용한다.
