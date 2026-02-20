// =============================================
// src/components/editor/CoverPicker.tsx
// 역할: 커버 이미지/색상 선택 팝업 (3가지 방법)
// Python으로 치면: class CoverPicker(QDialog): tabs = ['색상', 'URL', '업로드']
// =============================================

'use client'

import { useRef, useState, useEffect } from 'react'

// -----------------------------------------------
// 프리셋 그라디언트 목록
// cover 값으로 "gradient:{css}" 형식으로 저장됨
// Python으로 치면: GRADIENT_PRESETS: list[dict] = [...]
// -----------------------------------------------
const GRADIENT_PRESETS = [
  { name: '보라 파랑', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: '분홍 오렌지', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { name: '파랑 하늘', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { name: '녹색 청록', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { name: '노을', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { name: '바다', value: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
  { name: '새벽', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
  { name: '하늘', value: 'linear-gradient(135deg, #74b9ff 0%, #a29bfe 100%)' },
  { name: '석양', value: 'linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%)' },
  { name: '숲', value: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)' },
  { name: '밤하늘', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { name: '불꽃', value: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)' },
]

// -----------------------------------------------
// 프리셋 단색 목록
// cover 값으로 "color:{hex}" 형식으로 저장됨
// Python으로 치면: SOLID_PRESETS: list[dict] = [...]
// -----------------------------------------------
const SOLID_PRESETS = [
  { name: '연회색', value: '#f1f3f4' },
  { name: '베이지', value: '#fef3c7' },
  { name: '민트', value: '#d1fae5' },
  { name: '라벤더', value: '#ede9fe' },
  { name: '코랄', value: '#fee2e2' },
  { name: '하늘', value: '#dbeafe' },
  { name: '피치', value: '#fce7f3' },
  { name: '슬레이트', value: '#e2e8f0' },
  { name: '진회색', value: '#374151' },
  { name: '네이비', value: '#1e3a5f' },
  { name: '다크초록', value: '#14532d' },
  { name: '다크자주', value: '#4c1d95' },
]

interface CoverPickerProps {
  onSelect: (cover: string) => void   // 커버 선택 완료 콜백
  onUpload: () => void                // 업로드 탭 클릭 시 콜백 (파일 input 트리거)
  onClose: () => void
  // 외부에서 계산한 fixed 위치 (커버 있을 때 overflow 컨테이너 탈출용)
  // 없으면 부모 relative 기준 absolute 위치로 동작
  // Python으로 치면: position: Optional[dict] = None
  fixedStyle?: React.CSSProperties
}

// -----------------------------------------------
// CoverPicker 컴포넌트
//
// fixedStyle 있음: position:fixed 로 뷰포트 기준 렌더링 (overflow 컨테이너 탈출)
// fixedStyle 없음: absolute top-full left-0 로 버튼 바로 아래에 표시
//
// Python으로 치면: class CoverPicker(Popup): def render(self): ...
// -----------------------------------------------
export default function CoverPicker({ onSelect, onUpload, onClose, fixedStyle }: CoverPickerProps) {

  // 현재 활성 탭: 'color' | 'url'
  const [tab, setTab] = useState<'color' | 'url'>('color')
  const [urlInput, setUrlInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 외부 클릭 및 Escape → 닫기
  // Python으로 치면: document.on('mousedown', lambda e: close() if out)
  // -----------------------------------------------
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    // -----------------------------------------------
    // 팝업 컨테이너
    // fixedStyle 있음 → position:fixed (뷰포트 기준, overflow 탈출)
    // fixedStyle 없음 → absolute top-full left-0 (버튼 아래)
    // Python으로 치면: style = fixed_style or {'position': 'absolute', 'top': '100%'}
    // -----------------------------------------------
    <div
      ref={containerRef}
      className={`z-9999 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden ${fixedStyle ? '' : 'absolute top-full left-0 mt-1'}`}
      style={fixedStyle}
    >

      {/* ── 탭 헤더 ────────────────────────────── */}
      <div className="flex border-b border-gray-100">

        {/* 색상 탭 */}
        <button
          type="button"
          onClick={() => setTab('color')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'color' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
        >
          색상
        </button>

        {/* URL 탭 */}
        <button
          type="button"
          onClick={() => setTab('url')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'url' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
        >
          URL
        </button>

        {/* 업로드 — 탭이 아니라 즉시 파일 다이얼로그 열기 */}
        <button
          type="button"
          onClick={() => { onUpload(); onClose() }}
          className="flex-1 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          업로드
        </button>
      </div>

      {/* ── 탭 콘텐츠 ──────────────────────────── */}
      <div className="p-3">

        {/* 색상 탭: 그라디언트 + 단색 */}
        {tab === 'color' && (
          <div>
            <p className="text-xs text-gray-400 mb-2">그라디언트</p>
            {/* 6열 그리드 — 각 색상 칩 클릭 시 선택 */}
            {/* Python으로 치면: for g in GRADIENT_PRESETS: render_chip(g) */}
            <div className="grid grid-cols-6 gap-1.5 mb-3">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  title={g.name}
                  onClick={() => { onSelect(`gradient:${g.value}`); onClose() }}
                  style={{ background: g.value }}
                  className="h-8 rounded-md border border-gray-100 hover:scale-110 transition-transform"
                />
              ))}
            </div>

            <p className="text-xs text-gray-400 mb-2">단색</p>
            <div className="grid grid-cols-6 gap-1.5">
              {SOLID_PRESETS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.name}
                  onClick={() => { onSelect(`color:${s.value}`); onClose() }}
                  style={{ background: s.value }}
                  className="h-8 rounded-md border border-gray-200 hover:scale-110 transition-transform"
                />
              ))}
            </div>
          </div>
        )}

        {/* URL 탭: 외부 이미지 URL 입력 */}
        {tab === 'url' && (
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && urlInput.trim()) {
                  onSelect(urlInput.trim())
                  onClose()
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400"
              autoFocus
            />
            <button
              type="button"
              disabled={!urlInput.trim()}
              onClick={() => { if (urlInput.trim()) { onSelect(urlInput.trim()); onClose() } }}
              className="w-full py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              적용
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
