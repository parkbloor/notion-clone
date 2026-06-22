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
  // updater 내부에서 다른 setState 호출 금지 → 0 감지는 별도 effect로 분리
  // Python으로 치면: while True: time.sleep(1); self.seconds_left -= 1
  // -----------------------------------------------
  useEffect(() => {
    if (!isRunning) return

    intervalRef.current = setInterval(() => {
      // setSecondsLeft updater는 순수하게 값만 감소 — 다른 setState 호출 금지
      setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    // cleanup: isRunning 변경 시 이전 interval 제거
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  // -----------------------------------------------
  // 단계 전환 감지 — secondsLeft가 0이 되면 다음 단계로
  // updater 밖에서 처리하므로 React StrictMode 이중 실행 문제 없음
  // Python으로 치면: if self.seconds_left == 0: self.next_phase()
  // -----------------------------------------------
  useEffect(() => {
    if (!isRunning || secondsLeft !== 0) return

    // 브라우저 title 알림 (알림 권한 없이도 동작)
    if (typeof window !== 'undefined') {
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
  }, [isRunning, secondsLeft])

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

  // -----------------------------------------------
  // 최소화 상태: 작은 알약형 버튼
  // Python으로 치면: if self.minimized: render_pill_button()
  // -----------------------------------------------
  if (minimized) {
    return (
      <div className="fixed bottom-12 right-14 z-40 print-hide">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md text-xs transition-all"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-strong)", color: "var(--color-text-muted)" }}
          title="포모도로 타이머 열기"
        >
          <span>🍅</span>
          <span className="font-mono" style={{ color: isRunning ? "var(--color-warn)" : "var(--color-text-muted)" }}>
            {fmtTime(secondsLeft)}
          </span>
          {isRunning && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-warn)" }} />}
        </button>
      </div>
    )
  }

  // -----------------------------------------------
  // 전체 위젯
  // Python으로 치면: class PomodoroUI(QWidget): def render(self): ...
  // -----------------------------------------------
  return (
    <div className="fixed bottom-12 right-14 z-40 w-52 rounded-xl shadow-xl p-4 select-none print-hide"
         style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 10px 30px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🍅</span>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Pomodoro</span>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="icon-btn w-5 h-5 text-xs"
          title="최소화"
        >
          −
        </button>
      </div>

      {/* 단계 탭 (집중 / 휴식) */}
      <div className="flex gap-1 mb-3" style={{ background: "var(--color-sunken)", borderRadius: 6, padding: 2 }}>
        <button
          type="button"
          onClick={() => switchPhase('work')}
          className="flex-1 py-1 text-xs rounded-md font-medium transition-colors"
          style={phase === 'work'
            ? { background: "var(--color-surface)", color: "var(--color-warn)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: "var(--color-text-muted)" }}
        >
          집중
        </button>
        <button
          type="button"
          onClick={() => switchPhase('break')}
          className="flex-1 py-1 text-xs rounded-md font-medium transition-colors"
          style={phase === 'break'
            ? { background: "var(--color-surface)", color: "var(--color-accent-ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: "var(--color-text-muted)" }}
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
              stroke="var(--color-sunken)"
              strokeWidth="2.5"
            />
            {/* 진행 원 — accent 계열 색상 */}
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeDasharray={`${progress} 100`}
              strokeLinecap="round"
              style={{ transitionProperty: 'stroke-dasharray', transitionDuration: '0.5s', transitionTimingFunction: 'ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold font-mono tabular-nums" style={{ color: "var(--color-text)" }}>
              {fmtTime(secondsLeft)}
            </span>
          </div>
        </div>
      </div>

      {/* 컨트롤 버튼 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setIsRunning(prev => !prev)}
          className="flex-1 py-2 text-xs font-semibold rounded-lg transition-colors"
          style={isRunning
            ? { background: "var(--color-sunken)", color: "var(--color-text-muted)" }
            : { background: "var(--color-accent)", color: "#fff" }}
        >
          {isRunning ? '⏸ 일시정지' : '▶ 시작'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="icon-btn px-3 py-2 h-auto text-lg leading-none rounded-lg"
          title="초기화"
        >
          ↺
        </button>
      </div>

      {/* 완료된 포모도로 수 */}
      <div className="flex items-center justify-center flex-wrap gap-0.5 min-h-5">
        {completedCount === 0 ? (
          <span className="text-xs" style={{ color: "var(--color-text-faint)" }}>완료된 포모도로 없음</span>
        ) : (
          <>
            {Array.from({ length: Math.min(completedCount, 8) }).map((_, i) => (
              <span key={i} className="text-sm leading-none">🍅</span>
            ))}
            {completedCount > 8 && (
              <span className="text-xs ml-0.5" style={{ color: "var(--color-text-subtle)" }}>+{completedCount - 8}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
