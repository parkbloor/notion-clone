# 다국어(i18n) 지원 기획서

> 작성일: 2026-03-27
> 대상: Notion Clone 전체 UI 텍스트
> 지원 언어 (Phase 1): 한국어(ko) · 영어(en)
> 방식: 라이브러리 없음, TypeScript 타입 강제 + `settingsStore.locale` 런타임 전환

---

## 1. 목표

- 모든 UI 문자열을 `src/locales/` 중앙 파일에서 관리
- `en.ts`가 `ko.ts`의 타입을 구현하도록 강제 → **번역 누락 시 컴파일 에러**
- 설정 화면에서 언어 전환 → 앱 재시작 없이 즉시 반영
- Electron 데스크탑 환경 완벽 호환 (URL routing 없음, 순수 상태 기반)

---

## 2. 파일 구조

```
src/
  locales/
    ko.ts          ← 기준 파일 (타입 정의 겸용, 기본 언어)
    en.ts          ← 영어 번역 (Locale 타입 구현 강제)
    index.ts       ← useLocale() 훅 + getLocale() 유틸 export
```

---

## 3. 타입 시스템 설계

### 3-1. `ko.ts` 전체 키 구조

```ts
export const ko = {

  // ── 공통 ──────────────────────────────────────────────
  common: {
    save: '저장',
    cancel: '취소',
    delete: '삭제',
    edit: '편집',
    confirm: '확인',
    close: '닫기',
    add: '추가',
    create: '생성',
    copy: '복사',
    copied: '복사됨',
    rename: '이름 변경',
    move: '이동',
    restore: '복원',
    search: '검색',
    loading: '불러오는 중...',
    error: '오류가 발생했습니다',
    success: '완료',
    apply: '✓ 적용',
    preview: '미리보기',
    untitled: '제목 없음',
    noResults: '결과 없음',
  },

  // ── 사이드바 ────────────────────────────────────────────
  sidebar: {
    newPage: '새 페이지',
    newFolder: '새 폴더',
    searchPlaceholder: '페이지 검색...',
    uncategorized: '미분류',
    calendar: '달력',
    recentFiles: '최근 파일',
    collapseAll: '모두 접기',
    expandAll: '모두 펼치기',
    addPageInFolder: '폴더에 페이지 추가',
    folderNamePlaceholder: '폴더 이름',
  },

  // ── 에디터 ──────────────────────────────────────────────
  editor: {
    placeholder: '\'/\'로 명령어 입력...',
    dragHandle: '드래그하여 블록 이동',
    addBlockAbove: '위에 블록 추가',
    addBlockBelow: '아래에 블록 추가',
    duplicateBlock: '블록 복제',
    deleteBlock: '블록 삭제',
    turnInto: '다음으로 변환',
    readMode: '읽기 모드',
    editMode: '편집 모드',
    lockPage: '페이지 잠금',
    unlockPage: '잠금 해제',
  },

  // ── 슬래시 커맨드 ────────────────────────────────────────
  slash: {
    groupText: '텍스트',
    groupMedia: '미디어',
    groupData: '데이터',
    groupAdvanced: '고급',

    paragraph: { label: '텍스트', desc: '일반 텍스트 블록' },
    heading1:  { label: '제목 1', desc: '대형 제목' },
    heading2:  { label: '제목 2', desc: '중형 제목' },
    heading3:  { label: '제목 3', desc: '소형 제목' },
    heading4:  { label: '제목 4', desc: '소제목 4단계' },
    heading5:  { label: '제목 5', desc: '소제목 5단계' },
    heading6:  { label: '제목 6', desc: '소제목 6단계' },
    bulletList:    { label: '글머리 기호', desc: '점 목록' },
    orderedList:   { label: '번호 목록', desc: '순서 있는 목록' },
    taskList:      { label: '체크리스트', desc: '할 일 목록' },
    blockquote:    { label: '인용구', desc: '들여쓰기 인용문' },
    codeBlock:     { label: '코드', desc: '구문 강조 코드 블록' },
    divider:       { label: '구분선', desc: '수평 구분선' },
    image:         { label: '이미지', desc: '이미지 업로드' },
    video:         { label: '동영상', desc: '동영상 업로드' },
    file:          { label: '파일', desc: '파일 첨부' },
    embed:         { label: '임베드', desc: 'YouTube · iframe 삽입' },
    math:          { label: '수식', desc: 'KaTeX 블록 수식' },
    toggle:        { label: '토글', desc: '접기/펼치기 블록' },
    toc:           { label: '목차', desc: '페이지 내 목차 자동 생성' },
    table:         { label: '표', desc: '행/열 테이블' },
    admonition:    { label: '콜아웃', desc: '정보/경고/팁 강조 박스' },
    kanban:        { label: '칸반', desc: '드래그앤드롭 칸반 보드' },
    chart:         { label: '차트', desc: 'Bar / Line / Pie 차트' },
    gantt:         { label: '간트 차트', desc: '프로젝트 타임라인' },
    mindmap:       { label: '마인드맵', desc: 'AI 마인드맵 생성' },
    mermaid:       { label: '다이어그램', desc: 'Mermaid 플로우차트' },
    excalidraw:    { label: '손그림', desc: 'Excalidraw 화이트보드' },
    canvas:        { label: '캔버스', desc: '무한 캔버스' },
    layout:        { label: '레이아웃', desc: '다단 레이아웃' },
    dayPlanner:    { label: '일간 플래너', desc: '하루 일정 관리' },
    weeklyPlanner: { label: '주간 플래너', desc: '한 주 일정 + 날씨' },
    monthly:       { label: '월간 달력', desc: '월간 메모 달력' },
    quarterly:     { label: '분기 플래너', desc: 'OKR 분기 목표 관리' },
    yearly:        { label: '연간 플래너', desc: '연간 목표 히트맵' },
    routineMatrix: { label: '루틴 매트릭스', desc: '요일×시간 루틴 격자' },
  },

  // ── 설정 모달 ────────────────────────────────────────────
  settings: {
    title: '설정',
    tabs: {
      appearance: '모양',
      editor: '편집기',
      plugins: '플러그인',
      ai: 'AI',
      data: '데이터',
      storage: '저장소',
      templates: '템플릿',
      debug: '디버그',
    },
    appearance: {
      themeMode: '밝기 모드',
      light: '라이트',
      dark: '다크',
      system: '시스템',
      colorTheme: '색상 테마',
      language: '언어',
    },
    editor: {
      font: '글꼴',
      fontSize: '기본 크기',
      lineHeight: '줄 간격',
      maxWidth: '본문 최대 너비',
      weatherLocation: '날씨 위치',
      weatherPlaceholder: '도시명 입력 (예: Seoul)',
      weatherSave: '저장',
    },
    plugins: {
      searchPlaceholder: '플러그인 검색...',
      enabled: '활성화',
      disabled: '비활성화',
      noResults: '검색 결과 없음',
    },
    ai: {
      provider: '제공자',
      model: '모델',
      apiKey: 'API 키',
      apiKeyPlaceholder: 'API 키 입력...',
      ollamaUrl: 'Ollama 서버 URL',
      testConnection: '연결 테스트',
      testSuccess: '연결 성공',
      testFail: '연결 실패',
    },
    data: {
      exportJson: 'JSON 백업 다운로드',
      exportMarkdown: '마크다운 ZIP 다운로드',
      importJson: 'JSON 백업 복구',
      importSuccess: '가져오기 완료',
      importFail: '가져오기 실패',
      importConfirm: '현재 데이터를 덮어씁니다. 계속하시겠습니까?',
    },
    storage: {
      currentPath: '현재 Vault 경로',
      changePath: '경로 변경',
      moveData: '데이터 이동',
      changeSuccess: '경로가 변경되었습니다',
      restartRequired: '앱을 재시작해야 적용됩니다',
      totalPages: '총 페이지',
      totalSize: '총 크기',
    },
    templates: {
      new: '새 템플릿',
      namePlaceholder: '템플릿 이름',
      descPlaceholder: '설명 (선택)',
      contentPlaceholder: '내용을 입력하세요...',
      deleteConfirm: '템플릿을 삭제하시겠습니까?',
    },
    debug: {
      refresh: '새로고침',
      copyAll: '전체 복사',
      copied: '복사됨',
      noLogs: '로그 없음',
    },
  },

  // ── 플러그인 이름/설명 ────────────────────────────────────
  plugins: {
    kanban:          { name: '칸반 보드', desc: '드래그앤드롭 칸반 보드 블록을 활성화합니다.' },
    calendar:        { name: '달력', desc: '사이드바에 소형 달력 위젯을 표시합니다.' },
    admonition:      { name: '콜아웃 블록', desc: '정보·경고·팁 강조 박스 블록을 활성화합니다.' },
    excalidraw:      { name: 'Excalidraw', desc: '손그림 화이트보드 블록을 활성화합니다.' },
    recentFiles:     { name: '최근 파일', desc: '사이드바에 최근 수정 파일 목록을 표시합니다.' },
    quickAdd:        { name: '빠른 메모', desc: 'Ctrl+Alt+N 으로 빠른 메모 창을 열 수 있습니다.' },
    wordCount:       { name: '단어 수', desc: '에디터 하단에 단어 및 글자 수를 표시합니다.' },
    focusMode:       { name: '집중 모드', desc: '사이드바와 도구 모음을 숨겨 글쓰기에 집중합니다.' },
    pomodoro:        { name: '포모도로', desc: '25분 집중 / 5분 휴식 타이머 위젯을 표시합니다.' },
    tableOfContents: { name: '목차 패널', desc: '오른쪽에 페이지 목차 패널을 표시합니다.' },
    periodicNotes:   { name: '주기적 노트', desc: '일간 · 주간 · 월간 노트 패널을 사이드바에 추가합니다.' },
    canvas:          { name: '캔버스', desc: '무한 캔버스 블록을 활성화합니다.' },
    videoAutoplay:   { name: '동영상 자동재생', desc: '동영상 블록이 화면에 보일 때 자동으로 재생됩니다.' },
    videoLoop:       { name: '동영상 반복', desc: '동영상 블록이 끝나면 처음부터 다시 재생됩니다.' },
    layoutEnabled:   { name: '레이아웃 블록', desc: '다단 레이아웃 블록을 활성화합니다.' },
    backlinks:       { name: '백링크', desc: '페이지 하단에 역참조 링크 목록을 표시합니다.' },
    chart:           { name: '차트', desc: 'Bar · Line · Pie 차트 블록을 활성화합니다.' },
    gantt:           { name: '간트 차트', desc: '프로젝트 타임라인 블록을 활성화합니다.' },
    mindmap:         { name: '마인드맵', desc: 'AI 마인드맵 블록을 활성화합니다.' },
  },

  // ── 페이지/커버 ──────────────────────────────────────────
  page: {
    untitled: '제목 없음',
    addCover: '커버 추가',
    changeCover: '커버 변경',
    removeCover: '커버 제거',
    addIcon: '아이콘 추가',
    changeIcon: '아이콘 변경',
    properties: '속성',
    addProperty: '속성 추가',
    versions: '버전 히스토리',
    lock: '페이지 잠금',
    unlock: '잠금 해제',
    lockPlaceholder: 'PIN 4자리 입력',
    lockConfirm: '잠금 설정',
    unlockConfirm: '잠금 해제',
    lockError: 'PIN이 올바르지 않습니다',
  },

  // ── 커버 피커 ──────────────────────────────────────────────
  cover: {
    tab: {
      gradient: '그라디언트',
      solid: '단색',
      image: '이미지 업로드',
      unsplash: 'Unsplash',
    },
    uploadBtn: '이미지 업로드',
  },

  // ── 컨텍스트 메뉴 ────────────────────────────────────────
  contextMenu: {
    addAbove: '위에 블록 추가',
    addBelow: '아래에 블록 추가',
    duplicate: '복제',
    delete: '삭제',
    turnInto: '다음으로 변환',
    copyLink: '블록 링크 복사',
  },

  // ── 블록 내부 UI ─────────────────────────────────────────
  blocks: {
    image: {
      uploadPlaceholder: '클릭하여 이미지 업로드',
      captionPlaceholder: '캡션 입력...',
      uploading: '업로드 중...',
      error: '이미지 업로드 실패',
    },
    video: {
      uploadPlaceholder: '클릭하여 동영상 업로드',
      uploading: '업로드 중...',
      error: '동영상 업로드 실패',
    },
    file: {
      uploadPlaceholder: '클릭하여 파일 첨부',
      uploading: '업로드 중...',
      download: '다운로드',
      error: '파일 업로드 실패',
    },
    embed: {
      placeholder: 'YouTube URL 또는 iframe src 입력...',
      apply: '적용',
      invalidUrl: '유효하지 않은 URL입니다',
    },
    code: {
      copyCode: '코드 복사',
      copied: '복사됨',
      languagePlaceholder: '언어 선택...',
    },
    math: {
      placeholder: 'LaTeX 수식 입력...',
      edit: '편집',
      preview: '미리보기',
    },
    toggle: {
      headerPlaceholder: '토글 제목...',
      bodyPlaceholder: '내용 입력...',
    },
    admonition: {
      placeholder: '내용 입력...',
      types: {
        info: '정보',
        warning: '경고',
        error: '오류',
        tip: '팁',
        note: '메모',
        success: '성공',
      },
    },
    kanban: {
      addCard: '카드 추가',
      addColumn: '컬럼 추가',
      cardPlaceholder: '카드 제목...',
      columnPlaceholder: '컬럼 이름...',
      deleteColumn: '컬럼 삭제',
      deleteCard: '카드 삭제',
    },
    chart: {
      tabEdit: '편집',
      tabPreview: '미리보기',
      addSeries: '시리즈 추가',
      deleteSeries: '삭제',
      labelPlaceholder: '레이블...',
      valuePlaceholder: '값...',
      chartType: {
        bar: '막대',
        line: '선',
        pie: '파이',
      },
      aiPanel: {
        title: '차트 AI',
        emptyHint: '차트 데이터를 설명하면 자동으로 생성합니다',
      },
    },
    gantt: {
      addTask: '작업 추가',
      taskPlaceholder: '작업 이름...',
      startDate: '시작일',
      endDate: '종료일',
      progress: '진행률',
      today: '오늘',
    },
    mindmap: {
      rootPlaceholder: '중심 주제...',
      nodePlaceholder: '주제...',
      addChild: '자식 노드 추가',
      deleteNode: '노드 삭제',
      aiExpand: 'AI로 확장',
      aiPanel: {
        title: '마인드맵 AI',
        emptyHint: '마인드맵 주제를 입력하면 자동으로 생성합니다',
      },
    },
    mermaid: {
      placeholder: 'Mermaid 다이어그램 코드 입력...',
      renderError: '다이어그램 렌더링 실패',
    },
    canvas: {
      addNode: '노드 추가',
      deleteNode: '노드 삭제',
      addEdge: '연결선 추가',
      zoomIn: '확대',
      zoomOut: '축소',
      resetView: '뷰 초기화',
      lockMode: '잠금 모드',
    },
    layout: {
      selectTemplate: '레이아웃 선택',
      deleteLayout: '레이아웃 삭제',
      confirmDelete: '레이아웃과 내부 블록을 모두 삭제합니다. 계속하시겠습니까?',
    },
    toc: {
      title: '목차',
      empty: '제목 블록이 없습니다',
    },
  },

  // ── 플래너 블록 ──────────────────────────────────────────
  planner: {
    day: {
      title: '일간 플래너',
      addEvent: '일정 추가',
      eventPlaceholder: '일정 제목...',
      noEvents: '일정 없음',
      aiPanel: {
        title: '일정 AI',
        emptyHint: '오늘 할 일을 입력하면 일정을 자동으로 생성합니다',
      },
    },
    week: {
      title: '주간 플래너',
      days: ['월', '화', '수', '목', '금', '토', '일'],
      weather: {
        loading: '날씨 불러오는 중...',
        error: '날씨 정보 없음',
        noLocation: '설정에서 위치를 입력하세요',
      },
    },
    monthly: {
      title: '월간 달력',
      memoPlaceholder: '메모 입력...',
      createDailyNote: '일간 노트 생성',
    },
    quarterly: {
      title: '분기 플래너',
      objective: '목표',
      keyResult: '핵심 결과',
      addObjective: '목표 추가',
      addKeyResult: '핵심 결과 추가',
      quarters: ['1분기', '2분기', '3분기', '4분기'],
    },
    yearly: {
      title: '연간 플래너',
      addGoal: '목표 추가',
      goalPlaceholder: '목표 입력...',
      categories: ['건강', '커리어', '재정', '관계', '자기계발'],
    },
    routine: {
      title: '루틴 매트릭스',
      noData: '루틴 데이터 없음',
    },
  },

  // ── 오버레이 / 패널 ──────────────────────────────────────
  overlay: {
    trash: {
      title: '휴지통',
      empty: '휴지통이 비어 있습니다',
      emptyAll: '전체 비우기',
      restore: '복원',
      permanentDelete: '영구 삭제',
      confirmEmptyAll: '휴지통을 비우면 복구할 수 없습니다. 계속하시겠습니까?',
      confirmDelete: '영구 삭제하면 복구할 수 없습니다. 계속하시겠습니까?',
      expires: '일 후 만료',
    },
    history: {
      title: '버전 히스토리',
      empty: '저장된 버전 없음',
      restore: '이 버전으로 복원',
      preview: '미리보기',
      current: '현재',
      confirmRestore: '현재 내용이 이 버전으로 대체됩니다. 계속하시겠습니까?',
    },
    periodic: {
      title: '주기적 노트',
      tabDaily: '일간',
      tabWeekly: '주간',
      tabMonthly: '월간',
      createNote: '노트 생성',
      openNote: '노트 열기',
      noNote: '노트 없음',
      weekLabel: '주',
    },
    shortcuts: {
      title: '단축키 안내',
      tabShortcuts: '단축키',
      tabSlash: '슬래시 커맨드',
      tabPlugins: '플러그인',
    },
    newPage: {
      title: '새 페이지',
      namePlaceholder: '페이지 이름...',
      selectTemplate: '템플릿 선택',
      blank: '빈 페이지',
      create: '생성',
    },
    quickAdd: {
      title: '빠른 메모',
      titlePlaceholder: '제목 (선택)...',
      contentPlaceholder: '내용 입력...',
      save: '저장',
    },
    commandPalette: {
      placeholder: '페이지 검색 또는 명령 입력...',
      noResults: '결과 없음',
      recentPages: '최근 페이지',
      actions: '빠른 액션',
    },
    findReplace: {
      findPlaceholder: '찾기...',
      replacePlaceholder: '바꾸기...',
      replaceOne: '하나 바꾸기',
      replaceAll: '모두 바꾸기',
      caseSensitive: '대소문자 구분',
      prev: '이전',
      next: '다음',
      noMatch: '일치하는 항목 없음',
    },
    graph: {
      title: '그래프 뷰',
      nodes: '노드',
      edges: '연결',
    },
    database: {
      title: '데이터베이스',
      addPage: '페이지 추가',
      filter: '필터',
      sort: '정렬',
      noPages: '페이지 없음',
    },
    backlinks: {
      title: '백링크',
      empty: '이 페이지를 참조하는 페이지가 없습니다',
    },
  },

  // ── AI 패널 (전역) ───────────────────────────────────────
  ai: {
    send: '전송',
    inputPlaceholder: '메시지 입력...',
    thinking: 'AI가 생각 중...',
    error: 'AI 응답 오류',
    noApiKey: 'AI 설정에서 API 키를 입력하세요',
    apply: '✓ 적용',
    applied: '적용됨',
    clear: '대화 초기화',
    global: {
      title: 'AI 어시스턴트',
      emptyHint: '무엇이든 물어보세요',
    },
  },

  // ── 포모도로 위젯 ─────────────────────────────────────────
  pomodoro: {
    work: '집중',
    break: '휴식',
    start: '시작',
    pause: '일시정지',
    reset: '초기화',
    completed: '완료',
    sessions: '세션',
  },

  // ── 단어 수 바 ───────────────────────────────────────────
  wordCount: {
    words: '단어',
    chars: '글자',
  },

} as const

export type Locale = typeof ko
```

