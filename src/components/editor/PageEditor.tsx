// =============================================
// src/components/editor/PageEditor.tsx
// 역할: 한 페이지 안의 모든 블록을 목록으로 렌더링
// Python으로 치면: for block in page.blocks: render(block)
// =============================================

'use client'

import { useRef, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'
import Editor from './Editor'
import EmojiPicker from './EmojiPicker'

// ── dnd-kit 임포트 ────────────────────────────
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface PageEditorProps {
  pageId: string
}

export default function PageEditor({ pageId }: PageEditorProps) {

  // -----------------------------------------------
  // 스토어에서 현재 페이지 데이터 + 액션 가져오기
  // -----------------------------------------------
  const page = usePageStore((state) =>
    state.pages.find(p => p.id === pageId) ?? null
  )
  const { updatePageTitle, addBlock, moveBlock, updatePageIcon, updatePageCover } = usePageStore()

  // 이모지 피커 열림 여부
  // Python으로 치면: emoji_picker_open = False
  const [emojiOpen, setEmojiOpen] = useState(false)

  // 커버 이미지 파일 입력 참조
  // Python으로 치면: cover_input_ref = None
  const coverInputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------
  // 커버 이미지 파일 선택 → 서버 업로드 후 URL 저장
  // 서버가 꺼져 있으면 base64 data URL로 fallback
  // Python으로 치면:
  //   async def on_cover_change(file):
  //       try: url = await api.upload(file); update_cover(url)
  //       except: url = to_base64(file); update_cover(url)
  // -----------------------------------------------
  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      // 서버에 실제 파일로 저장 → URL만 반환받아 커버에 저장
      const url = await api.uploadImage(pageId, file)
      updatePageCover(pageId, url)
    } catch {
      // 서버 꺼져 있을 때 — base64로 임시 저장 (Graceful degradation)
      const reader = new FileReader()
      reader.onload = (ev) => {
        updatePageCover(pageId, ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // -----------------------------------------------
  // 드래그 센서 — 8px 이상 움직여야 드래그 시작
  // -----------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // -----------------------------------------------
  // 드래그 완료 시 블록 순서 변경
  // -----------------------------------------------
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !page) return

    const fromIndex = page.blocks.findIndex(b => b.id === active.id)
    const toIndex = page.blocks.findIndex(b => b.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      moveBlock(pageId, fromIndex, toIndex)
    }
  }

  if (!page) return null

  return (
    // -----------------------------------------------
    // 전체 페이지 컨테이너 — 커버는 전체 너비, 본문은 최대 너비 제한
    // -----------------------------------------------
    <div className="min-h-screen">

      {/* ── 커버 이미지 영역 ─────────────────────── */}
      {page.cover ? (
        // ── 커버 있음: 이미지 표시 + 호버 시 변경/삭제 버튼 ──
        <div className="relative w-full h-52 group/cover">
          <img
            src={page.cover}
            alt="페이지 커버"
            className="w-full h-full object-cover"
          />
          {/* 호버 시 버튼들 */}
          <div className="absolute bottom-3 right-4 flex gap-2 opacity-0 group-hover/cover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="px-3 py-1 text-xs bg-white bg-opacity-90 rounded shadow text-gray-600 hover:bg-white transition-colors"
            >
              커버 변경
            </button>
            <button
              type="button"
              onClick={() => updatePageCover(pageId, undefined)}
              className="px-3 py-1 text-xs bg-white bg-opacity-90 rounded shadow text-red-500 hover:bg-white transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        // ── 커버 없음: hover 시 "커버 추가" 버튼만 표시 ──
        <div className="h-12 group/nocov relative">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="absolute bottom-1 left-16 opacity-0 group-hover/nocov:opacity-100 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
          >
            + 커버 추가
          </button>
        </div>
      )}

      {/* 숨겨진 파일 입력 (커버 이미지 업로드) */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverChange}
        className="hidden"
      />

      {/* ── 본문 영역 (최대 너비 제한) ───────────── */}
      <div className="max-w-3xl mx-auto px-16 pb-24">

        {/* ── 페이지 아이콘 ────────────────────────
            클릭하면 이모지 피커 팝업 표시
            Python으로 치면: icon_btn.on_click = lambda: toggle_picker() */}
        <div className="relative inline-block pt-8 pb-2">
          <button
            type="button"
            onClick={() => setEmojiOpen(prev => !prev)}
            className="text-6xl cursor-pointer hover:opacity-80 transition-opacity select-none"
            title="아이콘 변경"
          >
            {page.icon}
          </button>

          {/* 이모지 피커 팝업 */}
          {emojiOpen && (
            <EmojiPicker
              onSelect={(emoji) => updatePageIcon(pageId, emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        {/* ── 페이지 제목 입력 ─────────────────────── */}
        <input
          type="text"
          value={page.title}
          placeholder="제목 없음"
          onChange={(e) => updatePageTitle(pageId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBlock(pageId)
            }
          }}
          className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-gray-300 text-gray-900 mb-8"
        />

        {/* ── 블록 목록 렌더링 ─────────────────────── */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={page.blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {page.blocks.map((block) => (
                <Editor
                  key={block.id}
                  block={block}
                  pageId={pageId}
                  isLast={page.blocks.length === 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* ── 빈 영역 클릭 시 새 블록 추가 ────────── */}
        <div
          className="min-h-32 cursor-text"
          onClick={() => addBlock(pageId)}
        />

      </div>
    </div>
  )
}
