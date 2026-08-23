'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import {
  plannerApi,
  type PlannerRecoveryAudit,
  type PlannerRecoveryBackupResult,
} from '@/lib/api'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PlannerRecoveryPanel() {
  const t = useLocale()
  const labels = t.settings.vaultFeatures.plannerRecovery
  const [audit, setAudit] = useState<PlannerRecoveryAudit | null>(null)
  const [backup, setBackup] = useState<PlannerRecoveryBackupResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState('')

  async function loadAudit() {
    setLoading(true)
    setError('')
    try {
      setAudit(await plannerApi.getRecoveryAudit())
    } catch {
      setError(labels.loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAudit()
    // 설정 탭 최초 진입 시 한 번만 읽기 전용 진단을 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const riskyVaults = useMemo(() => audit?.vaults.filter(vault => (
    vault.plannerMode === 'daily'
    && (!vault.scheduleHomeFound || vault.scheduleHomePlannerBlocks === 0)
    && (vault.eventCount > 0 || audit.totals.liveEventOccurrences > 0)
  )) ?? [], [audit])

  async function createBackup() {
    if (!window.confirm(labels.backupConfirm)) return
    setBackingUp(true)
    try {
      const result = await plannerApi.createRecoveryBackup()
      setBackup(result)
      toast.success(labels.backupSuccess)
    } catch {
      toast.error(labels.backupError)
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <section className="rounded-xl border border-orange-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-gray-800">🛟 {labels.title}</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAudit()}
            disabled={loading || backingUp}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? labels.scanning : labels.refresh}
          </button>
          <button
            type="button"
            onClick={() => void createBackup()}
            disabled={loading || backingUp || !audit}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {backingUp ? labels.backingUp : labels.createBackup}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {audit && <>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-orange-50 px-3 py-2">
            <p className="text-[10px] text-orange-600">{labels.uniqueEvents}</p>
            <p className="mt-0.5 text-lg font-semibold text-orange-800">{audit.totals.uniqueEventCount}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] text-gray-500">{labels.sources}</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-700">{audit.totals.sourceCount}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] text-gray-500">{labels.duplicates}</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-700">{audit.totals.duplicateOccurrences}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${audit.totals.errorCount ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className={`text-[10px] ${audit.totals.errorCount ? 'text-red-500' : 'text-emerald-600'}`}>{labels.errors}</p>
            <p className={`mt-0.5 text-lg font-semibold ${audit.totals.errorCount ? 'text-red-700' : 'text-emerald-700'}`}>{audit.totals.errorCount}</p>
          </div>
        </div>

        {riskyVaults.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            <p className="font-semibold">{labels.homeGapTitle}</p>
            <p>{labels.homeGapDescription}</p>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {audit.vaults.map(vault => (
            <div key={vault.vaultName} className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-semibold text-gray-700">{vault.vaultName}</p>
                <p className="shrink-0 text-[10px] text-gray-400">
                  {labels.vaultSummary
                    .replace('{events}', String(vault.eventCount + vault.archiveEventCount))
                    .replace('{blocks}', String(vault.plannerBlockCount))}
                </p>
              </div>
              {vault.plannerMode === 'daily' && vault.scheduleHomePlannerBlocks === 0 && (
                <p className="mt-1 text-[10px] text-amber-600">{labels.homeEmpty}</p>
              )}
            </div>
          ))}
        </div>

        <details className="mt-3 rounded-lg border border-gray-100 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-gray-600">{labels.sourceDetails}</summary>
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
            {audit.sources.map(source => (
              <div key={`${source.vaultName}:${source.pageId}:${source.blockId}`} className="flex items-start justify-between gap-3 rounded-md bg-gray-50 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-gray-700">{source.vaultName} · {source.pageTitle || labels.untitled}</p>
                  <p className="text-[9px] text-gray-400">{source.schema} · {source.firstDate ?? '—'} ~ {source.lastDate ?? '—'}</p>
                </div>
                <span className="shrink-0 text-[10px] font-medium text-gray-500">{source.eventCount}</span>
              </div>
            ))}
          </div>
        </details>
      </>}

      {backup && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <p className="font-semibold">{labels.backupVerified}</p>
          <p className="mt-0.5 break-all text-[10px]">{backup.backupFile} · {backup.fileCount} files · {formatBytes(backup.sizeBytes)}</p>
          <p className="mt-0.5 break-all font-mono text-[9px] opacity-70">SHA-256 {backup.sha256}</p>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-4 text-gray-400">{labels.safety}</p>
    </section>
  )
}