---

## 4. `settingsStore` 변경사항

```ts
// 추가할 필드
locale: 'ko' | 'en'
setLocale: (locale: 'ko' | 'en') => void

// persist 키는 기존 'notion-clone-settings' 그대로 사용 (하위 호환)
// 기본값: 'ko'
```

---

## 5. `useLocale()` 훅 설계

```ts
// src/locales/index.ts

import { ko } from './ko'
import { en } from './en'
import { useSettingsStore } from '@/store/settingsStore'

export type { Locale } from './ko'

const LOCALES = { ko, en } as const

// ── React 컴포넌트 내부용 (반응형) ──────────────────────
// settingsStore가 바뀌면 리렌더링됨
export function useLocale() {
  const locale = useSettingsStore(s => s.locale)
  return LOCALES[locale] ?? ko
}

// ── 컴포넌트 외부용 (상수 배열 초기화 등) ───────────────
// 슬래시 커맨드 목록처럼 함수 파라미터로 받는 경우
// export type LocaleDict = typeof ko
```

---

## 6. 컴포넌트 외부 상수 처리 패턴

슬래시 커맨드, 플러그인 목록처럼 모듈 레벨에서 배열/객체로 선언된 것들은
**함수로 전환**합니다:

```ts
// Before (SlashCommand.tsx)
const COMMANDS = [
  { type: 'heading1', label: '제목 1', desc: '대형 제목' },
  ...
]

// After
function getCommands(t: Locale) {
  return [
    { type: 'heading1', label: t.slash.heading1.label, desc: t.slash.heading1.desc },
    ...
  ]
}

// 사용처
const t = useLocale()
const commands = useMemo(() => getCommands(t), [t])
```

