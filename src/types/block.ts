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
  | 'bulletList'     // 글머리 기호 목록
  | 'orderedList'    // 번호 목록
  | 'taskList'       // 체크박스 목록
  | 'toggle'         // 접고 펼치는 토글
  | 'code'           // 코드 블록
  | 'image'          // 이미지
  | 'table'          // 테이블
  | 'divider'        // 구분선


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
  cover?: string       // 커버 이미지 (base64 data URL 또는 undefined)
  blocks: Block[]      // 이 페이지에 속한 블록 목록
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