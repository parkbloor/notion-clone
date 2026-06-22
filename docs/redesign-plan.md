# UI 리디자인 실행 계획서

> 기반: `app.html` 프로토타입 + `MIGRATION_GUIDE.md`
> 현재 스택: Next.js 16 · React 19 · Tailwind v4 · shadcn/ui 토큰 시스템 · Zustand
> 목표: 따뜻한 오프화이트 + 모스 그린 테마로 전면 교체

> 상태 (2026-06-22): 디자인 토큰, `prose-doc`, 사이드바·탭바, 우측 통합 패널, 하단 상태바, Appearance 설정, 포모도로는 실제 화면 검증을 통과했다. 남은 마무리 항목은 인쇄와 키보드 접근성의 별도 확인이다.

---

## 현황 분석

### 현재 토큰 시스템 vs 새 디자인

| 항목 | 현재 (shadcn) | 새 디자인 |
|---|---|---|
| 배경 변수 | `--background`, `--foreground` | `--color-bg`, `--color-surface`, `--color-sunken` |
| 강조색 | `--primary`, `--accent` | `--color-accent` (#5B7F5A 모스 그린) |
| 텍스트 | `--foreground`, `--muted-foreground` | `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-text-faint` |
| 테마 적용 | `applyThemePreset()` → PRESET_VARS 주입 | 동일 메커니즘 재활용 가능 |

### 핵심 발견
- `settingsStore.ts`의 `applyThemePreset()` / `PRESET_VARS`가 이미 CSS 변수 주입 인프라를 갖춤 → **새 토큰을 기존 인프라에 얹을 수 있음**
- `TabBar.tsx`가 `bg-gray-50` 등 하드코딩 클래스 다수 → 컴포넌트별 교체 필요
- 기존 shadcn `--background` 변수는 유지하되 **새 `--color-*` 변수를 병렬로 추가**하여 점진적 마이그레이션

---

## 마이그레이션 전략

```
Step 1 (기반)  → 토큰 + 폰트 + 공용 클래스         ← 가장 먼저, 가장 중요
Step 2 (레이아웃) → 사이드바 + 탭바 교체
Step 3 (에디터)  → prose 스타일 + 문서 컨테이너
Step 4 (크롬)   → 타이틀바 재구성
Step 5 (패널)   → 우측 패널(TOC/백링크/버전) 통합
Step 6 (위젯)   → 포모도로 플로팅 재배치
Step 7 (바텀바)  → 하단 상태바
Step 8 (설정)   → AppearanceTab + accentColor/bgTone 연동
Step 9 (마무리)  → 줄바꿈 방지 · 포커스링 · 인쇄
```

각 Step은 독립 PR 단위로 머지 가능. Step 1만 머지되어도 앱이 정상 동작.

---

## STEP 1 — 디자인 토큰 + 폰트 + 공용 클래스 **[기반]**

### 1-1. Pretendard 설치

```bash
npm i @fontsource-variable/pretendard
```

`src/app/layout.tsx` 상단에 추가:
```tsx
import "@fontsource-variable/pretendard";
```

### 1-2. `globals.css` — 새 CSS 변수 추가

기존 shadcn `@theme inline` 블록 **아래에** 병렬로 추가 (기존 삭제 금지):

```css
/* ======= 새 디자인 토큰 (warm-moss 테마) ======= */
:root {
  --color-bg:            #FAF7F2;
  --color-surface:       #FFFDF9;
  --color-sunken:        #F3EFE7;
  --color-hover:         rgba(0,0,0,0.035);
  --color-active:        rgba(0,0,0,0.06);

  --color-border:        rgba(0,0,0,0.06);
  --color-border-strong: rgba(0,0,0,0.10);

  --color-text:          #1F1B16;
  --color-text-muted:    #6B6459;
  --color-text-subtle:   #9C9488;
  --color-text-faint:    #C8C0B2;

  --color-accent:        #5B7F5A;
  --color-accent-soft:   #EDF1EC;
  --color-accent-ink:    #3C5A3C;
  --color-warn:          #B8643A;
  --color-warn-soft:     #F6E9DD;
}

html.dark {
  --color-bg:            #17140F;
  --color-surface:       #1D1A14;
  --color-sunken:        #121009;
  --color-hover:         rgba(255,255,255,0.04);
  --color-active:        rgba(255,255,255,0.08);

  --color-border:        rgba(255,255,255,0.07);
  --color-border-strong: rgba(255,255,255,0.12);

  --color-text:          #EEE8DD;
  --color-text-muted:    #9A9182;
  --color-text-subtle:   #6F6759;
  --color-text-faint:    #4A4339;

  --color-accent:        #8BB08A;
  --color-accent-soft:   rgba(139,176,138,0.12);
  --color-accent-ink:    #B6D3B5;
}

html, body {
  background: var(--color-bg);
  color: var(--color-text);
}
body {
  font-family: "Pretendard Variable", Pretendard, var(--font-geist-sans), system-ui, sans-serif;
  font-feature-settings: "ss01","cv01";
  -webkit-font-smoothing: antialiased;
}
```

### 1-3. 공용 유틸리티 클래스 추가 (globals.css 하단)

```css
/* ---- Row (사이드바 항목) ---- */
.row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 6px;
  font-size: 13px; color: var(--color-text);
  cursor: pointer; position: relative; white-space: nowrap;
}
.row:hover { background: var(--color-hover); }
.row.active { background: var(--color-active); font-weight: 600; }
.row.active::before {
  content: ""; position: absolute;
  left: -10px; top: 6px; bottom: 6px;
  width: 2px; border-radius: 2px;
  background: var(--color-accent);
}

/* ---- Chip ---- */
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 999px; font-size: 11.5px;
  background: var(--color-sunken); color: var(--color-text-muted);
  border: 1px solid var(--color-border); white-space: nowrap;
}
.chip.on {
  background: color-mix(in oklab, var(--color-accent) 16%, var(--color-surface));
  color:      color-mix(in oklab, var(--color-accent) 75%, #000);
  border-color: color-mix(in oklab, var(--color-accent) 25%, transparent);
}

/* ---- Label ---- */
.label {
  font-size: 10.5px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--color-text-subtle);
  font-weight: 600; white-space: nowrap;
}

/* ---- KBD 배지 ---- */
.kbd {
  font-family: "JetBrains Mono", var(--font-geist-mono), monospace;
  font-size: 10.5px; padding: 2px 5px;
  border: 1px solid var(--color-border); border-bottom-width: 2px;
  border-radius: 4px; color: var(--color-text-muted);
  background: var(--color-surface);
}

/* ---- 아이콘 버튼 ---- */
.icon-btn {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px; color: var(--color-text-muted); cursor: pointer;
}
.icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

/* ---- 탭 ---- */
.ds-tab {
  display: inline-flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 12px; font-size: 13px;
  color: var(--color-text-muted);
  border-radius: 6px 6px 0 0;
  border: 1px solid transparent; border-bottom: none;
  white-space: nowrap; flex-shrink: 0; cursor: pointer; position: relative;
}
.ds-tab:hover { color: var(--color-text); background: var(--color-hover); }
.ds-tab.active {
  color: var(--color-text); background: var(--color-surface);
  border-color: var(--color-border); font-weight: 600;
}
.ds-tab.active::after {
  content: ""; position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 1px; background: var(--color-surface);
}

/* ---- 포커스 링 ---- */
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 2px solid var(--color-accent); outline-offset: 2px;
}

/* ---- hairline 구분선 ---- */
.hairline { border-color: var(--color-border); }
.hairline-strong { border-color: var(--color-border-strong); }
```

### 1-4. `settingsStore.ts` — warm-moss 프리셋 추가

기존 `PRESET_VARS` 객체에 항목 추가:
```ts
'warm-moss': {
  light: {
    '--color-accent':     '#5B7F5A',
    '--color-accent-ink': '#3C5A3C',
    '--color-accent-soft':'#EDF1EC',
    '--color-bg':         '#FAF7F2',
    '--color-surface':    '#FFFDF9',
    '--color-sunken':     '#F3EFE7',
  },
  dark: {
    '--color-accent':     '#8BB08A',
    '--color-accent-ink': '#B6D3B5',
    '--color-accent-soft':'rgba(139,176,138,0.12)',
    '--color-bg':         '#17140F',
    '--color-surface':    '#1D1A14',
    '--color-sunken':     '#121009',
  },
},
```

**Step 1 완료 기준:**
- [ ] 배경이 `#FAF7F2` 따뜻한 오프화이트로 바뀜
- [ ] 다크모드 토글 즉시 반응
- [ ] 기존 shadcn 컴포넌트 깨지지 않음 (병렬 토큰이므로)

---

## STEP 2 — 사이드바 + 탭바 교체

### 대상 파일
- `src/components/editor/CategorySidebar.tsx`
- `src/components/sidebar/CategoryRow.tsx`
- `src/components/sidebar/DraggablePageRow.tsx`
- `src/components/editor/TabBar.tsx`

### 2-1. CategorySidebar.tsx 구조

```
<aside> (width: 268px, background: var(--color-surface), border-right)
  ├── 검색 인풋 (background: --color-sunken, 12.5px, ⌘P 배지)
  ├── 빠른 액션 행: [새 노트 버튼(accent bg)] + 캘린더 + 그래프 아이콘
  ├── 섹션: 태그 (label + chip 목록)
  ├── 섹션: 즐겨찾기 (label)
  ├── 섹션: 전체 페이지 (label + + 버튼)
  │   └── DraggablePageRow × N  →  .row 클래스 적용
  ├── 섹션: 주기적 노트 (일간/주간/월간 세그먼트)
  └── 푸터: 볼트 이니셜 + 페이지 수·용량 + 휴지통 버튼
```

### 2-2. DraggablePageRow.tsx 핵심 교체

```tsx
// 현재: bg-blue-50, text-blue-600 등 하드코딩
// 교체: .row / .row.active 클래스
<div className={`row ${isCurrent ? "active" : ""}`}>
  <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--color-text-faint)" }} />
  <span className="truncate flex-1" style={{ fontSize: 13 }}>{page.title}</span>
</div>
```

### 2-3. TabBar.tsx 교체

```tsx
// 현재: bg-gray-50, border-gray-200 하드코딩
// 교체: border-b hairline, ds-tab 클래스
<div className="flex items-end gap-0 px-3 pt-2 border-b hairline overflow-x-auto"
     style={{ background: "var(--color-bg)", height: 40, whiteSpace: "nowrap" }}>
  {tabs.map(tab => (
    <div key={tab.id} className={`ds-tab ${activeTab === tab.id ? "active" : ""}`}>
      <span>{tab.icon}</span>
      <span className="truncate">{tab.title}</span>
      {/* 저장 중 dot */}
      {tab.dirty && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-accent)" }} />}
      <X className="w-3 h-3 opacity-50" />
    </div>
  ))}
</div>
```

**Step 2 완료 기준:**
- [ ] 섹션 제목이 uppercase 소문자로 표시
- [ ] 현재 페이지 좌측에 2px accent 바
- [ ] 탭이 가로 스크롤 (줄바꿈 없음)

---

## STEP 3 — 타이포그래피 / 본문 조화

### 대상 파일
- `src/app/globals.css` (prose 규칙 추가)
- `src/components/editor/PageEditor.tsx` (컨테이너 정리)

### 3-1. prose-doc 클래스 (globals.css)

```css
.prose-doc { color: var(--color-text); font-size: 16.5px; line-height: 1.78; }
.prose-doc h1 {
  font-size: 38px; font-weight: 800;
  letter-spacing: -0.022em; line-height: 1.15; margin: 28px 0 14px;
  border-left: none; /* 기존 데코 제거 */
}
.prose-doc h2 { font-size: 23px; font-weight: 700; letter-spacing: -0.015em; margin: 32px 0 10px; }
.prose-doc h3 { font-size: 17px; font-weight: 700; margin: 22px 0 6px; }
.prose-doc p  { margin: 8px 0; }
.prose-doc ul { list-style: disc; padding-left: 1.25rem; }
.prose-doc code {
  font-family: "JetBrains Mono", monospace; font-size: 0.88em;
  padding: 1px 5px; background: var(--color-sunken); border-radius: 4px;
}
```

### 3-2. PageEditor.tsx 컨테이너

```tsx
// 현재: 다양한 max-width 처리 복잡
// 교체: 단일 article 태그로 통일
<article
  className="px-10 pt-4 pb-32 mx-auto prose-doc"
  style={{ maxWidth: editorMaxWidth || 840 }}
>
  <CoverImage />
  <TitleRow />
  <TagsAndProperties />
  <hr className="hairline my-5" />
  {blocks.map(b => <Editor key={b.id} block={b} />)}
</article>
```

**Step 3 완료 기준:**
- [ ] H1이 38px, 좌측 장식바 없음
- [ ] 본문 행간이 한글에서 편안함 (1.78)
- [ ] 인라인 코드가 --color-sunken 배경

---

## STEP 4 — 상단 크롬 (타이틀바 + 탭바 연결)

### 대상 파일
- `src/app/page.tsx` (레이아웃 최상단)
- 필요 시 신규: `src/components/chrome/TitleBar.tsx`

### 변경점
```tsx
// 현재: page.tsx에 인라인으로 titlebar 존재 (추정)
// 신규 TitleBar 구조:
// [● ● ●] [◀ ▶] | [사이드바 토글] | [검색창 center] | [그래프 포커스 다크 설정]
```

- 검색창: 기존 `GlobalSearch` / `CommandPalette` 트리거 재활용 (새로 만들지 않음)
- 다크 토글: 기존 `settingsStore.setTheme()` 연결
- 높이 38px, `border-b hairline`

**Step 4 완료 기준:**
- [ ] ⌘K 전역 단축키가 기존 CommandPalette 오픈
- [ ] 좁은 탭에서 탭이 가로 스크롤 (줄바꿈 없음)

---

## STEP 5 — 우측 패널 통합 (TOC / 백링크 / 버전)

### 대상 파일
- `src/components/editor/TocPanel.tsx`
- `src/components/editor/BacklinkPanel.tsx`
- `src/components/editor/VersionHistoryPanel.tsx`
- 신규: `src/components/editor/RightPanel.tsx` (탭 컨테이너)

### RightPanel 구조

```tsx
// 세 개의 독립 패널을 하나의 탭 컨테이너로 통합
type Tab = "toc" | "backlinks" | "versions";
// width: 240px, xl 이상에서만 표시
// 탭 하단 active 시: 2px solid var(--color-accent)
```

### TOC 스크롤 스파이

```tsx
// 기존 TocPanel의 스크롤 감지 로직 그대로 재활용
// 변경: .toc-item 클래스 사용, active 시 border-left: 2px solid var(--color-accent)
```

**Step 5 완료 기준:**
- [ ] 우측 패널 240px로 통일
- [ ] 탭 전환 시 스크롤 위치 보존
- [ ] xl 미만 브레이크포인트에서 자동 숨김

---

## STEP 6 — 포모도로 플로팅 재배치

### 대상 파일: `src/components/editor/PomodoroWidget.tsx`

### 변경점
```tsx
// 현재: 위치/크기 다양
// 교체:
// position: fixed; right: 16px; bottom: 16px; z-index: 40
// 최소화 시: 44×44 토마토 아이콘만 남기기
// 본문 영역 침범 금지 (margin 없이 fixed 유지)
const [minimized, setMinimized] = useState(false);
```

**Step 6 완료 기준:**
- [ ] 에디터 본문 너비를 침범하지 않음
- [ ] 최소화 상태가 localStorage에 저장됨

---

## STEP 7 — 하단 상태바

### 대상 파일: `src/components/editor/BottomBar.tsx`

```tsx
// 현재: 다양한 컬러 하드코딩
// 교체:
<div className="sticky bottom-0 flex items-center justify-between px-6 py-2 border-t hairline"
     style={{
       background: "color-mix(in oklab, var(--color-bg) 90%, transparent)",
       backdropFilter: "blur(8px)",
       fontSize: 11.5, color: "var(--color-text-subtle)",
       whiteSpace: "nowrap"
     }}>
  {/* 저장 상태 dot + 단어수 + 글자수 */}
  {/* 에디터 너비 range 슬라이더 */}
</div>
```

**Step 7 완료 기준:**
- [ ] 좁은 탭에서 텍스트 줄바꿈 없음
- [ ] backdrop-filter로 스크롤 콘텐츠와 구분

---

## STEP 8 — AppearanceTab + 색상 설정 확장

### 대상 파일
- `src/store/settingsStore.ts` (accentColor, bgTone 필드 추가)
- `src/components/settings/tabs/AppearanceTab.tsx` (UI 추가)
- 신규: `src/lib/applyTheme.ts` (accent/bgTone 적용 헬퍼)

### settingsStore.ts 확장

```ts
// 기존 themePreset 유지, 아래 필드 추가
accentColor: string;   // 기본: '#5B7F5A'
bgTone: 'warm' | 'neutral' | 'cool';  // 기본: 'warm'
setAccentColor: (c: string) => void;
setBgTone: (t: 'warm' | 'neutral' | 'cool') => void;
```

### applyTheme.ts

```ts
export function applyAccent(c: string) {
  document.documentElement.style.setProperty('--color-accent', c);
  // color-mix()가 파생값 계산하므로 추가 처리 불필요
}

export function applyBgTone(t: 'warm' | 'neutral' | 'cool') {
  const map = {
    warm:    { bg: '#FAF7F2', surf: '#FFFDF9', sunk: '#F3EFE7' },
    neutral: { bg: '#F7F7F5', surf: '#FFFFFF', sunk: '#ECECE9' },
    cool:    { bg: '#F4F6F8', surf: '#FFFFFF', sunk: '#E7EBEF' },
  };
  const c = map[t];
  document.documentElement.style.setProperty('--color-bg', c.bg);
  document.documentElement.style.setProperty('--color-surface', c.surf);
  document.documentElement.style.setProperty('--color-sunken', c.sunk);
}
```

### AppearanceTab.tsx UI

```tsx
// 기존 테마 프리셋 섹션 아래에 추가:
// 1) 강조색 5개 원형 버튼 (모스그린/슬레이트/다크/퍼플/레드)
// 2) 배경 톤 세그먼트 (따뜻/중립/쿨)
// 3) page.tsx의 useEffect에서 앱 시작 시 재적용
```

**Step 8 완료 기준:**
- [ ] 강조색 변경 시 chip·active row·버튼·포모도로 진행바 전부 바뀜
- [ ] 새로고침 후에도 유지 (persist 미들웨어)
- [ ] 다크모드에서도 동작

---

## STEP 9 — 마무리

### 9-1. 줄바꿈 방지 (globals.css)
```css
.ds-tab, .chip, .label, .kbd, .prop { white-space: nowrap; }
```

### 9-2. 포커스 링 (이미 Step 1에 포함)

### 9-3. 인쇄 CSS
```css
@media print {
  .icon-btn, .ds-tab, .pom, .kbd, [data-no-print] { display: none !important; }
  .prose-doc { font-size: 11pt; line-height: 1.55; }
}
```

**Step 9 완료 기준:**
- [ ] 700px 너비까지 줄바꿈 이슈 없음
- [ ] Tab 키 순서 접근성 이슈 없음
- [ ] Ctrl+P 출력 미리보기 정상

---

## 작업 순서 요약

```
PR-1:  Step 1 (토큰+폰트+공용 클래스) ← 독립, 언제든 머지 가능
PR-2:  Step 2 (사이드바+탭바)          ← PR-1 머지 후
PR-3:  Step 3 (본문 타이포)            ← PR-1 머지 후 (PR-2와 병행 가능)
PR-4:  Step 4 (타이틀바)               ← PR-2 이후
PR-5:  Step 5 (우측 패널)              ← PR-3 이후
PR-6:  Step 6+7 (포모도로+바텀바)      ← PR-2 이후 (빠른 작업)
PR-7:  Step 8 (AppearanceTab)          ← PR-1 이후 (설정만 건드림)
PR-8:  Step 9 (마무리)                 ← 전체 이후
```

**예상 총 작업 시간: 6~8시간** (클로드와 함께라면 2~3세션)

---

## 주의사항 (현 코드베이스 특이사항)

| 항목 | 주의 |
|---|---|
| `className` 멀티라인 템플릿 리터럴 | **금지** — hydration 에러 발생 |
| Tailwind v4 `@apply` | **금지** — `@theme` 또는 일반 CSS 사용 |
| `color-mix()` | Tailwind v4 환경에서 CSS 네이티브로 사용 가능 (별도 플러그인 불필요) |
| shadcn `--background` 등 기존 토큰 | 삭제 금지 — shadcn 컴포넌트가 의존 중 |
| `applyThemePreset()` | 기존 PRESET_VARS에 warm-moss만 추가, 기존 로직 유지 |
| DndContext id | 고정 id 유지 (hydration 에러 방지) |

---

## 롤백 전략

- Step 1(토큰)만 적용된 상태에서도 기존 컴포넌트 정상 동작 (병렬 토큰)
- 각 PR이 독립적이므로 단계별 revert 가능
- `--color-*` 변수를 쓰지 않는 shadcn 컴포넌트는 영향 없음
