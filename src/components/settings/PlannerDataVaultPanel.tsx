'use client'

import { useCallback, useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { plannerStoreApi, type PlannerStoreStatus } from '@/lib/plannerStore'

export default function PlannerDataVaultPanel() {
  const t = useLocale()
  const labels = t.settings.vaultFeatures.plannerData
  const [status, setStatus] = useState<PlannerStoreStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await plannerStoreApi.getStatus())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.loadError)
    } finally {
      setLoading(false)
    }
  }, [labels.loadError])

  useEffect(() => { void load() }, [load])

  async function selectVault(value: string) {
    setLoading(true)
    try {
      await plannerStoreApi.updateConfig(value || null)
      setStatus(await plannerStoreApi.getStatus())
      toast.success(labels.saved)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.saveError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <label htmlFor="planner-data-vault" className="text-sm font-medium text-gray-700">{labels.title}</label>
          <p className="mt-0.5 text-xs leading-5 text-gray-400">{labels.description}</p>
          <select
            id="planner-data-vault"
            value={status?.plannerVaultName ?? ''}
            disabled={loading || !status}
            onChange={event => void selectVault(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{labels.notSet}</option>
            {status?.availableVaults.map(vaultName => <option key={vaultName} value={vaultName}>{vaultName}</option>)}
          </select>
          {status?.status === 'missing' && <p className="mt-2 text-xs text-red-500">{labels.missing}</p>}
          {status?.databaseReady && (
            <p className="mt-2 text-[11px] text-blue-700">
              {labels.ready.replace('{version}', String(status.schemaVersion ?? 1)).replace('{events}', String(status.eventCount))}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-5 text-amber-700">{labels.safety}</p>
        </div>
      </div>
    </div>
  )
}