---

## 7. 설정 화면 언어 선택 UI

`AppearanceTab.tsx`에 언어 선택 추가:

```tsx
// 위치: 밝기 모드 섹션 아래
const LANGUAGE_OPTIONS = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
]
```

---

## 8. 단계별 작업 계획

### Phase 0 — 뼈대 (선행 필수)
- [ ] `src/locales/ko.ts` 생성 (위 3-1의 전체 키 구조)
- [ ] `src/locales/en.ts` 생성 (`Locale` 타입 구현, 영어 번역)
- [ ] `src/locales/index.ts` 생성 (`useLocale`, `Locale` export)
- [ ] `settingsStore.ts`에 `locale`, `setLocale` 추가
- [ ] `AppearanceTab.tsx`에 언어 선택 UI 추가

### Phase 1 — 고빈도 UI (사용자 체감 높음)
- [ ] `CategorySidebar.tsx`
- [ ] `CommandPalette.tsx`
- [ ] `SlashCommand.tsx`
- [ ] `SettingsModal.tsx` + 모든 탭 (`settings/tabs/*.tsx`)
- [ ] `ShortcutModal.tsx`
- [ ] `NewPageDialog.tsx`

### Phase 2 — 오버레이 / 패널
- [ ] `TrashPanel.tsx`
- [ ] `VersionHistoryPanel.tsx`
- [ ] `PeriodicNotesPanel.tsx`
- [ ] `PropertyPanel.tsx`
- [ ] `DatabaseView.tsx`
- [ ] `FindReplacePanel.tsx`
- [ ] `QuickAddModal.tsx`
- [ ] `BacklinkPanel.tsx`
- [ ] `LockModal.tsx`

