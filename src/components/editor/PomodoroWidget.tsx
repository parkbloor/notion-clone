// =============================================
// src/components/editor/PomodoroWidget.tsx
// 역할: 포모도로 타이머 플로팅 위젯
// 25분 집중 → 5분 휴식 사이클 반복
// Python으로 치면: class PomodoroTimer: def start(self): self.countdown(25*60)
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'

// -----------------------------------------------
// 타이머 단계: 'work'=집중(25분), 'break'=휴식(5분)
// Python으로 치면: Phase = Literal['work', 'break']
// -----------------------------------------------
type Phase = 'work' | 'break'

const WORK_SECONDS  = 25 * 60   // 25분 = 1500초
const BREAK_SECONDS = 5  * 60   // 5분  = 300초

// -----------------------------------------------
// MM:SS 포맷터
// Python으로 치면: def fmt(s): return f'{s//60:02d}:{s%60:02d}'
// -----------------------------------------------
function fmtTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function PomodoroWidget() {
  // 현재 단계
  const [phase, setPhase] = useState<Phase>('work')
  // 남은 초
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECONDS)
  // 실행 중 여부
  const [isRunning, setIsRunning] = useState(false)
  // 완료된 포모도로 수
  const [completedCount, setCompletedCount] = useState(0)
  // 최소화 여부
  const [minimized, setMinimized] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 단계 변경 시 setInterval 클로저 stale 문제 방지용 ref
  const phaseRef  = useRef<Phase>('work')
  phaseRef.current = phase

  // -----------------------------------------------
  // 타이머 tick — 1초마다 감소, 0이 되면 단계 전환
  // Python으로 치면: while True: time.sleep(1); self.seconds_left -= 1
  // -----------------------------------------------
  useEffect(() => {
    if (!isRunning) return

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // 시간 종료 → 단계 전환 (브라우저 알림)
          if (typeof window !== 'undefined') {
            // 간단한 title 깜빡임으로 알림 (알림 권한 없이도 동작)
            document.title = phaseRef.current === 'work'
              ? '🍅 집중 종료! 휴식하세요'
              : '🎯 휴식 종료! 다시 집중하세요'
            setTimeout(() => { document.title = 'Notion Clone' }, 4000)
          }

          if (phaseRef.current === 'work') {
            // 집중 완료 → 완료 수 +1, 휴식 단계로
            setCompletedCount(c => c + 1)
            setPhase('break')
            setSecondsLeft(BREAK_SECONDS)
          } else {
            // 휴식 완료 → 집중 단계로
            setPhase('work')
            setSecondsLeft(WORK_SECONDS)
          }
          setIsRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // cleanup: phase나 isRunning 변경 시 이전 interval 제거
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  // -----------------------------------------------
  // 리셋 — 현재 단계의 초기 시간으로 복귀
  // Python으로 치면: def reset(self): self.seconds_left = WORK if work else BREAK
  // -----------------------------------------------
  function handleReset() {
    setIsRunning(false)
    setSecondsLeft(phase === 'work' ? WORK_SECONDS : BREAK_SECONDS)
  }

  // -----------------------------------------------
  // 단계 수동 전환 (탭 클릭)
  // Python으로 치면: def switch_phase(self, p): self.phase = p; self.reset()
  // -----------------------------------------------
  function switchPhase(p: Phase) {
    setIsRunning(false)
    setPhase(p)
    setSecondsLeft(p === 'work' ? WORK_SECONDS : BREAK_SECONDS)
  }

  // 진행률 (0~100) — SVG 원형 progress에 사용
  const total    = phase === 'work' ? WORK_SECONDS : BREAK_SECONDS
  const progress = ((total - secondsLeft) / total) * 100

  // 단계별 색상
  const color = phase === 'work' ? '#ef4444' : '#22c55e'   // red / green
  const bg    = phase === 'work' ? 'bg-red-50'  : 'bg-green-50'
  const text  = phase === 'work' ? 'text-red-500' : 'text-green-500'
  const btnBg = phase === 'work' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'

  // -----------------------------------------------
  // 최소화 상태: 작은 알약형 버튼
  // Python으로 치면: if self.minimized: render_pill_button()
  // -----------------------------------------------
  if (minimized) {
    return (
      <div className="fixed bottom-16 right-5 z-40">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-md text-xs text-gray-700 hover:shadow-lg transition-all"
          title="포모도로 타이머 열기"
        >
          <span>🍅</span>
          <span className={isRunning ? `font-mono font-bold ${text}` : 'font-mono text-gray-600'}>
            {fmtTime(secondsLeft)}
          </span>
          {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
        </button>
      </div>
    )
  }

  // -----------------------------------------------
  // 전체 위젯
  // Python으로 치면: class PomodoroUI(QWidget): def render(self): ...
  // -----------------------------------------------
  return (
    <div className="fixed bottom-16 right-5 z-40 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 select-none">

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🍅</span>
          <span className="text-xs font-semibold text-gray-700">Pomodoro</span>
        </div>
        {/* 최소화 버튼 */}
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-xs transition-colors"
          title="최소화"
        >
          −
        </button>
      </div>

      {/* 단계 탭 (집중 / 휴식) */}
      {/* Python으로 치면: self.phase_tabs = TabBar(['집중', '휴식']) */}
      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => switchPhase('work')}
          className={phase === 'work'
            ? "flex-1 py-1 text-xs rounded-lg font-semibold bg-red-50 text-red-600 border border-red-200"
            : "flex-1 py-1 text-xs rounded-lg font-medium text-gray-400 hover:bg-gray-50 transition-colors"
          }
        >
          집중
        </button>
        <button
          type="button"
          onClick={() => switchPhase('break')}
          className={phase === 'break'
            ? "flex-1 py-1 text-xs rounded-lg font-semibold bg-green-50 text-green-600 border border-green-200"
            : "flex-1 py-1 text-xs rounded-lg font-medium text-gray-400 hover:bg-gray-50 transition-colors"
          }
        >
          휴식
        </button>
      </div>

      {/* 원형 진행 + 시간 표시 */}
      {/* Python으로 치면: self.progress_ring = CircularProgress(value=progress) */}
      <div className="flex justify-center mb-3">
        <div className="relative w-24 h-24">
          {/* SVG 원형 프로그레스 */}
          {/* viewBox="0 0 36 36", r=15.9 → 둘레 ≈ 100 (strokeDasharray 계산 편의) */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            {/* 배경 원 */}
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="2.5"
            />
            {/* 진행 원 */}
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeDasharray={`${progress} 100`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          {/* 중앙 시간 텍스트 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-bold font-mono tabular-nums ${text}`}>
              {fmtTime(secondsLeft)}
            </span>
          </div>
        </div>
      </div>

      {/* 컨트롤 버튼: 시작/일시정지 + 리셋 */}
      {/* Python으로 치면: self.start_btn.on_click = toggle_running */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setIsRunning(prev => !prev)}
          className={isRunning
            ? "flex-1 py-2 text-xs font-semibold rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            : `flex-1 py-2 text-xs font-semibold rounded-xl text-white transition-colors ${btnBg}`
          }
        >
          {isRunning ? '⏸ 일시정지' : '▶ 시작'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-2 text-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors leading-none"
          title="초기화"
        >
          ↺
        </button>
      </div>

      {/* 완료된 포모도로 수 (🍅 이모지로 표시) */}
      {/* Python으로 치면: print('🍅' * completed_count) */}
      <div className="flex items-center justify-center flex-wrap gap-0.5 min-h-5">
        {completedCount === 0 ? (
          <span className="text-xs text-gray-300">완료된 포모도로 없음</span>
        ) : (
          <>
            {Array.from({ length: Math.min(completedCount, 8) }).map((_, i) => (
              <span key={i} className="text-sm leading-none">🍅</span>
            ))}
            {completedCount > 8 && (
              <span className="text-xs text-gray-400 ml-0.5">+{completedCount - 8}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
