// =============================================
// src/types/block.ts
// 역할: 노션 클론에서 사용하는 모든 타입을 정의
// Python으로 치면: dataclass나 TypedDict 정의 파일
// =============================================


// -----------------------------------------------
// 블록 타입 목록
// 노션의 모든 블록 종류를 문자열로 정의
// Python으로 치면: Enum 클래스
// -----------------------------------------------
export type BlockType =
  | 'paragraph'      // 일반 텍스트
  | 'heading1'       // 제목 1 (# )
  | 'heading2'       // 제목 2 (## )
  | 'heading3'       // 제목 3 (### )
  | 'heading4'       // 제목 4 (#### )
  | 'heading5'       // 제목 5 (##### )
  | 'heading6'       // 제목 6 (###### )
  | 'bulletList'     // 글머리 기호 목록
  | 'orderedList'    // 번호 목록
  | 'taskList'       // 체크박스 목록
  | 'toggle'         // 접고 펼치는 토글
  | 'code'           // 코드 블록
  | 'image'          // 이미지
  | 'table'          // 테이블
  | 'divider'        // 구분선
  | 'kanban'         // 칸반 보드
  | 'admonition'    // 콜아웃 (팁/정보/경고/위험)
  | 'canvas'        // 무한 캔버스 (노드 + 엣지 다이어그램)
  | 'excalidraw'   // Excalidraw 손그림 다이어그램
  | 'video'        // 로컬 비디오 파일 (자동재생/반복 지원)
  | 'layout'       // A4 다단 레이아웃 블록 (템플릿 기반 슬롯 배치)
  | 'math'         // LaTeX 수식 블록 (KaTeX 렌더링)
  | 'embed'        // URL 임베드 블록 (YouTube / Vimeo / 일반 iframe)
  | 'mermaid'      // Mermaid 다이어그램 블록 (flowchart / sequence / gantt 등)
  | 'chart'        // 차트 블록 (Bar / Line / Pie — recharts 기반)
  | 'gantt'        // 타임라인/갠트 차트 블록 (태스크 + 날짜 범위 시각화)
  | 'mindmap'      // AI 마인드맵 블록 (방사형 트리 + AI 채팅 통합)
  | 'ai'           // AI 글쓰기 슬래시 커맨드 전용 (실제 블록으로 저장되지 않음 — 슬래시 메뉴에서 패널만 열림)
  | 'toc'          // 인라인 목차 블록 (페이지 내 헤딩 목록 자동 생성)
  | 'file'         // 파일 첨부 블록 (PDF / docx / zip 등 일반 파일)
  | 'dayplanner'       // Day Planner 블록 — 인라인 타임라인 일정표
  | 'weekplanner'      // Week Planner 블록 — 멀티데이 주간 타임라인 그리드
  | 'weeklyplanner'   // Weekly Planner 블록 — 주간 캘린더 + 날씨 + 루틴 달성 매트릭스
  | 'routinematrix'   // 루틴 달성 매트릭스 블록 — 주간 루틴 꾸준함 시각화
  | 'monthlycalendar'   // 월간 캘린더 블록 — 달력 그리드 + 일간 노트 연결 + 메모
  | 'quarterlyplanner'  // 분기 플래너 블록 — OKR + 3개월 미니뷰 + 루틴 히트맵
  | 'yearlyplanner'     // 연간 플래너 블록 — 연간 목표 + 12개월 그리드 + 52주 히트맵


// -----------------------------------------------
// 페이지 속성 타입
// 날짜 / 상태 / 선택 / 텍스트 / 관계 / 시간 6종
// time 타입: 'HH:MM-HH:MM' 형식으로 시작~종료 시간 저장 (타임 블록 전용)
// Python으로 치면: PropertyType = Literal['date', 'status', 'select', 'text', 'relation', 'time']
// -----------------------------------------------
export type PropertyType = 'date' | 'status' | 'select' | 'text' | 'relation' | 'time'

