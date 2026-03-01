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


// -----------------------------------------------
// 페이지 속성 타입
// 날짜 / 상태 / 선택 / 텍스트 4종
// Python으로 치면: PropertyType = Literal['date', 'status', 'select', 'text']
// -----------------------------------------------
export type PropertyType = 'date' | 'status' | 'select' | 'text'

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
  content: string      // 블록 내용 (HTML 문자열로 저장)
  children: Block[]    // 자식 블록 목록 (토글 안에 들어가는 블록들)
  createdAt: Date      // 생성 시각
  updatedAt: Date      // 마지막 수정 시각
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
  createdAt: Date      // 생성 시각
  updatedAt: Date      // 마지막 수정 시각
}


// -----------------------------------------------
// 새 블록 생성 헬퍼 함수
// 역할: Block 객체를 기본값으로 만들어주는 공장 함수
// Python으로 치면: Block.create() 클래스 메서드
// -----------------------------------------------
export function createBlock(type: BlockType = 'paragraph'): Block {
  return {
    id: crypto.randomUUID(),   // 브라우저 내장 UUID 생성기
    type,
    content: '',               // 처음엔 내용 없음
    children: [],              // 처음엔 자식 블록 없음
    createdAt: new Date(),
    updatedAt: new Date(),
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
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}