### Phase 3 — 블록 내부 UI
- [ ] `ImageBlock.tsx`, `VideoBlock.tsx`, `FileBlock.tsx`, `EmbedBlock.tsx`
- [ ] `CodeBlockView.tsx`, `MathBlock.tsx`, `ToggleBlock.tsx`
- [ ] `AdmonitionBlock.tsx`, `KanbanBlock.tsx`
- [ ] `ChartBlock.tsx`, `GanttBlock.tsx`, `MindmapBlock.tsx`
- [ ] `MermaidBlock.tsx`, `CanvasBlock.tsx`, `LayoutBlock.tsx`
- [ ] `TocBlock.tsx`

### Phase 4 — 플래너 블록
- [ ] `DayPlannerBlock.tsx`, `DayPlannerPanel.tsx`
- [ ] `WeeklyPlannerBlock.tsx`, `MonthlyCalendarBlock.tsx`
- [ ] `QuarterlyPlannerBlock.tsx`, `YearlyPlannerBlock.tsx`
- [ ] `RoutineMatrixBlock.tsx`, `CalendarOverlay.tsx`

### Phase 5 — 위젯 / 기타
- [ ] `PomodoroWidget.tsx`
- [ ] `WordCountBar.tsx`
- [ ] `AIChatPanel.tsx`, `GlobalAIChatButton.tsx`
- [ ] `PluginsTab.tsx` 플러그인 이름/설명
- [ ] `ContextMenu.tsx`