// 상태 속성 선택지 (고정)
// Python으로 치면: STATUS_OPTIONS = ['미시작', '진행 중', '완료', '보류']
export const STATUS_OPTIONS = ['미시작', '진행 중', '완료', '보류'] as const

// 페이지 속성 하나의 구조
// Python으로 치면:
//   @dataclass class PageProperty:
//       id: str; name: str; type: PropertyType; value: str; options: list[str]
export interface PageProperty {
  id: string           // 속성 고유 ID
  name: string         // 속성 이름 (예: "마감일", "상태")
  type: PropertyType   // 속성 종류
  value: string        // 속성 값 (문자열로 통일)
  options?: string[]   // select 타입 전용 — 선택 가능한 값 목록
  // date 타입 전용 — true이면 해당 날짜에 Web Notification 알림 발송
  // Python으로 치면: reminder: bool = False
  reminder?: boolean
  // date 타입 전용 — Open-Meteo에서 fetch한 날씨 데이터 (선택 사항)
  // Python으로 치면: weather_data: dict | None = None
  weatherData?: {
    icon:     string   // WMO 코드 → 이모지 (예: '⛅')
    tempMin:  number   // 최저 기온 (°C)
    tempMax:  number   // 최고 기온 (°C)
    location: string   // 도시명 (예: 'Seoul')
  }
}


// -----------------------------------------------
// 블록 하나의 구조
// 노션의 모든 콘텐츠는 이 Block 단위로 관리됨
// Python으로 치면:
//   @dataclass
//   class Block:
//       id: str
//       type: BlockType
//       content: str
//       children: list['Block']
// -----------------------------------------------
export interface Block {
  id: string           // 블록 고유 ID (UUID)
  type: BlockType      // 블록 종류 (paragraph, heading1 등)
  content: string      // 블록 내용 — 텍스트 계열은 HTML, 구조형 블록(kanban/chart/gantt/mindmap/canvas/layout 등)은 JSON 문자열로 저장
  // 자식 블록 목록 (토글 안에 들어가는 블록들)
  // 주의: 구 저장 데이터에는 이 필드가 없을 수 있으므로 접근 시 `block.children ?? []` 사용 권장
  // Python으로 치면: children: list['Block'] = field(default_factory=list)
  children?: Block[]
  createdAt: string    // 생성 시각 (ISO 8601 문자열 — 서버 JSON과 타입 일치)
  updatedAt: string    // 마지막 수정 시각 (ISO 8601 문자열)
  // ── 캔버스 모드 전용 필드 ──────────────────────
  // 캔버스 모드에서 블록의 절대 위치와 크기 (그리드 20px 기준)
  // Python으로 치면: canvas_x: int | None = None
  canvasX?: number     // X 좌표 (px)
  canvasY?: number     // Y 좌표 (px)
  canvasW?: number     // 너비 (px, 기본값 400)
  canvasH?: number     // 높이 (px, 내용에 따라 자동 갱신)
  // 블록 배경색 (hex 또는 undefined = 투명)
  // Python으로 치면: background_color: str | None = None
  backgroundColor?: string
}


