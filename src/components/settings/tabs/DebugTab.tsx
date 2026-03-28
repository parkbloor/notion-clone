// =============================================
// src/components/settings/tabs/DebugTab.tsx
// 역할: 디버그 로그 탭 — 백엔드 로그 조회 및 복사
// Python으로 치면: class DebugSettings(SettingsTab): def render_log_viewer(): ...
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocale } from '@/locales'

const BASE_URL = 'http://localhost:8000'

interface LogEntry {
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG'
  time: string    // ISO 문자열
  message: string
  logger: string
}

// 로그 레벨별 색상
// Python으로 치면: LOG_COLORS = {'INFO': 'gray', 'WARNING': 'yellow', 'ERROR': 'red', 'DEBUG': 'blue'}
const levelStyle: Record<string, string> = {
  DEBUG:   'text-blue-500',
  INFO:    'text-gray-400',
  WARNING: 'text-yellow-600',
  ERROR:   'text-red-500',
}

export default function DebugTab() {
  // 로케일 훅 — Python으로 치면: t = get_translation()
  const t = useLocale()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const logBoxRef = useRef<HTMLDivElement>(null)

  // 로그 불러오기
  // Python으로 치면: def fetch_logs(self): self.logs = requests.get('/api/debug/logs').json()
  function fetchLogs() {
    setLoading(true)
    setError(false)
    fetch(`${BASE_URL}/api/debug/logs`)
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs ?? [])
        setLoading(false)
        // 스크롤을 맨 아래로
        setTimeout(() => {
          if (logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
          }
        }, 50)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  // 컴포넌트 마운트 시 로그 자동 로드
  useEffect(() => { fetchLogs() }, [])

  // 전체 로그를 클립보드에 복사
  // Python으로 치면: def copy_logs(self): pyperclip.copy('\n'.join(self.logs))
  function copyLogs() {
    const text = logs
      .map(l => `[${l.time}] [${l.level}] ${l.logger}: ${l.message}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="p-6 flex flex-col h-full gap-4">
      {/* 헤더 + 버튼들 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{t.settings.debug.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t.settings.debug.titleDesc}</p>
        </div>
        <div className="flex gap-2">
          {/* 새로고침 버튼 */}
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? `⟳ ${t.settings.debug.loading}` : `⟳ ${t.settings.debug.refresh}`}
          </button>
          {/* 복사 버튼 */}
          <button
            type="button"
            onClick={copyLogs}
            disabled={logs.length === 0}
            className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {copied ? `✓ ${t.settings.debug.copied}` : `📋 ${t.settings.debug.copyAll}`}
          </button>
        </div>
      </div>

      {/* 에러 상태 */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
          {t.settings.storage.serverError}
        </div>
      )}

      {/* 로그 박스 */}
      <div
        ref={logBoxRef}
        className="flex-1 overflow-y-auto font-mono text-xs bg-gray-950 text-gray-300 rounded-xl p-3 space-y-0.5 min-h-0"
        style={{ maxHeight: '280px' }}
      >
        {loading && (
          <p className="text-gray-500 py-4 text-center">{t.settings.debug.loadingLogs}</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="text-gray-500 py-4 text-center">{t.settings.debug.noLogs}</p>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            {/* 시간 */}
            <span className="text-gray-600 shrink-0">
              {log.time.slice(11, 19)}
            </span>
            {/* 레벨 */}
            <span className={`shrink-0 w-14 ${levelStyle[log.level] ?? 'text-gray-400'}`}>
              [{log.level}]
            </span>
            {/* 로거 이름 */}
            <span className="text-gray-500 shrink-0 max-w-25 truncate">{log.logger}</span>
            {/* 메시지 */}
            <span className="text-gray-200 break-all">{log.message}</span>
          </div>
        ))}
      </div>

      {/* 로그 수 표시 */}
      <p className="text-xs text-gray-400 text-right">
        {t.settings.debug.totalItems.replace('{count}', String(logs.length))}
      </p>
    </div>
  )
}
