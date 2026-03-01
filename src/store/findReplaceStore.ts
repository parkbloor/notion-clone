// ==============================================
// src/store/findReplaceStore.ts
// 역할: 찾기/바꾸기 전역 상태 (Zustand)
//   - 모든 Editor 인스턴스가 구독 → 검색어 변경 시 동시 하이라이트
// Python으로 치면: find_replace_store = {'query': '', 'replace_str': '', ...}
// ==============================================

import { create } from 'zustand'

// Python으로 치면: @dataclass class FindReplaceState: ...
interface FindReplaceState {
  isOpen: boolean
  showReplace: boolean    // true = 바꾸기 행도 표시
  query: string
  replaceStr: string
  caseSensitive: boolean

  // 액션
  open: (showReplace?: boolean) => void
  close: () => void
  setQuery: (q: string) => void
  setReplaceStr: (r: string) => void
  toggleCase: () => void
  toggleReplace: () => void
}

// Python으로 치면: find_replace_store = create_store(FindReplaceState)
export const useFindReplaceStore = create<FindReplaceState>((set) => ({
  isOpen: false,
  showReplace: false,
  query: '',
  replaceStr: '',
  caseSensitive: false,

  open: (showReplace = false) => set({ isOpen: true, showReplace }),
  close: () => set({ isOpen: false, query: '', replaceStr: '' }),
  setQuery: (query) => set({ query }),
  setReplaceStr: (replaceStr) => set({ replaceStr }),
  toggleCase: () => set(s => ({ caseSensitive: !s.caseSensitive })),
  toggleReplace: () => set(s => ({ showReplace: !s.showReplace })),
}))
