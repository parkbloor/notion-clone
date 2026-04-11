// =============================================
// src/hooks/useEditorMention.ts
// 역할: @ 멘션 / [[ 페이지링크 팝업 상태 + 감지 로직
// Editor.tsx에서 분리 — useEditor 콜백에서 checkMention 호출
// Python으로 치면: class MentionState: + def check_mention(editor): ...
// =============================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'

// 멘션 메뉴 상태 타입
// trigger: '@' = 페이지 멘션, '[[' = 페이지 링크
// Python으로 치면: MentionState = TypedDict('MentionState', {...})
interface MentionMenuState {
  isOpen: boolean
  query: string
  from: number       // 트리거 문자(@, [[) 위치 — deleteRange 시작점
  trigger: '@' | '[['
  position: { x: number; y: number }
}

const INITIAL_STATE: MentionMenuState = {
  isOpen: false,
  query: '',
  from: 0,
  trigger: '@',
  position: { x: 0, y: 0 },
}

// -----------------------------------------------
// useEditorMention: 멘션 팝업 상태 + 감지 함수 반환
// mentionMenuRef: stale closure 방지 — useEditor 콜백 내에서 최신 상태 읽기용
// Python으로 치면: def use_mention_state() -> (state, ref, check_fn, setter): ...
// -----------------------------------------------
export function useEditorMention() {
  const [mentionMenu, setMentionMenu] = useState<MentionMenuState>(INITIAL_STATE)

  // stale closure 방지용 ref — useEditor handleKeyDown 콜백에서 사용
  // Python으로 치면: self._mention_ref = self.mention_state
  const mentionMenuRef = useRef(mentionMenu)
  useEffect(() => { mentionMenuRef.current = mentionMenu }, [mentionMenu])

  // -----------------------------------------------
  // checkMention: cursor 앞 텍스트에서 @단어 / [[단어 패턴 감지
  // @ 트리거:  "@페이지이름"   → trigger='@',  from=@ 위치
  // [[ 트리거: "[[페이지이름"  → trigger='[[', from=[[ 위치
  // Python으로 치면:
  //   def check_mention(editor):
  //       if re.search(r'@[\w가-힣]*$', text_before): open_popup(trigger='@')
  //       elif re.search(r'\[\[[\w가-힣\s]*$', text_before): open_popup(trigger='[[')
  // -----------------------------------------------
  const checkMention = useCallback((editor: TiptapEditor) => {
    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 40), from, '\n')

    // @ 트리거: @한글/영문/숫자 (ㄱ-ㅎ, ㅏ-ㅣ 자모 단독 입력 포함)
    // Python으로 치면: re.search(r'@[\w가-힣ㄱ-ㅎㅏ-ㅣ]*$', text_before)
    const atMatch = textBefore.match(/@([\w가-힣ㄱ-ㅎㅏ-ㅣ]*)$/)
    // [[ 트리거: [[한글/영문/숫자/공백/자모 단독 입력 포함
    const bracketMatch = textBefore.match(/\[\[([\w가-힣ㄱ-ㅎㅏ-ㅣ\s]*)$/)

    if (atMatch) {
      const query = atMatch[1]
      const atPos = from - query.length - 1  // @ 문자 위치
      const coords = editor.view.coordsAtPos(from)
      setMentionMenu({ isOpen: true, query, from: atPos, trigger: '@', position: { x: coords.left, y: coords.bottom } })
    } else if (bracketMatch) {
      const query = bracketMatch[1]
      // textBefore에서 [[ 위치를 직접 탐색 — 공백 포함 쿼리 시 음수 방지
      // Python으로 치면: bracket_pos = text_before.rfind('[[')
      const bracketIdx = textBefore.lastIndexOf('[[')
      const bracketPos = Math.max(0, from - (textBefore.length - bracketIdx))
      const coords = editor.view.coordsAtPos(from)
      setMentionMenu({ isOpen: true, query, from: bracketPos, trigger: '[[', position: { x: coords.left, y: coords.bottom } })
    } else {
      // 완전 초기화 — stale position 잔존 방지
      setMentionMenu(INITIAL_STATE)
    }
  }, [])

  return { mentionMenu, mentionMenuRef, checkMention, setMentionMenu }
}
