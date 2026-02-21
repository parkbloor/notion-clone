// =============================================
// src/components/settings/tabs/EditorTab.tsx
// 역할: 편집기 설정 탭 — 글꼴, 크기, 줄간격
// Python으로 치면: class EditorSettings(SettingsTab): def render_font_picker(): ...
// =============================================

'use client'

import { useSettingsStore, applyEditorStyle } from '@/store/settingsStore'

// -----------------------------------------------
// 글꼴 패밀리 옵션
// Python으로 치면: FONT_OPTIONS = [('sans', 'Sans-serif', '고딕 계열'), ...]
// -----------------------------------------------
const FONT_OPTIONS = [
  { value: 'sans',  label: 'Sans-serif', preview: 'Ag 가나다', desc: '읽기 편한 고딕' },
  { value: 'serif', label: 'Serif',      preview: 'Ag 가나다', desc: '명조 계열' },
  { value: 'mono',  label: 'Monospace',  preview: 'Ag 12345', desc: '코드 스타일' },
] as const

// 글꼴 크기 옵션
const SIZE_OPTIONS: Array<14 | 16 | 18 | 20> = [14, 16, 18, 20]

export default function EditorTab() {
  const { fontFamily, fontSize, lineHeight, setFontFamily, setFontSize, setLineHeight } = useSettingsStore()

  // 편집기 스타일 즉시 반영 헬퍼
  // Python으로 치면: def update_and_apply(self, **kwargs): self.update(**kwargs); apply_style()
  function changeFont(font: 'sans' | 'serif' | 'mono') {
    setFontFamily(font)
    applyEditorStyle(font, fontSize, lineHeight)
  }

  function changeSize(size: 14 | 16 | 18 | 20) {
    setFontSize(size)
    applyEditorStyle(fontFamily, size, lineHeight)
  }

  function changeLH(lh: number) {
    const rounded = Math.round(lh * 10) / 10
    setLineHeight(rounded)
    applyEditorStyle(fontFamily, fontSize, rounded)
  }

  // 글꼴 패밀리별 미리보기 폰트
  const previewFontMap = {
    sans:  "'Inter', 'Noto Sans KR', sans-serif",
    serif: "'Georgia', 'Noto Serif KR', serif",
    mono:  "'JetBrains Mono', 'Fira Code', monospace",
  }

  return (
    <div className="p-6 space-y-8">

      {/* 글꼴 패밀리 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">글꼴</h3>
        <p className="text-xs text-gray-400 mb-4">에디터 본문에 사용할 글꼴 계열</p>
        <div className="flex gap-3">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => changeFont(opt.value)}
              className={opt.value === fontFamily
                ? "flex-1 flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border-2 border-blue-500 bg-blue-50 transition-colors"
                : "flex-1 flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors"
              }
            >
              {/* 미리보기 텍스트 */}
              <span
                className="text-xl text-gray-800"
                style={{ fontFamily: previewFontMap[opt.value] }}
              >
                {opt.preview}
              </span>
              <span className="text-xs font-medium text-gray-600">{opt.label}</span>
              <span className="text-xs text-gray-400">{opt.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 글꼴 크기 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">글꼴 크기</h3>
        <p className="text-xs text-gray-400 mb-4">에디터 본문 텍스트 크기 (px)</p>
        <div className="flex gap-2">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => changeSize(size)}
              className={size === fontSize
                ? "w-16 py-2 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 text-sm font-semibold transition-colors"
                : "w-16 py-2 rounded-lg border-2 border-gray-200 bg-white text-gray-600 text-sm font-medium hover:border-gray-300 transition-colors"
              }
            >
              {size}px
            </button>
          ))}
        </div>
      </section>

      {/* 줄 간격 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          줄 간격
          <span className="ml-2 text-blue-600 font-bold">{lineHeight.toFixed(1)}</span>
        </h3>
        <p className="text-xs text-gray-400 mb-4">텍스트 줄 사이의 간격 (1.4 ~ 2.0)</p>
        <input
          type="range"
          min="1.4"
          max="2.0"
          step="0.1"
          value={lineHeight}
          onChange={(e) => changeLH(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1.4 좁게</span>
          <span>2.0 넓게</span>
        </div>
      </section>

      {/* 미리보기 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">미리보기</h3>
        <div
          className="border border-gray-200 rounded-xl p-4 bg-gray-50 text-gray-800"
          style={{
            fontFamily: previewFontMap[fontFamily],
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          <p className="text-lg font-bold mb-2">페이지 제목 예시</p>
          <p>이것은 에디터 본문 텍스트 미리보기입니다. 선택한 글꼴과 크기, 줄 간격이 여기에 반영됩니다. The quick brown fox jumps over the lazy dog.</p>
        </div>
      </section>
    </div>
  )
}