// -----------------------------------------------
// 페이지 하나의 구조
// 여러 블록을 담는 컨테이너
// Python으로 치면:
//   @dataclass
//   class Page:
//       id: str
//       title: str
//       blocks: list[Block]
// -----------------------------------------------
export interface Page {
  id: string           // 페이지 고유 ID
  title: string        // 페이지 제목
  icon: string         // 페이지 아이콘 이모지 (예: "📝")
  cover?: string       // 커버 값 — URL / "gradient:..." / "color:..." / undefined
  coverPosition?: number // 커버 이미지 Y 위치 (0~100, 기본 50 = 가운데)
  // 태그 목록 (예: ["업무", "중요"]) — 선택 사항, 없으면 빈 배열로 취급
  // Python으로 치면: tags: list[str] = field(default_factory=list)
  tags?: string[]
  // 즐겨찾기 여부 — true이면 목록 상단에 고정
  // Python으로 치면: starred: bool = False
  starred?: boolean
  blocks: Block[]      // 이 페이지에 속한 블록 목록
  // 페이지 속성 목록 (날짜·상태·선택·텍스트) — 없으면 빈 배열로 취급
  // Python으로 치면: properties: list[PageProperty] = field(default_factory=list)
  properties?: PageProperty[]
  createdAt: string    // 생성 시각 (ISO 8601 문자열 — 서버 JSON과 타입 일치)
  updatedAt: string    // 마지막 수정 시각 (ISO 8601 문자열)
  // 캔버스 모드 여부 — true이면 블록을 절대 좌표로 배치
  // Python으로 치면: canvas_mode: bool = False
  canvasMode?: boolean
  // 잠금 여부 — true이면 편집 불가 (읽기 전용 모드와 별도 개념)
  // Python으로 치면: is_locked: bool = False
  isLocked?: boolean
  // PIN 해시 — SHA-256(pin) hex 문자열. 설정 안 하면 undefined
  // Python으로 치면: lock_pin: str | None = None
  lockPin?: string
  // 캔버스 모드 가상 박스 목록 — 각 박스는 블록 배치 영역을 시각적으로 구분
  // Python으로 치면: canvas_boxes: list[CanvasBox] = field(default_factory=list)
  canvasBoxes?: CanvasBox[]
}

// 캔버스 모드 가상 박스 — 블록 배치 영역을 나타내는 시각적 컨테이너
// hover 시 경계선 표시, 드래그로 크기 조절 가능
// Python으로 치면: @dataclass class CanvasBox: id, x, y, w, h, label
export interface CanvasBox {
  id: string
  x: number     // 캔버스 내 X 좌표 (px)
  y: number     // 캔버스 내 Y 좌표 (px)
  w: number     // 너비 (px)
  h: number     // 높이 (px)
  label?: string  // 박스 레이블 (선택)
}


// -----------------------------------------------
// Magazine Layout 시스템 타입
// 원고(Content)와 레이아웃(Form)의 분리 구조
// 원고 블록 배열은 그대로 유지하고, 레이아웃 배치 정보만 별도 관리
// Python으로 치면: @dataclass class LayoutDescriptor / LayoutCell / LayoutTheme
// -----------------------------------------------

// 셀별 스타일 오버라이드 — CSS Grid 셀에 적용되는 추가 스타일
// Python으로 치면: @dataclass class CellStyle: ...
export interface CellStyle {
  backgroundColor?: string    // 셀 배경색
  padding?: number            // 셀 내부 여백 (px)
  borderRadius?: number       // 셀 모서리 둥글기 (px)
  overflow?: 'hidden' | 'visible' | 'auto'
}

// 블록의 역할 분류 — AI 분석기가 각 블록에 할당하는 역할
// Python으로 치면: BlockRole = Literal['headline', 'hero_image', ...]
export type BlockRole =
  | 'headline'      // H1 — 가장 큰 제목
  | 'subheadline'   // H2 — 소제목
  | 'hero_image'    // 첫 번째 or 가장 큰 이미지 — 메인 비주얼
  | 'body_text'     // 긴 텍스트 (200자 이상) — 본문
  | 'caption'       // 이미지 바로 뒤 짧은 텍스트 — 캡션
  | 'pull_quote'    // blockquote — 강조 인용구
  | 'data_table'    // 표 — 데이터 시각화
  | 'sidebar_text'  // 짧은 텍스트 (200자 미만) — 사이드바
  | 'visual'        // 차트/마인드맵/다이어그램 — 시각 자료

// 그리드 셀 하나 — blockId로 원고 블록과 연결
// Python으로 치면: @dataclass class LayoutCell: ...
export interface LayoutCell {
  id: string
  blockId: string             // 원고 Block.id와 연결 (단일 진실 소스)
  col: [number, number]       // [colStart, colEnd] 1-based, 12컬럼 기준
  row: [number, number]       // [rowStart, rowEnd] 1-based
  style?: CellStyle           // 셀별 스타일 오버라이드
  locked: boolean             // true이면 AI 재생성 시 이 셀 위치/크기 보호
  userEdited: boolean         // true이면 AI 재생성 시 건드리지 않음
  role?: BlockRole            // AI 분석기가 할당한 역할 (참고용)
}

