'use client'
// ==============================================
// StorageTab.tsx
// 역할: 멀티 볼트 관리 UI
//   - vaults_root 하위 폴더 자동 스캔 (설정 탭 열릴 때마다)
//   - 볼트 목록 표시 + 전환 (재시작 없이 즉시)
//   - 탐색기에서 만든 폴더도 자동 인식
//   - 고급: 데이터 복사 포함 경로 변경
// Python으로 치면: class StorageSettingsView(QWidget): ...
// ==============================================

import { useEffect, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'

// Windows에서 localhost가 IPv6(::1)로 해석되는 문제 방지 — api.ts와 동일하게 127.0.0.1 사용
const BASE_URL = 'http://127.0.0.1:8000'

declare global {
  interface Window {
    electronAPI?: {
      getVersion?: () => Promise<string>
      selectFolder?: () => Promise<string | null>
      openExternalUrl?: (url: string) => Promise<boolean>
      startImageDrag?: (payload: { url: string; name: string }) => void
    }
  }
}

// 볼트 정보 타입
// Python으로 치면: @dataclass class VaultInfo: name, path, page_count, initialized, is_current
interface VaultEntry {
  name: string
  path: string
  page_count: number
  initialized: boolean
  is_current: boolean
}

interface VaultInfo {
  vaults_root: string
  current_vault: string
  current_vault_path: string
  total_pages: number
  categories: number
  total_size_kb: number
  vaults: VaultEntry[]
}

export default function StorageTab({ onClose }: { onClose?: () => void }) {
  const t = useLocale()
  const s = t.settings.storage

  // 볼트 정보 상태
  const [info, setInfo] = useState<VaultInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 볼트 전환 상태
  const [switching, setSwitching] = useState<string | null>(null)  // 전환 중인 볼트명
  const [switchMsg, setSwitchMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  // 새 볼트 생성 상태 — 생성만 하고 현재 볼트는 유지
  const [newVaultName, setNewVaultName] = useState('')
  const [creatingVault, setCreatingVault] = useState(false)
  const [createVaultMsg, setCreateVaultMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  // 볼트 폴더명 변경 상태
  const [renamingVault, setRenamingVault] = useState<string | null>(null)
  const [renameVaultName, setRenameVaultName] = useState('')
  const [renameVaultMsg, setRenameVaultMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  // vaults_root 변경 상태
  const [rootInput, setRootInput] = useState('')
  const [rootChanging, setRootChanging] = useState(false)
  const [rootMsg, setRootMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  // 고급: 데이터 복사 포함 경로 변경
  const [advPath, setAdvPath] = useState('')
  const [moveData, setMoveData] = useState(true)
  const [advChanging, setAdvChanging] = useState(false)
  const [advMsg, setAdvMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  const { resetStore, loadFromServer, setCurrentVaultName } = usePageStore()

  // 볼트 정보 로드 — 설정 탭 열릴 때마다 실행 (탐색기 폴더 자동 인식)
  // Python으로 치면: async def load_vault_info(self): self.info = await api.get('/vault-info')
  const loadInfo = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(BASE_URL + '/api/settings/vault-info')
      if (!res.ok) throw new Error()
      const data: VaultInfo = await res.json()
      setInfo(data)
      setRootInput(data.vaults_root)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadInfo() }, [])

  // 볼트 전환 — 백엔드 즉시 교체 + 프론트 상태 초기화 + 재fetch
  // Python으로 치면: async def switch_vault(name): api.post('/switch-vault', name); reload()
  const handleSwitch = async (vaultName: string) => {
    if (switching) return
    setSwitching(vaultName)
    setSwitchMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/switch-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_name: vaultName }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSwitchMsg({ type: 'error', text: err.detail ?? s.errorServer })
        return
      }
      // 프론트 상태 초기화 → 새 볼트 데이터 fetch
      resetStore()
      await loadFromServer()
      await loadInfo()  // 볼트 목록 갱신
      setSwitchMsg({ type: 'ok', text: `"${vaultName}" ${s.switchedMsg}` })
      // 0.8초 후 모달 닫기 — 성공 메시지 잠깐 보여준 뒤 사이드바/에디터 노출
      setTimeout(() => onClose?.(), 800)
    } catch {
      setSwitchMsg({ type: 'error', text: s.errorServer })
    } finally {
      setSwitching(null)
    }
  }

  // 새 볼트 폴더 생성 — 삭제 기능은 의도적으로 제공하지 않음
  // Python으로 치면: async def create_vault(name): api.post('/settings/vaults', name)
  const handleCreateVault = async () => {
    const vaultName = newVaultName.trim()
    if (!vaultName) {
      setCreateVaultMsg({ type: 'error', text: s.createVaultEmpty })
      return
    }

    setCreatingVault(true)
    setCreateVaultMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_name: vaultName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateVaultMsg({ type: 'error', text: err.detail ?? s.errorServer })
        return
      }

      setNewVaultName('')
      await loadInfo()
      setCreateVaultMsg({ type: 'ok', text: s.createVaultSuccess })
    } catch {
      setCreateVaultMsg({ type: 'error', text: s.errorServer })
    } finally {
      setCreatingVault(false)
    }
  }

  // 볼트 폴더명 변경 시작
  // Python으로 치면: def start_rename(vault): self.rename_value = vault.name
  const startRenameVault = (vaultName: string) => {
    setRenamingVault(vaultName)
    setRenameVaultName(vaultName)
    setRenameVaultMsg(null)
  }

  // 볼트 폴더명 변경 저장 — 현재 볼트라면 사이드바 이름도 즉시 갱신
  // Python으로 치면: async def rename_vault(old, new): api.patch(...)
  const handleRenameVault = async (oldName: string) => {
    const newName = renameVaultName.trim()
    if (!newName) {
      setRenameVaultMsg({ type: 'error', text: s.renameVaultEmpty })
      return
    }

    setRenameVaultMsg(null)
    try {
      const res = await fetch(BASE_URL + `/api/settings/vaults/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRenameVaultMsg({ type: 'error', text: err.detail ?? s.errorServer })
        return
      }

      const result: { vault_name: string; was_current: boolean } = await res.json()
      if (result.was_current) setCurrentVaultName(result.vault_name)
      setRenamingVault(null)
      setRenameVaultName('')
      await loadInfo()
      setRenameVaultMsg({ type: 'ok', text: s.renameVaultSuccess })
    } catch {
      setRenameVaultMsg({ type: 'error', text: s.errorServer })
    }
  }

  // vaults_root 변경
  const handleRootChange = async () => {
    if (!rootInput.trim()) return
    setRootChanging(true)
    setRootMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/vaults-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaults_root: rootInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        setRootMsg({ type: 'error', text: err.detail ?? s.errorServer })
        return
      }
      // vaults_root 변경 후 스토어 재초기화 — 새 루트에 현재 볼트가 없을 수 있으므로 반드시 재로드
      resetStore()
      await loadFromServer()
      await loadInfo()
      setRootMsg({ type: 'ok', text: s.rootChangedMsg })
    } catch {
      setRootMsg({ type: 'error', text: s.errorServer })
    } finally {
      setRootChanging(false)
    }
  }

  // 폴더 탐색기 열기 — res.ok 체크 추가 (오류 응답 시 setter 호출 방지)
  // Python으로 치면: def browse(setter): path = api.browse(); if path: setter(path)
  const handleBrowse = async (setter: (v: string) => void) => {
    try {
      const electronPath = await window.electronAPI?.selectFolder?.()
      if (electronPath) {
        setter(electronPath)
        return
      }

      const res = await fetch(BASE_URL + '/api/settings/browse-folder')
      if (!res.ok) return
      const data = await res.json()
      if (data.path) setter(data.path)
    } catch {}
  }

  // 고급: 데이터 복사 포함 경로 변경
  const handleAdvChange = async () => {
    if (!advPath.trim()) return
    setAdvChanging(true)
    setAdvMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/vault-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: advPath.trim(), move_data: moveData }),
      })
      if (!res.ok) {
        const err = await res.json()
        setAdvMsg({ type: 'error', text: err.detail ?? s.errorServer })
        return
      }
      const result = await res.json()
      resetStore()
      await loadFromServer()
      await loadInfo()
      setAdvMsg({
        type: 'ok',
        text: result.moved ? s.pathChangedWithCopy : s.pathChangedMsg,
      })
    } catch {
      setAdvMsg({ type: 'error', text: s.errorServer })
    } finally {
      setAdvChanging(false)
    }
  }

  // 볼트 스캔 상태 — 탐색기에서 넣은 메모 폴더 인식용
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)
  const [integrityChecking, setIntegrityChecking] = useState(false)
  const [integrityMsg, setIntegrityMsg] = useState<{ type: 'ok' | 'error', text: string } | null>(null)

  // 볼트 스캔 — 현재 볼트의 미인식 page 폴더를 찾아 _index.nct에 추가
  // Python으로 치면: async def scan(): api.post('/scan-vault'); reload()
  const handleScan = async () => {
    if (scanning) return
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/scan-vault', { method: 'POST' })
      if (!res.ok) {
        setScanMsg({ type: 'error', text: s.errorServer })
        return
      }
      const data = await res.json()
      // 인식된 페이지가 있으면 스토어 새로고침
      if (data.added > 0) {
        await loadFromServer()
        await loadInfo()
        setScanMsg({ type: 'ok', text: s.scanDoneAdded(data.added) })
      } else {
        setScanMsg({ type: 'ok', text: s.scanDoneNone })
      }
    } catch {
      setScanMsg({ type: 'error', text: s.errorServer })
    } finally {
      setScanning(false)
    }
  }

  // 전체 페이지·이미지 경로를 점검한다. 오류는 볼트의 _logs에도 영구 기록된다.
  const handleIntegrityCheck = async () => {
    if (integrityChecking) return
    setIntegrityChecking(true)
    setIntegrityMsg(null)
    try {
      const res = await fetch(BASE_URL + '/api/settings/check-integrity', { method: 'POST' })
      if (!res.ok) throw new Error('integrity check failed')
      const data = await res.json()
      const count = data.issues?.length ?? 0
      setIntegrityMsg(count === 0
        ? { type: 'ok', text: `점검 완료: 페이지 ${data.checkedPages}개, 이미지 ${data.checkedImages}개가 정상입니다.` }
        : { type: 'error', text: `점검 완료: 오류 ${count}개를 발견했습니다. _logs/operation_log.jsonl에서 확인할 수 있습니다.` })
    } catch {
      setIntegrityMsg({ type: 'error', text: '메모 점검을 실행하지 못했습니다. 백엔드 연결을 확인하세요.' })
    } finally {
      setIntegrityChecking(false)
    }
  }

  // 용량 단위 변환
  const formatSize = (kb: number) => {
    if (kb < 1024) return `${kb} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{s.title}</h3>
        <p className="text-xs text-gray-400 mb-6">{s.titleDesc}</p>
      </div>

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span className="animate-spin">⟳</span> {s.loading}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-500">{s.serverError}</div>
      )}

      {info && (
        <>
          {/* 현재 볼트 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-500 text-xs">●</span>
              <span className="text-sm font-semibold text-green-800">{info.current_vault}</span>
              <span className="text-xs text-green-600 ml-auto">{s.currentLabel}</span>
            </div>
            <div className="text-xs text-green-700 font-mono break-all">{info.current_vault_path}</div>
            <div className="flex gap-4 text-xs text-green-700">
              <span>{s.totalPages}: <strong>{info.total_pages}</strong></span>
              <span>{s.categories}: <strong>{info.categories}</strong></span>
              <span>{s.totalSize}: <strong>{formatSize(info.total_size_kb)}</strong></span>
            </div>
          </div>

          {/* 볼트 스캔 — 탐색기에서 넣은 메모 폴더 인식 */}
          <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">🔍 {s.scanVault}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.scanVaultDesc}</div>
              </div>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="text-xs px-3 py-1.5 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 shrink-0 ml-3"
              >
                {scanning ? s.scanning : s.scanVault}
              </button>
            </div>
            {scanMsg && (
              <div className={`text-xs px-2 py-1 rounded ${
                scanMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {scanMsg.text}
              </div>
            )}
          </div>

          <div className="border border-dashed border-amber-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">🛡️ 메모 무결성 점검</div>
                <div className="text-xs text-gray-400 mt-0.5">페이지·이미지 경로를 검사하고 오류를 영구 로그에 기록합니다.</div>
              </div>
              <button
                onClick={handleIntegrityCheck}
                disabled={integrityChecking}
                className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 shrink-0 ml-3"
              >
                {integrityChecking ? '점검 중...' : '메모 점검'}
              </button>
            </div>
            {integrityMsg && (
              <div className={`text-xs px-2 py-1 rounded ${
                integrityMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {integrityMsg.text}
              </div>
            )}
          </div>

          {/* 볼트 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.vaultList}</h4>
              <button
                onClick={loadInfo}
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                title={s.refreshList}
              >
                🔄 {s.refreshList}
              </button>
            </div>

            <div className="text-xs text-gray-400 mb-2">{s.vaultListHint}</div>

            <div className="flex gap-2 mb-2">
              <input
                value={newVaultName}
                onChange={e => setNewVaultName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateVault() }}
                disabled={creatingVault}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5"
                placeholder={s.createVaultPlaceholder}
              />
              <button
                onClick={handleCreateVault}
                disabled={creatingVault}
                className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 shrink-0"
              >
                {creatingVault ? s.creatingVault : s.createVault}
              </button>
            </div>

            {createVaultMsg && (
              <div className={`text-xs mb-2 px-2 py-1 rounded ${
                createVaultMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {createVaultMsg.text}
              </div>
            )}

            {renameVaultMsg && (
              <div className={`text-xs mb-2 px-2 py-1 rounded ${
                renameVaultMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {renameVaultMsg.text}
              </div>
            )}

            {switchMsg && (
              <div className={`text-xs mb-2 px-2 py-1 rounded ${
                switchMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {switchMsg.text}
              </div>
            )}

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {(info.vaults ?? []).map((vault) => (
                <div
                  key={vault.name}
                  className={`flex items-center px-3 py-2.5 gap-3 ${
                    vault.is_current ? 'bg-green-50' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm ${vault.is_current ? 'text-green-500' : 'text-gray-300'}`}>
                    {vault.is_current ? '●' : '○'}
                  </span>
                  {renamingVault === vault.name ? (
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      <input
                        autoFocus
                        value={renameVaultName}
                        onChange={e => setRenameVaultName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameVault(vault.name)
                          if (e.key === 'Escape') setRenamingVault(null)
                        }}
                        className="flex-1 min-w-0 text-xs border border-blue-300 rounded px-2 py-1"
                        aria-label={s.renameVaultPlaceholder}
                      />
                      <button
                        onClick={() => handleRenameVault(vault.name)}
                        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        {s.renameVaultSave}
                      </button>
                      <button
                        onClick={() => setRenamingVault(null)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                      >
                        {s.renameVaultCancel}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 truncate">{vault.name}</div>
                        <div className="text-xs text-gray-400">
                          {vault.initialized ? `${vault.page_count}${s.pageUnit}` : s.emptyVault}
                        </div>
                      </div>
                      <button
                        onClick={() => startRenameVault(vault.name)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 shrink-0"
                        title={s.renameVault}
                      >
                        ✏️
                      </button>
                      {!vault.is_current && (
                        <button
                          onClick={() => handleSwitch(vault.name)}
                          disabled={switching !== null}
                          className="text-xs px-2.5 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 shrink-0"
                        >
                          {switching === vault.name ? '...' : s.openVault}
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              {(info.vaults ?? []).length === 0 && (
                <div className="text-xs text-gray-400 px-3 py-4 text-center">{s.noVaults}</div>
              )}
            </div>

            <p className="text-xs text-blue-600 bg-blue-50 rounded p-2 mt-2">{s.explorerHint}</p>
          </div>

          {/* vaults_root 변경 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{s.vaultsRoot}</h4>
            <p className="text-xs text-gray-400 mb-2">{s.vaultsRootDesc}</p>
            {rootMsg && (
              <div className={`text-xs mb-2 px-2 py-1 rounded ${
                rootMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {rootMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 font-mono"
                placeholder={s.newPathPlaceholder}
              />
              <button
                onClick={() => handleBrowse(setRootInput)}
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded hover:bg-gray-50 shrink-0"
              >
                {s.browse}
              </button>
              <button
                onClick={handleRootChange}
                disabled={rootChanging}
                className="text-xs px-2.5 py-1.5 bg-gray-700 text-white rounded hover:bg-gray-900 disabled:opacity-50 shrink-0"
              >
                {rootChanging ? s.processing : s.changeApply}
              </button>
            </div>
          </div>

          {/* 고급 섹션 */}
          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
              {s.advancedSection} ›
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-400">{s.advancedDesc}</p>
              {advMsg && (
                <div className={`text-xs px-2 py-1 rounded ${
                  advMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
                }`}>
                  {advMsg.text}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={advPath}
                  onChange={e => setAdvPath(e.target.value)}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 font-mono"
                  placeholder={s.newPathPlaceholder}
                />
                <button
                  onClick={() => handleBrowse(setAdvPath)}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded hover:bg-gray-50 shrink-0"
                >
                  {s.browse}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveData}
                  onChange={e => setMoveData(e.target.checked)}
                  className="rounded"
                />
                {s.moveDataLabel}
              </label>
              <button
                onClick={handleAdvChange}
                disabled={advChanging}
                className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
              >
                {advChanging ? s.processing : s.changeApply}
              </button>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
