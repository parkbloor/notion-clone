// =============================================
// src/components/settings/tabs/StorageTab.tsx
// 역할: 저장 위치 탭 — vault 경로 표시 및 정보
// Python으로 치면: class StorageSettings(SettingsTab): def render_vault_info(): ...
// =============================================

'use client'

import { useState, useEffect } from 'react'

const BASE_URL = 'http://localhost:8000'

interface VaultInfo {
  vault_path: string
  total_pages: number
  total_size_kb: number
  categories: number
}

export default function StorageTab() {
  // vault 정보 상태
  // Python으로 치면: self.vault_info = None
  const [info, setInfo] = useState<VaultInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">저장 위치</h3>
        <p className="text-xs text-gray-400 mb-6">
          데이터가 저장되는 vault 폴더의 위치와 사용 현황을 확인합니다
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <span className="animate-spin">⟳</span> 정보를 불러오는 중...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
          백엔드 서버에 연결할 수 없습니다 (localhost:8000)
        </div>
      )}

      {info && (
        <>
          {/* vault 경로 */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vault 경로</h4>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
              <span className="text-lg">📁</span>
              <p className="flex-1 text-sm text-gray-700 font-mono break-all">{info.vault_path}</p>
              <button
                type="button"
                onClick={copyPath}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
                title="경로 복사"
              >
                복사
              </button>
            </div>
            <p className="text-xs text-gray-400 px-1">
              경로 변경 기능은 준비 중입니다
            </p>
          </section>

          {/* 통계 */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">사용 현황</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-blue-600">{info.total_pages}</p>
                <p className="text-xs text-gray-500 mt-1">총 페이지</p>
              </div>
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-green-600">{info.categories}</p>
                <p className="text-xs text-gray-500 mt-1">카테고리</p>
              </div>
              <div className="px-4 py-4 rounded-xl border border-gray-200 bg-white text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {info.total_size_kb < 1024
                    ? `${info.total_size_kb}KB`
                    : `${(info.total_size_kb / 1024).toFixed(1)}MB`}
                </p>
                <p className="text-xs text-gray-500 mt-1">저장 용량</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