// 잡지 레이아웃 테마 — 폰트 페어링 + 색상 + 간격 프리셋
// Python으로 치면: @dataclass class LayoutTheme: ...
export interface LayoutTheme {
  fontPair: 'editorial' | 'modern' | 'classic' | 'minimal'
  // editorial: Playfair Display + Source Serif
  // modern:    Neue Haas Grotesk + Inter
  // classic:   Garamond + Gill Sans
  // minimal:   Inter + Inter (단일 폰트)
  accentColor: string         // 강조색 (hex)
  columnGap: number           // 컬럼 간격 (px, 기본 16)
  rowGap: number              // 행 간격 (px, 기본 16)
  baselineGrid: number        // 베이스라인 그리드 단위 (px, 기본 8)
  padding: number             // 섹션 외부 여백 (px, 기본 24)
}

// 레이아웃 디스크립터 — 페이지 하나의 레이아웃 전체 정보
// 원고 블록 배열과 독립적으로 저장 — 원고 수정 시 레이아웃 구조 유지
// Python으로 치면: @dataclass class LayoutDescriptor: ...
export interface LayoutDescriptor {
  id: string
  pageId: string              // 연결된 페이지 ID
  gridCols: number            // 그리드 컬럼 수 (기본 12)
  cells: LayoutCell[]         // 각 블록의 배치 정보
  theme: LayoutTheme          // 테마 설정
  createdBy: 'ai' | 'user' | 'template'  // 생성 주체
  templateId?: string         // 사용한 프리셋 템플릿 ID
  version: number             // undo/redo용 버전 번호
  createdAt: string           // 생성 시각
  updatedAt: string           // 마지막 수정 시각
}

// 프리셋 템플릿 정의 — AI 매칭 또는 사용자 직접 선택
// Python으로 치면: @dataclass class LayoutTemplate: ...
export interface LayoutTemplate {
  id: string
  name: string                // 예: "잡지 스프레드형"
  nameEn: string              // 예: "Magazine Spread"
  description: string
  thumbnail?: string          // 미리보기 이미지 URL
  // 블록 역할 → 셀 위치 매핑 규칙
  // Python으로 치면: role_map: dict[BlockRole, tuple[col, row]]
  roleMap: Partial<Record<BlockRole, { col: [number, number]; row: [number, number] }>>
  // 이 템플릿이 적합한 콘텐츠 조합 조건
  // Python으로 치면: conditions: list[str]
  conditions: {
    minImages?: number
    maxImages?: number
    minTextBlocks?: number
    hasTable?: boolean
    hasQuote?: boolean
  }
}

// 기본 레이아웃 테마
// Python으로 치면: DEFAULT_LAYOUT_THEME = LayoutTheme(...)
export const DEFAULT_LAYOUT_THEME: LayoutTheme = {
  fontPair: 'modern',
  accentColor: '#3b82f6',
  columnGap: 16,
  rowGap: 16,
  baselineGrid: 8,
  padding: 24,
}

// 새 LayoutDescriptor 생성 헬퍼
// Python으로 치면: LayoutDescriptor.create(page_id) 클래스 메서드
export function createLayoutDescriptor(pageId: string): LayoutDescriptor {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    pageId,
    gridCols: 12,
    cells: [],
    theme: { ...DEFAULT_LAYOUT_THEME },
    createdBy: 'user',
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
}

// -----------------------------------------------
// DayPlanner 공유 타입
// DayPlannerBlock + settingsStore 양쪽에서 사용
// Python으로 치면: @dataclass class PlanEvent / Routine
// -----------------------------------------------

// 이벤트 내 서브태스크 항목
// Python으로 치면: @dataclass class SubTask: id, text, done
export interface SubTask {
  id:   string
  text: string
  done: boolean
}

