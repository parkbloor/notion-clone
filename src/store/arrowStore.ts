// =============================================
// src/store/arrowStore.ts
// 역할: 화살표 연결 대기 상태 + 컨텍스트 메뉴 상태 전역 관리
//
// connectingState: "연결 대기" 모드 (시작 원에서 드래그 중)
//   → ArrowLayer가 읽어 고무줄 선 렌더링
//   → 에디터 클릭 시 end 마크 자동 적용
//
// contextMenu: 원 우클릭 시 설정 메뉴 좌표 + 대상 arrowId
//   → ArrowContextMenu가 읽어 설정 UI 표시
//
// Python으로 치면: class ArrowStore: connecting_state = None; context_menu = None
// =============================================

import { create } from 'zustand'

// -----------------------------------------------
// 연결 대기 상태
// 시작 원 클릭 → 이 상태 설정 → 마우스 따라 고무줄 선 그림
// Python으로 치면: @dataclass class ConnectingState: ...
// -----------------------------------------------
export interface ConnectingState {
  arrowId: string
  color: string
  opacity: number
  arrowType: 'margin' | 'diagonal'
  xPosition: number
  startHead: boolean
  endHead: boolean
  // 시작 원의 화면 좌표 (고무줄 선 출발점)
  // Python으로 치면: anchor: tuple[float, float]
  anchorX: number
  anchorY: number
}

// -----------------------------------------------
// 컨텍스트 메뉴 상태
// 원 우클릭 → 이 상태 설정 → ArrowContextMenu 표시
// Python으로 치면: @dataclass class ContextMenuState: ...
// -----------------------------------------------
export interface ContextMenuState {
  // 메뉴 화면 위치
  x: number
  y: number
  // 대상 화살표 ID (이 ID의 모든 mark를 갱신/삭제)
  arrowId: string
  // 우클릭한 마커가 시작점인지 끝점인지 (끝점 추가 버튼 표시 여부에 사용)
  isStart: boolean
  // 현재 설정값 (메뉴 초기값으로 사용)
  attrs: {
    color: string
    opacity: number
    arrowType: 'margin' | 'diagonal'
    xPosition: number
    startHead: boolean
    endHead: boolean
  }
}

// -----------------------------------------------
// 스토어 인터페이스
// Python으로 치면: class ArrowStoreProtocol(Protocol): ...
// -----------------------------------------------
interface ArrowStore {
  // 연결 대기 상태 (null = 대기 없음)
  connectingState: ConnectingState | null
  // 컨텍스트 메뉴 상태 (null = 닫힘)
  contextMenu: ContextMenuState | null

  // 연결 대기 시작
  // Python으로 치면: def set_connecting(self, state): self.connecting_state = state
  setConnecting: (state: ConnectingState) => void
  // 연결 대기 종료
  clearConnecting: () => void
  // 컨텍스트 메뉴 열기
  setContextMenu: (menu: ContextMenuState) => void
  // 컨텍스트 메뉴 닫기
  clearContextMenu: () => void
}

// -----------------------------------------------
// Zustand 스토어 생성
// Python으로 치면: arrow_store = ArrowStore()
// -----------------------------------------------
export const useArrowStore = create<ArrowStore>((set) => ({
  connectingState: null,
  contextMenu: null,

  setConnecting: (state) => set({ connectingState: state }),
  clearConnecting: () => set({ connectingState: null }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  clearContextMenu: () => set({ contextMenu: null }),
}))
