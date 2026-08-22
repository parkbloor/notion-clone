'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { usePageStore } from '@/store/pageStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import type { VaultPlannerFeatures } from '@/lib/api'

// mode·homePageId·dailyNoteTemplate은 스위치 목록이 아닌 플래너 역할 자체를 표현한다.
type PlannerToggleKey = Exclude<keyof VaultPlannerFeatures, 'mode' | 'homePageId' | 'dailyNoteTemplate' | 'dailyCustomTemplateId'>

export default function VaultFeaturesTab() {
  const t = useLocale()
  const { currentVaultName, currentPageId, pages } = usePageStore()
  const { preferences, loading, loadForVault, setPlannerFeature } = useVaultPreferencesStore()
  const isDailyPlannerVault = preferences.planner.mode === 'daily'
  const currentPage = pages.find(page => page.id === currentPageId) ?? null
  const homePage = pages.find(page => page.id === preferences.planner.homePageId) ?? null

  useEffect(() => {
    if (currentVaultName) void loadForVault(currentVaultName)
  }, [currentVaultName, loadForVault])

  const items: Array<{
    key: PlannerToggleKey
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

  async function toggleFeature(key: PlannerToggleKey) {
    try {
      await setPlannerFeature(key, !preferences.planner[key])
      toast.success(t.settings.vaultFeatures.saved)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  // 일간 플래너 역할을 켜도 메모나 블록을 자동으로 만들지 않는다.
  // Python으로 치면: await set_planner_feature('mode', 'daily' if enabled else 'off')
  async function togglePlannerMode() {
    try {
      await setPlannerFeature('mode', isDailyPlannerVault ? 'off' : 'daily')
      toast.success(t.settings.vaultFeatures.saved)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  // 현재 열린 메모만 일정 홈으로 연결한다. 제목 대신 ID를 써서 이름 변경에도 안전하다.
  // Python으로 치면: await set_planner_feature('homePageId', current_page_id)
  async function setHomePage(homePageId: string | null) {
    try {
      await setPlannerFeature('homePageId', homePageId)
      toast.success(t.settings.vaultFeatures.homePageSaved)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  // 현재 볼트의 일간 노트 내장 템플릿만 변경한다.
  // Python으로 치면: await set_planner_feature('dailyNoteTemplate', template)
  async function setDailyNoteTemplate(template: VaultPlannerFeatures['dailyNoteTemplate']) {
    try {
      await setPlannerFeature('dailyNoteTemplate', template)
      toast.success(t.settings.vaultFeatures.dailyNoteTemplateSaved)
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

      {/* 플래너 역할은 기존 세부 진입점보다 먼저 결정한다. */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-700">{t.settings.vaultFeatures.dailyPlanner}</p>
            <p className="mt-0.5 text-xs leading-5 text-gray-400">{t.settings.vaultFeatures.dailyPlannerDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDailyPlannerVault}
            aria-label={t.settings.vaultFeatures.dailyPlanner}
            disabled={loading || !currentVaultName}
            onClick={() => void togglePlannerMode()}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isDailyPlannerVault ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              isDailyPlannerVault ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {isDailyPlannerVault && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-700">{t.settings.vaultFeatures.homePage}</p>
            <p className="mt-0.5 text-xs leading-5 text-gray-400">{t.settings.vaultFeatures.homePageDesc}</p>
            <p className="mt-2 text-xs text-blue-700">
              {homePage
                ? `${homePage.icon || '📝'} ${homePage.title || t.settings.vaultFeatures.homePageUntitled}`
                : t.settings.vaultFeatures.homePageNotSet}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading || !currentPage}
                onClick={() => void setHomePage(currentPage?.id ?? null)}
                className="text-xs px-2.5 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.settings.vaultFeatures.setCurrentPageAsHome}
              </button>
              {preferences.planner.homePageId && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void setHomePage(null)}
                  className="text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.settings.vaultFeatures.clearHomePage}
                </button>
              )}
            </div>
            <div className="mt-4 border-t border-gray-100 pt-3">
              <label htmlFor="daily-note-template" className="text-xs font-medium text-gray-700">
                {t.settings.vaultFeatures.dailyNoteTemplate}
              </label>
              <p className="mt-0.5 text-xs leading-5 text-gray-400">
                {t.settings.vaultFeatures.dailyNoteTemplateDesc}
              </p>
              <select
                id="daily-note-template"
                value={preferences.planner.dailyNoteTemplate}
                disabled={loading}
                onChange={event => void setDailyNoteTemplate(event.target.value as VaultPlannerFeatures['dailyNoteTemplate'])}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="standard">{t.settings.vaultFeatures.dailyNoteTemplateStandard}</option>
                <option value="postit">{t.settings.vaultFeatures.dailyNoteTemplatePostit}</option>
              </select>
            </div>
          </div>
        )}
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
                disabled={loading || !currentVaultName || !isDailyPlannerVault}
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
