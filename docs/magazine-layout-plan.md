# Magazine Layout 시스템 설계 계획

## 핵심 개념

**원고(Content)와 레이아웃(Form)의 분리**
- 원고 모드: 지금처럼 블록을 위에서 아래로 작성 (단일 진실 소스)
- 레이아웃 모드: AI 또는 템플릿이 블록을 2D 그리드에 배치
- 원고 수정 → 레이아웃 구조 유지, 내용만 반영

---

## 전체 아키텍처

```
원고 모드 (지금과 동일)  ←→  레이아웃 모드 (잡지 렌더러)
         ↓                           ↓
   Content Model              Layout Descriptor
   (블록 배열)                (AI 생성, 사용자 편집)
         └──────────┬──────────────┘
                    ↓
              AI Engine
              (분석 + 배치)
```

---

## Phase 1 — 데이터 모델

```ts
type LayoutDescriptor = {
  id: string
  pageId: string
  gridCols: number        // 기본 12
  gridGap: number         // px
  cells: LayoutCell[]
  theme: LayoutTheme
  createdBy: 'ai' | 'user' | 'template'
  version: number         // undo용
}

type LayoutCell = {
  id: string
  blockId: string         // 원고 블록과 연결 (blockId 참조)
  col: [number, number]   // [colStart, colEnd] 1-based
  row: [number, number]   // [rowStart, rowEnd]
  style: CellStyle
  locked: boolean         // AI 재생성 시 보호
  userEdited: boolean     // true면 AI 재생성 시 건드리지 않음
}

type LayoutTheme = {
  fontPair: string        // 'editorial' | 'modern' | 'classic'
  accentColor: string
  columnGap: number
  baselineGrid: number    // 8px 단위
}
```

---

## Phase 2 — AI 엔진

### 블록 역할 분석 (로컬 룰 기반)

```ts
type BlockRole =
  | 'headline'      // H1
  | 'subheadline'   // H2
  | 'hero_image'    // 첫 번째 or 가장 큰 이미지
  | 'body_text'     // 긴 텍스트 (200자 이상)
  | 'caption'       // 이미지 바로 뒤 짧은 텍스트
  | 'pull_quote'    // blockquote
  | 'data_table'    // 표
  | 'sidebar_text'  // 짧은 텍스트 (200자 미만)
  | 'visual'        // 차트/마인드맵/다이어그램
```

### 템플릿 매칭 규칙

| 콘텐츠 조합 | 추천 템플릿 |
|---|---|
| 이미지 많음 | 갤러리형 / 화보형 |
| 텍스트 중심 | 신문형 / 학술형 |
| 이미지 + 긴 텍스트 | 잡지 스프레드형 |
| 데이터(표/차트) 많음 | 리포트형 |
| 짧은 텍스트들 | 카드형 / 뉴스레터형 |

### Claude API 역할
- 룰 기반으로 해결 안 되는 복잡한 케이스 처리
- 입력: 블록 배열 요약 (타입, 길이, 순서) + 선택 템플릿
- 출력: LayoutDescriptor JSON (JSON Schema로 형식 강제)
- Few-shot 예시 5개 제공으로 품질 확보

---

## Phase 3 — 편집 UX

### 모드 전환
```
[원고 모드]  ── 토글 버튼 ──  [레이아웃 모드]
항상 텍스트/블록 편집 가능    드래그/리사이즈/잠금 편집
```

### 편집 인터랙션
1. **셀 선택**: 클릭 → 파란 테두리
2. **이동**: 드래그 → 빈 셀로 이동 / 스왑
3. **크기 조절**: 셀 경계선 드래그 → col/row span 변경
4. **셀 스타일**: 우클릭 메뉴 → 배경색, 패딩, 잠금
5. **AI 협업**:
   - 🔒 잠금: AI 재생성 시 이 셀 보호
   - ♻️ 이것만 재배치: 선택 셀만 AI 재요청

### 핵심 userEdited 플래그
```
userEdited: true인 셀 → AI 재생성해도 위치/크기 유지
→ AI와 사용자가 자연스럽게 협업
```

---

## Phase 4 — 타이포그래피 & 비주얼

### 폰트 페어링 프리셋
- Editorial: Playfair Display + Source Serif
- Modern: Neue Haas Grotesk + Inter
- Classic: Garamond + Gill Sans

### 이미지 처리
- 블리드: 셀 경계까지 꽉 채우기
- 오버레이 텍스트: 이미지 위에 제목
- 그라디언트 마스크

### 특수 블록
- 풀쿼트: 큰 따옴표 + 강조 폰트
- 드롭캡: 첫 글자 크게
- 8px 베이스라인 그리드 강제

---

## Phase 5 — 출력 / 내보내기

| 화면 보기 | 인쇄/PDF | 공유 |
|---|---|---|
| 반응형 뷰 | A4/Letter 최적화 | 읽기 전용 URL |
| 모바일: 1컬럼 폴백 | 페이지 나누기 제어 | OG 이미지 자동생성 |
| 태블릿: 2컬럼 | CMYK 색상 주의 | |

---

## 개발 순서

| 주차 | 작업 |
|---|---|
| 1주 | 데이터 모델 + 기본 Grid 렌더러 |
| 2주 | 5개 프리셋 템플릿 + 모드 토글 |
| 3주 | 드래그/리사이즈 편집 UI |
| 4주 | 로컬 룰 기반 AI 분석기 |
| 5주 | Claude API 연동 |
| 6주 | 타이포그래피 프리셋 + 이미지 처리 |
| 7주 | PDF 내보내기 |

---

## 핵심 설계 원칙 3가지

1. **원고와 레이아웃 완전 분리** — 원고 데이터 손상 없이 레이아웃만 교체 가능
2. **AI는 초안만, 최종 결정은 사용자** — AI 결과 강제 없음
3. **모바일은 항상 1컬럼 폴백** — 복잡한 레이아웃도 모바일에서 안 깨짐

---

## 관련 파일 (구현 시 참고)

- `src/types/block.ts` — LayoutDescriptor 타입 추가
- `src/store/pageStore.ts` — layoutDescriptor 상태 추가
- `src/components/editor/LayoutSlot.tsx` — Grid 렌더러 기반
- `src/components/editor/TemplateEditorModal.tsx` — 드래그 편집 UI 참고
- `backend/routers/` — AI 레이아웃 생성 API 추가 예정
