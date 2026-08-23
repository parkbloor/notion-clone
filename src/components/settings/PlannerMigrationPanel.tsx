'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { plannerApi } from '@/lib/api'
import { plannerStoreApi, type PlannerMigrationPreview, type PlannerMigrationResult } from '@/lib/plannerStore'

export default function PlannerMigrationPanel() {
  const labels = useLocale().settings.vaultFeatures.plannerMigration
  const [vaults, setVaults] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<PlannerMigrationPreview | null>(null)
  const [result, setResult] = useState<PlannerMigrationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    void plannerApi.getRecoveryAudit().then(audit => {
      const names = audit.vaults.map(vault => vault.vaultName)
      setVaults(names)
      setSelected(names)
    }).catch(() => toast.error(labels.loadError)).finally(() => setLoading(false))
  }, [labels.loadError])

  function toggleVault(vaultName: string) {
    setSelected(current => current.includes(vaultName) ? current.filter(name => name !== vaultName) : [...current, vaultName])
    setPreview(null)
    setResult(null)
  }

  async function makePreview() {
    setLoading(true)
    setResult(null)
    try {
      setPreview(await plannerStoreApi.previewMigration(selected))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.previewError)
    } finally {
      setLoading(false)
    }
  }

  async function migrate() {
    if (!preview || !window.confirm(labels.confirm)) return
    setMigrating(true)
    try {
      const migrated = await plannerStoreApi.executeMigration(preview)
      setResult(migrated)
      toast.success(labels.success)
      setPreview(await plannerStoreApi.previewMigration(selected))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.executeError)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-gray-800">{labels.title}</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500">{labels.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {vaults.map(vaultName => (
          <label key={vaultName} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={selected.includes(vaultName)} onChange={() => toggleVault(vaultName)} />
            {vaultName}
          </label>
        ))}
      </div>
      <button type="button" disabled={loading || migrating || selected.length === 0} onClick={() => void makePreview()}
        className="mt-3 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
        {loading ? labels.previewing : labels.preview}
      </button>
      {preview && <div className="mt-3 rounded-lg bg-violet-50 px-3 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <p className="text-xs text-violet-800">{labels.uniqueEvents} <b>{preview.totals.uniqueEvents}</b></p>
          <p className="text-xs text-violet-800">{labels.duplicates} <b>{preview.totals.duplicateEvents}</b></p>
          <p className="text-xs text-violet-800">{labels.conflicts} <b>{preview.totals.eventConflicts + preview.totals.reviewConflicts}</b></p>
          <p className="text-xs text-violet-800">{labels.reviews} <b>{preview.totals.uniqueReviews}</b></p>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-violet-700">
          <p>{labels.target.replace('{vault}', preview.targetVaultName ?? labels.notConfigured)}</p>
          <p>{preview.backup ? labels.backupReady.replace('{file}', preview.backup.backupFile) : labels.backupRequired}</p>
        </div>
        {preview.conflicts.length > 0 && <details className="mt-2 rounded border border-violet-200 bg-white px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-violet-700">{labels.conflictDetails}</summary>
          <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {preview.conflicts.map(conflict => <p key={`${conflict.kind}:${conflict.key}`} className="break-all text-[10px] text-gray-500">
              {conflict.kind} · {conflict.key} · {conflict.occurrenceCount} · {conflict.sourceFile}
            </p>)}
          </div>
        </details>}
        <button type="button" disabled={!preview.readyToMigrate || migrating} onClick={() => void migrate()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          <ArrowRight className="h-3.5 w-3.5" />{migrating ? labels.migrating : labels.execute}
        </button>
      </div>}
      {result && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        {labels.result.replace('{events}', String(result.importedEvents)).replace('{reviews}', String(result.importedReviews))}
      </p>}
      <p className="mt-3 text-[10px] leading-4 text-gray-400">{labels.safety}</p>
    </section>
  )
}
