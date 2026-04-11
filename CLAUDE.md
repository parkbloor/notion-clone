# 개발 규칙

## 토큰 절약 규칙 (필수 — 모든 작업에 적용)

### 파일 읽기 — 3단계 프로세스 (필수, 위반 시 작업 중단)

**Step 1** FILE_MAP.md로 관련 파일 특정 (이미 컨텍스트에 로딩됨 — 별도 Read 불필요)
**Step 2** Grep으로 대상 함수/컴포넌트 라인 번호 확인
**Step 3** Read는 반드시 `offset`+`limit`으로 해당 범위만 읽기

- **파일 전체 Read 절대 금지** — 위반 시 즉시 중단하고 사용자에게 알릴 것
- 파일명만 언급되면: Grep → 라인 확인 → 해당 범위만 Read
- 라인 번호를 아는 경우: 바로 `offset`+`limit` 사용
- **전체 Read가 불가피한 경우**: 사용자에게 이유 먼저 설명 후 허락 받기

### 작업 완료 후
- 기능 구현 완료 또는 버그 수정 완료 시 → 사용자에게 `/clear` 제안 필수

### 탐색 작업
- "어디 있는지", "어떻게 구현됐는지" 같은 탐색 요청 → `subagent_type: Explore` 사용

---

## 코딩 규칙 (필수)
1. 모든 컴포넌트/함수/CSS: **한국어 주석 필수**
2. 각 함수 옆에 **Python 비교 주석** 추가 (예: `// Python: def foo(): ...`)
3. `className`에 **멀티라인 템플릿 리터럴 금지** → Next.js hydration 에러 발생
4. Tailwind v4: **`@apply` 금지** (`@theme` 사용)

## 기술 스택
- Next.js 14 App Router (`'use client'` 컴포넌트)
- Tiptap v3.20 (StarterKit + 개별 확장)
- Tailwind CSS v4 / Zustand+immer / dnd-kit
- FastAPI (Python) 백엔드 — `backend/`

## 핵심 파일
| 파일 | 역할 |
|------|------|
| `src/app/page.tsx` | 진입점 |
| `src/app/globals.css` | Tiptap 전용 스타일 + 한국어 폰트 |
| `src/store/pageStore.ts` | Zustand 페이지 스토어 |
| `src/store/settingsStore.ts` | 설정 + PluginSettings 스토어 |
| `src/types/block.ts` | 타입 정의 |
| `src/lib/fonts.ts` | FONT_PRESETS 상수 (단일 진실 공급원) |
| `src/components/editor/Editor.tsx` | 블록별 Tiptap 에디터 |
| `src/components/editor/PageEditor.tsx` | 전체 페이지 렌더러 + dnd-kit |
| `src/components/editor/SlashCommand.tsx` | 슬래시 명령어 메뉴 |
| `backend/core.py` | 공유 상수·모델·보안 헬퍼 |
| `backend/main.py` | FastAPI 앱 + 미들웨어 + 라우터 등록 |

## 작업별 연관 파일

| 작업 | 함께 열어야 할 파일 |
|------|------|
| 새 블록 타입 추가 | `types/block.ts` + `Editor.tsx` + `SlashCommand.tsx` + `PageEditor.tsx` |
| 새 설정 항목 추가 | `settingsStore.ts` + `src/components/settings/tabs/해당Tab.tsx` |
| 새 백엔드 라우터 추가 | `backend/main.py` + `backend.spec` + `src/lib/api.ts` |
| 새 플러그인 추가 | `settingsStore.ts`(PluginSettings 키) + `PluginsTab.tsx` + `ShortcutModal.tsx` |
| Tiptap 확장 추가 | `Editor.tsx`(extensions 배열) + `src/extensions/` + `BubbleMenuBar.tsx`(필요시) |
| 슬래시 커맨드 항목 추가 | `SlashCommand.tsx`(COMMANDS 배열) + `Editor.tsx`(핸들러) |
| i18n 문자열 추가 | `src/locales/ko.ts` + `src/locales/en.ts` |
| 사이드바 UI 수정 | `CategorySidebar.tsx` + `page.tsx`(레이아웃) |
| 페이지 헤더/툴바 수정 | `PageEditor.tsx` + `TabBar.tsx` |

## 기능 완료 후 필수
`BLUEPRINT.md` 업데이트:
- 섹션 5: 구현된 기능 ✅ 체크
- 섹션 6: 새 API 표에 추가
- 섹션 3: 새 파일/폴더 구조 반영

## 백엔드 — PyInstaller 규칙
새 라우터 추가 시 `backend.spec` hiddenimports에 `backend.routers.X` 형식으로 반드시 추가.