// 하루 일정 이벤트 하나
// Python으로 치면: @dataclass class PlanEvent: id, title, start, end, color, done, clockIn, clockOut, elapsed, log, subtasks, energy
export interface PlanEvent {
  id:       string
  title:    string
  start:    string    // 'HH:MM'
  end:      string    // 'HH:MM'
  color:    string    // EVENT_COLORS id
  done:     boolean
  clockIn?:  string   // 실제 작업 시작 시각 'HH:MM:SS'
  clockOut?: string   // 실제 작업 종료 시각 'HH:MM:SS'
  elapsed?:  number   // 누적 실제 작업 분
  log?:      string   // 실제 수행 기록 (자유 텍스트)
  subtasks?: SubTask[] // 서브태스크 체크리스트
  energy?:   number   // 집중도/에너지 레벨 (1~5)
}

// 반복 루틴 프리셋
// days: 0=일 1=월 2=화 3=수 4=목 5=금 6=토, 빈 배열 = 매일
// Python으로 치면: @dataclass class Routine: id, title, start, end, color, days
export interface Routine {
  id:    string
  title: string
  start: string    // 'HH:MM'
  end:   string    // 'HH:MM'
  color: string
  days:  number[]  // 요일 배열
}

// -----------------------------------------------
// 새 블록 생성 헬퍼 함수
// 역할: Block 객체를 기본값으로 만들어주는 공장 함수
// Python으로 치면: Block.create() 클래스 메서드
// -----------------------------------------------
export function createBlock(type: BlockType = 'paragraph'): Block {
  const now = new Date().toISOString()  // 동일 타임스탬프 보장 (두 번 호출하면 미세 차이 발생)
  return {
    id: crypto.randomUUID(),   // 브라우저 내장 UUID 생성기
    type,
    content: '',               // 처음엔 내용 없음
    children: [],              // 처음엔 자식 블록 없음
    createdAt: now,
    updatedAt: now,
  }
}


// -----------------------------------------------
// 카테고리 하나의 구조
// vault 안의 실제 폴더와 1:1 대응
// Python으로 치면:
//   @dataclass
//   class Category:
//       id: str
//       name: str
//       folder_name: str
// -----------------------------------------------
export interface Category {
  id: string           // 카테고리 고유 ID (UUID)
  name: string         // 사용자가 보는 이름 (예: "업무")
  folderName: string   // vault 안의 실제 폴더명 (예: "업무")
  // 부모 카테고리 ID (null이면 최상위)
  // Python으로 치면: parent_id: str | None = None
  parentId?: string | null
  // 폴더 아이콘 커스텀 색상 (hex, 예: '#3b82f6'). 없으면 depth 기본 색상 사용
  color?: string | null
}

// -----------------------------------------------
// 휴지통 항목 — 페이지 또는 카테고리 통합 타입
// _vault_trash/index.json 기반 (실물 파일 이동 방식)
// Python으로 치면: @dataclass class TrashItem: ...
// -----------------------------------------------
export interface TrashItem {
  id: string
  itemType: 'page' | 'category'        // 페이지 or 폴더
  title?: string                        // 페이지 제목
  name?: string                         // 폴더 이름
  icon?: string                         // 페이지 아이콘
  trashedAt: string                     // 삭제 일시 (ISO)
  originalCategoryId?: string | null    // 원래 카테고리 ID (페이지)
  originalParentId?: string | null      // 원래 부모 폴더 ID (카테고리)
  childCount?: number                   // 하위 항목 수 (카테고리) — 배지 표시용
}


// -----------------------------------------------
// 새 페이지 생성 헬퍼 함수
// 역할: Page 객체를 기본값으로 만들어주는 공장 함수
// -----------------------------------------------
export function createPage(title: string = '제목 없음'): Page {
  return {
    id: crypto.randomUUID(),
    title,
    icon: '📝',
    blocks: [createBlock('paragraph')],  // 페이지 생성 시 빈 블록 하나 자동 추가
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}