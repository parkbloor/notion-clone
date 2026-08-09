'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { usePageStore } from '@/store/pageStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import type { VaultPlannerFeatures } from '@/lib/api'

export default function VaultFeaturesTab() {
  const t = useLocale()
  const currentVaultName = usePageStore(state => state.currentVaultName)
  const { preferences, loading, loadForVault, setPlannerFeature } = useVaultPreferencesStore()

  useEffect(() => {
    if (currentVaultName) void loadForVault(currentVaultName)
  }, [currentVaultName, loadForVault])

  const items: Array<{
    key: keyof VaultPlannerFeatures
    label: string
    description: string
  }> = [
    {
      key: 'todayShortcut',
      label: t.settings.vaultFeatures.todayShortcut,
      description: t.settings.vaultFeatures.todayShortcutDesc,
    },
    {
      key: 'planMenu',
      label: t.settings.vaultFeatures.planMenu,
      description: t.settings.vaultFeatures.planMenuDesc,
    },
    {
      key: 'reviews',
      label: t.settings.vaultFeatures.reviews,
      description: t.settings.vaultFeatures.reviewsDesc,
    },
    {
      key: 'calendar',
      label: t.settings.vaultFeatures.calendar,
      description: t.settings.vaultFeatures.calendarDesc,
    },
    {
      key: 'timeline',
      label: t.settings.vaultFeatures.timeline,
      description: t.settings.vaultFeatures.timelineDesc,
    },
    {
      key: 'routines',
      label: t.settings.vaultFeatures.routines,
      description: t.settings.vaultFeatures.routinesDesc,
    },
    {
      key: 'slashPlannerBlocks',
      label: t.settings.vaultFeatures.slashPlannerBlocks,
      description: t.settings.vaultFeatures.slashPlannerBlocksDesc,
    },
  ]

  async function toggleFeature(key: keyof VaultPlannerFeatures) {
    try {
      await setPlannerFeature(key, !preferences.planner[key])
      toast.success(t.settings.vaultFeatures.saved)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{t.settings.vaultFeatures.title}</h3>
        <p className="mt-1 text-xs text-gray-400">{t.settings.vaultFeatures.description}</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-semibold text-amber-800">
          {currentVaultName || t.settings.vaultFeatures.currentVault}
        </p>
        <p className="mt-1 text-[11px] text-amber-700">
          {t.settings.vaultFeatures.dataSafety}
        </p>
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {items.map(item => {
          const enabled = preferences.planner[item.key]
          return (
            <div key={item.key} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-gray-400">{item.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={item.label}
                disabled={loading || !currentVaultName}
                onClick={() => void toggleFeature(item.key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  enabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
