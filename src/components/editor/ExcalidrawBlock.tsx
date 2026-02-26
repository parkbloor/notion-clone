// =============================================
// src/components/editor/ExcalidrawBlock.tsx
// 역할: Excalidraw 손그림 다이어그램 블록
// Python으로 치면: class ExcalidrawBlock(Widget): def render(self): ...
// Excalidraw는 브라우저 전용 라이브러리 → next/dynamic SSR:false 필수
// =============================================

'use client'

import { useCallback, useRef, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
// Excalidraw UI 스타일시트 — 클라이언트 번들에만 포함됨
import '@excalidraw/excalidraw/index.css'

// -----------------------------------------------
// SSR 없이 동적 임포트
// async: mod.Excalidraw를 default export로 반환
// loading: 로딩 중 표시할 플레이스홀더
// Python으로 치면: Excalidraw = lazy_import('excalidraw', ssr=False)
// -----------------------------------------------
const ExcalidrawComponent = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw')
    return mod.Excalidraw
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-50 text-gray-400 text-sm gap-2">
        <span className="text-xl">✏️</span>
        <span>Excalidraw 로딩 중…</span>
      </div>
    ),
  }
)

// -----------------------------------------------
// 저장 형식 타입
// content JSON: { elements: ExcalidrawElement[], appState: { viewBackgroundColor: string } }
// Python으로 치면: @dataclass class ExcalidrawData: elements: list; app_state: dict
// -----------------------------------------------
interface ExcalidrawData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[]
  appState: { viewBackgroundColor?: string }
}

interface ExcalidrawBlockProps {
  blockId: string      // 블록 고유 ID (initialData 재계산 기준)
  content: string      // JSON 직렬화된 Excalidraw 데이터
  onChange: (content: string) => void  // 변경 시 호출 (디바운스됨)
}

// onChange 디바운스 간격 (ms) — 그림이 자주 바뀌므로 800ms로 설정
// Python으로 치면: DEBOUNCE_MS = 800
const DEBOUNCE_MS = 800

// -----------------------------------------------
// ExcalidrawBlock 컴포넌트
// Python으로 치면: class ExcalidrawBlock(React.Component): ...
// -----------------------------------------------
export default function ExcalidrawBlock({ blockId, content, onChange }: ExcalidrawBlockProps) {

  // ── 디바운스 타이머 ref ──────────────────────
  // Python으로 치면: self._save_timer = None
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 전체화면 모드 토글 상태 ──────────────────
  // Python으로 치면: self.is_fullscreen = False
  const [isFullscreen, setIsFullscreen] = useState(false)

  // -----------------------------------------------
  // initialData: blockId 기준으로 한 번만 계산
  // content 변경 시 재계산하지 않음 → Excalidraw 내부 상태 보존
  // Python으로 치면: @functools.lru_cache(maxsize=1) def parse_initial(block_id): ...
  // -----------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData = useMemo((): any => {
    try {
      const parsed = JSON.parse(content) as ExcalidrawData
      return {
        elements: parsed.elements ?? [],
        appState: {
          viewBackgroundColor: parsed.appState?.viewBackgroundColor ?? '#ffffff',
        },
        scrollToContent: (parsed.elements?.length ?? 0) > 0,
      }
    } catch {
      // content가 비어있거나 파싱 실패 시 빈 캔버스로 시작
      // Python으로 치면: except (ValueError, KeyError): return default_data()
      return {
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        scrollToContent: false,
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId])  // ← content는 의도적으로 제외 (블록 ID가 바뀔 때만 재계산)

  // -----------------------------------------------
  // Excalidraw onChange 핸들러
  // 그림이 바뀔 때마다 호출됨 → 800ms 디바운스 후 JSON 직렬화하여 저장
  // Python으로 치면: def on_change(elements, app_state, files): debounce_save(...)
  // -----------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: any, appState: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onChange(JSON.stringify({
        elements: Array.from(elements),
        appState: {
          viewBackgroundColor: (appState.viewBackgroundColor as string) ?? '#ffffff',
        },
      }))
    }, DEBOUNCE_MS)
  }, [onChange])

  // ── 컨테이너 높이/위치 클래스 ────────────────
  // 전체화면: fixed inset-0 z-50 / 일반: relative h-[480px]
  // Python으로 치면: container_class = 'fullscreen' if is_fullscreen else 'normal'
  const containerStyle = isFullscreen
    ? { position: 'fixed' as const, inset: 0, zIndex: 50 }
    : { position: 'relative' as const, height: 480 }

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-gray-200 bg-white"
      style={containerStyle}
    >
      {/* ── 전체화면 토글 버튼 ─────────────────── */}
      {/* position:absolute → 캔버스 위에 오버레이 */}
      {/* Python으로 치면: self.fullscreen_btn = Button(text='⊞', on_click=toggle_fullscreen) */}
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          onClick={() => setIsFullscreen(f => !f)}
          title={isFullscreen ? '축소 (Esc)' : '전체화면으로 보기'}
          className="px-2.5 py-1 text-xs font-medium bg-white border border-gray-200 rounded-md shadow-sm text-gray-600 hover:bg-gray-50 transition-colors select-none"
        >
          {isFullscreen ? '⊡ 축소' : '⊞ 전체화면'}
        </button>
      </div>

      {/* ── Excalidraw 캔버스 ────────────────────── */}
      {/* initialData: blockId 기준으로 최초 1회만 계산한 초기 데이터 */}
      {/* onChange: 그림 변경 시 디바운스 저장 */}
      {/* langCode: 한국어 UI */}
      {/* Python으로 치면: canvas = Excalidraw(initial_data=data, on_change=save, lang='ko-KR') */}
      <div className="w-full h-full">
        <ExcalidrawComponent
          initialData={initialData}
          onChange={handleChange}
          langCode="ko-KR"
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
              export: { saveFileToDisk: true },
            },
          }}
        />
      </div>
    </div>
  )
}
