// =============================================
// src/hooks/useEditorLatex.ts
// 역할: LaTeX 붙여넣기 감지 상태 관리
// handlePaste에서 $$...$$ 패턴 감지 시 setLatexCandidate 호출
// Python으로 치면: class LatexPasteState: candidate: str | None = None
// =============================================

import { useState } from 'react'

// -----------------------------------------------
// useEditorLatex: LaTeX 후보 문자열 상태 반환
// latexCandidate — null이면 UI 숨김, 문자열이면 변환 제안 배너 표시
// Python으로 치면: def use_latex_state() -> (candidate, setter): ...
// -----------------------------------------------
export function useEditorLatex() {
  // 블록 수식($$...$$)이 붙여넣어지면 순수 LaTeX 문자열 저장
  // → 변환 여부 묻는 UI 표시, 수락 시 math 블록으로 전환
  // Python으로 치면: self.latex_candidate: str | None = None
  const [latexCandidate, setLatexCandidate] = useState<string | null>(null)

  return { latexCandidate, setLatexCandidate }
}
