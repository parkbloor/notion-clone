# Codex Token-Saving Coding Harness

이 문서는 Codex가 이 저장소에서 코딩할 때 토큰 낭비를 줄이기 위한 작업 하네스입니다.
목표는 파일 전체 읽기와 넓은 탐색을 줄이고, 변경에 필요한 최소 맥락만 정확히 확보하는 것입니다.

---

## 1. 기본 원칙

1. 먼저 `CODEX_MEMORY.md`의 현재 작업 상태와 주의사항을 확인한다.
2. `FILE_MAP.md`에서 관련 영역을 좁힌다.
3. 파일 전체를 바로 읽지 않는다. `rg`로 함수, 컴포넌트, 타입, API 이름의 위치를 먼저 찾는다.
4. 실제 읽기는 필요한 라인 주변만 제한해서 수행한다.
5. 수정은 요청 범위와 직접 관련된 파일에만 한다.
6. 완료 후 `CODEX_MEMORY.md`에 남길 가치가 있는 결정/후속작업만 갱신한다.
7. 변경 파일과 검증 결과만 짧게 보고한다.

---

## 2. 유동 메모리 하네스

`CODEX_MEMORY.md`는 Claude memory처럼 쓰는 저장소 로컬 메모리다. 모델 내부 기억에 의존하지 않고, 다음 세션에서도 같은 맥락을 빠르게 복구하기 위한 얇은 상태 파일로 유지한다.

### 읽는 시점

- 코딩/리팩터/문서 정리 작업을 시작할 때
- 사용자가 "이어서", "아까", "계속"처럼 이전 맥락을 가리킬 때
- 여러 파일을 건드리는 변경 전

### 갱신하는 시점

- 설계 결정이 바뀌었을 때
- 사용자가 선호한 정리 방향이 생겼을 때
- 반복해서 주의해야 할 함정이 발견됐을 때
- 삭제/아카이브/보류 같은 문서 정리 상태가 바뀌었을 때
- 다음 작업자가 바로 이어받아야 할 짧은 TODO가 생겼을 때

### 갱신하지 않는 것

- 일회성 명령 출력
- 긴 로그
- 이미 `BLUEPRINT.md`나 `FILE_MAP.md`에 안정적으로 반영된 상세 구조
- 사용자 비밀, API 키, 개인 토큰, 로컬 절대경로 중 공유할 필요가 없는 값
- 코드 diff 전체

### 작성 규칙

- 각 항목은 한 줄 또는 두 줄로 짧게 쓴다.
- 오래된 항목은 새 항목을 추가하기보다 교체한다.
- "현재", "최근", "다음"처럼 시간에 민감한 말에는 가능한 날짜를 붙인다.
- 작업 메모는 최대 20개 안팎으로 유지한다.

---

## 3. 제외 하네스

`.codexignore`는 코딩 중 기본적으로 읽지 않을 파일/폴더 목록이다. 도구가 ignore 파일을 자동 적용하지 않는 경우, 검색 명령에 아래 제외 옵션을 직접 붙인다.

### 기본 제외 옵션

PowerShell에서 재사용할 짧은 변수:

```powershell
$CodexRgExcludes = @(
  "-g", "!node_modules/**",
  "-g", "!.next/**",
  "-g", "!dist-electron/**",
  "-g", "!dist-backend/**",
  "-g", "!build-backend/**",
  "-g", "!.venv/**",
  "-g", "!vault/**",
  "-g", "!package-lock.json",
  "-g", "!*.tsbuildinfo",
  "-g", "!*.d.ts",
  "-g", "!*.png",
  "-g", "!*.jpg",
  "-g", "!*.jpeg",
  "-g", "!*.gif",
  "-g", "!*.webp",
  "-g", "!*.mp4",
  "-g", "!*.pdf",
  "-g", "!*.zip"
)
rg -n "검색어" @CodexRgExcludes
```

### 제외 예외

아래 파일은 토큰 절약보다 맥락 가치가 커서 필요 시 읽는다.

- `BLUEPRINT.md`
- `FILE_MAP.md`
- `CODEX_HARNESS.md`
- `CODEX_MEMORY.md`
- 요청받은 특정 문서 파일
- 작업 대상 소스 파일과 직접 연결된 `docs/01_*.md` ~ `docs/14_*.md`

### 강제 확인 규칙

- `vault/`, `.env*`, 키 파일은 사용자가 명시하지 않으면 읽지 않는다.
- `node_modules/`, `.next/`, `dist-*`, `.venv/`는 에러 원인 추적에 꼭 필요할 때만 특정 파일명으로 좁혀 읽는다.
- 이미지/폰트/동영상/PDF/ZIP은 텍스트 검색 대상에서 제외한다.

---

## 4. 탐색 하네스

### Step 1. 영역 선택

작업 유형별 시작점:

| 작업 | 먼저 볼 문서/파일 |
|---|---|
| 새 블록 타입 | `FILE_MAP.md` → `src/types/block.ts`, `Editor.tsx`, `SlashCommand.tsx` |
| 에디터 동작 수정 | `docs/06_EditorCore.md` → 관련 컴포넌트 |
| 사이드바 수정 | `docs/07_Sidebar.md` → `CategorySidebar.tsx`, `src/components/sidebar/*` |
| 설정 추가 | `docs/12_Settings.md` → `settingsStore.ts`, 해당 탭 |
| 백엔드 API | `docs/13_Backend.md` → `backend/routers/*.py`, `backend/main.py`, `src/lib/api.ts` |
| 타입/저장 구조 | `docs/03_Types.md` → `src/types/block.ts`, `backend/core.py` |
| 스타일/테마 | `src/app/globals.css`, `src/lib/themeVars.ts`, `settingsStore.ts` |
| Electron 빌드 | `docs/14_Electron.md`, `backend/backend.spec`, `scripts/build-electron.js` |

### Step 2. 위치 검색

PowerShell 예시:

```powershell
rg -n "functionName|ComponentName|typeName|endpoint" src backend
rg -n "BlockType|pluginBlockMap|COMMANDS" src/types/block.ts src/components/editor/SlashCommand.tsx
rg -n "router|include_router|@router" backend
```

### Step 3. 부분 읽기

라인 번호를 찾은 뒤 주변만 읽는다.

```powershell
$lines = Get-Content -Encoding UTF8 path\to\file.tsx
$start = 120
$end = 190
for ($i=$start; $i -le $end; $i++) {
  if ($i -le $lines.Length) { "{0}: {1}" -f $i, $lines[$i-1] }
}
```

읽기 범위 기준:

| 상황 | 권장 범위 |
|---|---|
| 단일 함수 수정 | 함수 시작 20줄 전부터 끝 20줄 뒤 |
| React 컴포넌트 수정 | props/interface + state/hooks + 렌더 대상 부분 |
| 타입 추가 | union/interface 주변 80줄 이내 |
| API 추가 | 해당 라우터 함수 + import 영역 + `main.py` 라우터 등록부 |
| CSS 수정 | 선택자 검색 후 해당 블록만 |

---

## 5. 편집 하네스

편집 전 체크:

- 같은 기능이 이미 구현된 파일이 있는가?
- `settingsStore`, `types`, `api.ts`, `SlashCommand`, `Editor.tsx` 중 연동 누락이 생기지 않는가?
- `className` 멀티라인 템플릿 리터럴을 만들지 않는가?
- Tailwind v4에서 `@apply`를 쓰지 않는가?
- 새 백엔드 라우터라면 `backend/backend.spec` hiddenimports도 필요한가?
- 새 UI 문자열이라면 `src/locales/ko.ts`와 `src/locales/en.ts`가 필요한가?

편집 규칙:

- 수동 편집은 `apply_patch`로 한다.
- 파일 생성은 필요한 최소 파일만 만든다.
- 기존 사용자 변경을 되돌리지 않는다.
- 큰 리팩터는 요청되지 않았으면 하지 않는다.

---

## 6. 검증 하네스

변경 규모별 검증:

| 변경 | 검증 |
|---|---|
| 타입/TSX 변경 | `npm run lint` 또는 해당 파일 TypeScript 오류 확인 |
| 백엔드 라우터 변경 | 관련 FastAPI import/라우터 검색, 가능하면 서버 실행 |
| 저장 구조 변경 | 기존 `vault` 호환성 확인 |
| UI 변경 | dev server + 브라우저 확인 |
| 문서 정리 | 링크/파일명 검색 |

검증 명령은 실패하면 원인만 짧게 보고한다. 네트워크/권한 문제면 승인 요청이 필요한지 판단한다.

---

## 7. 응답 하네스

작업 완료 답변에는 아래만 포함한다.

1. 변경한 파일
2. 핵심 변경 내용
3. 실행한 검증 또는 실행하지 못한 이유
4. `CODEX_MEMORY.md` 갱신 여부
5. 다음에 보면 좋은 문서/후속 정리 1개 이하

불필요한 세부 구현 설명, 긴 코드 복붙, 전체 로그 요약은 피한다.

---

## 8. 이 프로젝트 고정 규칙

- 모든 컴포넌트/함수/CSS에는 한국어 주석을 유지한다.
- 함수 옆 Python 비교 주석 패턴을 유지한다.
- `StarterKit`에 포함된 Link 확장을 중복 import하지 않는다.
- `DndContext`는 hydration 방지를 위해 안정적인 `id`를 부여한다.
- `vault_config.json`은 멀티 볼트 상태(`vaults_root`, `current_vault`)를 관리한다.
- 휴지통은 `_vault_trash/index.json` + 실물 폴더 이동 방식이다.