---

## 9. 백엔드 처리 방침

FastAPI 에러 메시지는 **이번 범위에서 제외**합니다.
백엔드 응답 메시지를 프론트에서 번역하는 방식은 복잡도가 높고,
현재 에러 메시지는 대부분 개발자용(`400 Bad Request` 등)이라 사용자에게 직접 노출되지 않습니다.
필요 시 별도 Phase로 분리합니다.

---

## 10. 주의사항

| 항목 | 내용 |
|------|------|
| `as const` | `ko.ts`에 반드시 `as const` 붙여야 타입 추론이 정확함 |
| `Locale` 타입 | `en.ts`에서 `ko.ts`의 `Locale` 타입을 명시적으로 구현 — 키 누락 시 빌드 오류 |
| 배열 키 | `planner.week.days` 같은 배열은 인덱스로 접근 (`t.planner.week.days[0]`) |
| 복수형 | 영어는 복수형이 필요한 경우 `words_one`/`words_other` 분기 대신 단순 처리 (Phase 1 범위 이후 필요 시 확장) |
| AI 프롬프트 | `PLANNER_SYSTEM_PROMPT`, `MINDMAP_SYSTEM_PROMPT` 등은 번역하지 않음 (AI는 한국어/영어 모두 이해) |
| `title` 태그 | `document.title` (`PomodoroWidget` 알림 등)도 로케일 적용 필요 |
