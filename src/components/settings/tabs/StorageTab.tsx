// =============================================
// src/components/settings/tabs/StorageTab.tsx
// 역할: 저장 위치 탭 — vault 경로 표시 + 사용자 지정 변경
// Python으로 치면: class StorageSettings(SettingsTab): def render_vault_info(): ...
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { useLocale } from '@/locales'

const BASE_URL = 'http://localhost:8000'

// vault 정보 응답 타입
// Python으로 치면: @dataclass class VaultInfo: vault_path: str; total_pages: int; ...
interface VaultInfo {
  vault_path: string
  total_pages: number
  total_size_kb: number
  categories: number
}

// 경로 변경 결과 타입
// Python으로 치면: @dataclass class ChangeResult: ok: bool; new_path: str; moved: bool; ...
interface ChangeResult {
  ok: boolean
  new_path: string
  moved: boolean
  requires_restart: boolean
}

export default function StorageTab() {
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // vault 정보 상태
  // Python으로 치면: self.vault_info = None
  const [info, setInfo] = useState<VaultInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 경로 변경 폼 상태
  // Python으로 치면: self.new_path = ''; self.move_data = True
  const [newPath, setNewPath] = useState('')
  const [moveData, setMoveData] = useState(true)
  const [changing, setChanging] = useState(false)
  const [changeError, setChangeError] = useState('')
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null)

  // 컴포넌트 마운트 시 vault 정보 조회
  // Python으로 치면: def on_mount(self): self.vault_info = fetch_vault_info()
  useEffect(() => {
    fetch(`${BASE_URL}/api/settings/vault-path`)
      .then(r => r.json())
      .then(data => {
        setInfo(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  // 경로를 클립보드에 복사
  // Python으로 치면: def copy_to_clipboard(self, text): pyperclip.copy(text)
  function copyPath() {
    if (info?.vault_path) {
      navigator.clipboard.writeText(info.vault_path)
        .catch(() => {/* noop */})
    }
  }

  // Windows 탐색기 폴더 선택 다이얼로그 호출
  // Python으로 치면: async def browse(self): path = await api.get('/settings/browse-folder')
  async function handleBrowse() {
    try {
      const res = await fetch(`${BASE_URL}/api/settings/browse-folder`)
      const data = await res.json()
      if (data.path) {
        setNewPath(data.path)
        setChangeError('')
      }
    } catch {
      setChangeError(t.settings.storage.errorBrowse)
    }
  }

  // vault 경로 변경 요청
  // Python으로 치면: async def handle_change_path(self): await api.post('/settings/vault-path', ...)
  async function handleChangePath() {
    if (!newPath.trim()) {
      setChangeError(t.settings.storage.errorEmpty)
      return
    }
    setChanging(true)
    setChangeError('')
    setChangeResult(null)
    try {
      const res = await fetch(`${BASE_URL}/api/settings/vault-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: newPath.trim(), move_data: moveData }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setChangeError(body.detail ?? t.common.error)
        return
      }
      const result: ChangeResult = await res.json()
      setChangeResult(result)
      setNewPath('')
    } catch {
      setChangeError(t.settings.storage.errorServer)
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.storage.title}</h3>
        <p className="text-xs text-gray-400 mb-6">
          {t.settings.storage.titleDesc}
        </p>
      </div>

      {/* 로딩 중 */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <span className="animate-spin">⟳</span> {t.settings.storage.loading}
        </div>
      )}

      {/* 서버 연결 오류 */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
          {t.settings.storage.serverError}
        </div>
      )}

      {info && (
        <>
          {/* ── vault 현재 경로 ──────────────────────── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.storage.currentPath}</h4>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
              <span className="text-lg">📁</span>
              <p className="flex-1 text-sm text-gray-700 font-mono break-all">{info.vault_path}</p>
              <button
                type="button"
                onClick={copyPath}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
                title={t.settings.storage.copyPathTitle}
              >
                {t.settings.storage.copy}
              </button>
            </div>
          </section>

          {/* ── 사용 현황 통계 ──────────────────────── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.storage.usage}</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-blue-600">{info.total_pages}</p>
                <p className="text-xs text-gray-500 mt-1">{t.settings.storage.totalPages}</p>
              </div>
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-green-600">{info.categories}</p>
                <p className="text-xs text-gray-500 mt-1">{t.settings.storage.categories}</p>
              </div>
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {info.total_size_kb < 1024
                    ? `${info.total_size_kb}KB`
                    : `${(info.total_size_kb / 1024).toFixed(1)}MB`}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t.settings.storage.totalSize}</p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── vault 경로 변경 ──────────────────────────
          서버 응답과 무관하게 항상 표시 (서버 오류일 때도 경로 변경 가능하도록)
          Python으로 치면: class ChangePathSection(Widget): def render(): ... */}
      {!error && !loading && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.storage.changePath}</h4>

          {/* 경로 변경 성공 결과 박스 */}
          {changeResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-green-700">{t.settings.storage.pathChangedMsg}</p>
              <p className="text-xs text-green-600 font-mono break-all">{changeResult.new_path}</p>
              {changeResult.moved && (
                <p className="text-xs text-green-600">{t.settings.storage.dataMoved}</p>
              )}
              <p className="text-xs text-orange-600 font-semibold mt-1">
                {t.settings.storage.restartWarning}
              </p>
            </div>
          )}

          {/* 새 경로 입력 + 탐색기 버튼 */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500">{t.settings.storage.newPathLabel}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPath}
                onChange={e => { setNewPath(e.target.value); setChangeError('') }}
                placeholder={t.settings.storage.newPathPlaceholder}
                className="flex-1 text-sm font-mono border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white"
              />
              {/* 탐색기 버튼 — 클릭 시 tkinter 폴더 선택 다이얼로그 오픈 */}
              <button
                type="button"
                onClick={handleBrowse}
                className="shrink-0 px-3 py-2 text-xs text-gray-600 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
                title={t.settings.storage.browseTitle}
              >
                {t.settings.storage.browse}
              </button>
            </div>
          </div>

          {/* 기존 데이터 복사 체크박스 */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={moveData}
              onChange={e => setMoveData(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-xs text-gray-600">{t.settings.storage.moveDataLabel}</span>
          </label>

          {/* 재시작 경고 */}
          <p className="text-xs text-orange-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
            {t.settings.storage.pathChangeWarning}
          </p>

          {/* 에러 메시지 */}
          {changeError && (
            <p className="text-xs text-red-500">{changeError}</p>
          )}

          {/* 변경 적용 버튼 */}
          <button
            type="button"
            onClick={handleChangePath}
            disabled={changing || !newPath.trim()}
            className="px-4 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changing ? t.settings.storage.processing : t.settings.storage.changeApply}
          </button>
        </section>
      )}
    </div>
  )
}
