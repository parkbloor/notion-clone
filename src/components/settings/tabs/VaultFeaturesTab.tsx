'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { usePageStore } from '@/store/pageStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import { useDiaryStore } from '@/store/diaryStore'
import type { CaptureDestinationKind, VaultPlannerFeatures } from '@/lib/api'
import PlannerRecoveryPanel from '@/components/settings/PlannerRecoveryPanel'
import PlannerDataVaultPanel from '@/components/settings/PlannerDataVaultPanel'
import PlannerMigrationPanel from '@/components/settings/PlannerMigrationPanel'

// mode·homePageId·dailyNoteTemplate은 스위치 목록이 아닌 플래너 역할 자체를 표현한다.
type PlannerToggleKey = Exclude<
  keyof VaultPlannerFeatures,
  'mode' | 'homePageId' | 'dailyNoteTemplate' | 'dailyCustomTemplateId' | 'captureDestinations'
>

export default function VaultFeaturesTab() {
  const t = useLocale()
  const { currentVaultName, currentPageId, pages } = usePageStore()
  const { preferences, loading, loadForVault, setPlannerFeature } = useVaultPreferencesStore()
  const diaryVaultName = useDiaryStore(state => state.diaryVaultName)
  const diaryStatus = useDiaryStore(state => state.status)
  const availableDiaryVaults = useDiaryStore(state => state.availableVaults)
  const diaryLoading = useDiaryStore(state => state.loading)
  const loadDiarySettings = useDiaryStore(state => state.load)
  const updateDiaryVault = useDiaryStore(state => state.setDiaryVault)
  const isDailyPlannerVault = preferences.planner.mode === 'daily'
  const currentPage = pages.find(page => page.id === currentPageId) ?? null
  const homePage = pages.find(page => page.id === preferences.planner.homePageId) ?? null
  const [destinationPageId, setDestinationPageId] = useState('')
  const [destinationKind, setDestinationKind] = useState<CaptureDestinationKind>('note')
  // 백엔드를 재시작하기 전의 응답에는 새 분류함 필드가 없을 수 있다.
  const captureDestinations = Array.isArray(preferences.planner.captureDestinations)
    ? preferences.planner.captureDestinations
    : []
  const availableDestinationPages = pages.filter(page => (
    page.pageRole !== 'postit-month'
    && !captureDestinations.some(item => item.pageId === page.id)
  ))
  const selectedDestinationPage = availableDestinationPages.find(page => page.id === destinationPageId)
    ?? availableDestinationPages[0]
    ?? null

  useEffect(() => {
    if (currentVaultName) void loadForVault(currentVaultName)
  }, [currentVaultName, loadForVault])

  useEffect(() => {
    void loadDiarySettings(true)
  }, [loadDiarySettings])

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

  // 설정 화면에서 현재 볼트의 일반 메모를 직접 고른다. 월간 포스트잇을 열어 둔 상태에서도 이동할 필요가 없다.
  // Python으로 치면: selected_page = next(page for page in pages if page.id == selected_id)
  async function addSelectedPageToCaptureShelf() {
    if (!selectedDestinationPage) return
    try {
      await setPlannerFeature('captureDestinations', [
        ...captureDestinations,
        { id: crypto.randomUUID(), pageId: selectedDestinationPage.id, kind: destinationKind },
      ])
      toast.success(t.settings.vaultFeatures.captureDestinationAdded)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  async function removeCaptureDestination(destinationId: string) {
    try {
      await setPlannerFeature(
        'captureDestinations',
        captureDestinations.filter(item => item.id !== destinationId),
      )
      toast.success(t.settings.vaultFeatures.captureDestinationRemoved)
    } catch {
      toast.error(t.settings.vaultFeatures.saveError)
    }
  }

  async function setDiaryVault(vaultName: string) {
    try {
      await updateDiaryVault(vaultName || null)
      toast.success(t.settings.vaultFeatures.diaryVaultSaved)
    } catch {
      toast.error(t.settings.vaultFeatures.diaryVaultSaveError)
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

      <div className="rounded-xl border border-amber-200 bg-white px-4 py-3.5">
        <label htmlFor="diary-vault" className="text-sm font-medium text-gray-700">
          {t.settings.vaultFeatures.diaryVault}
        </label>
        <p className="mt-0.5 text-xs leading-5 text-gray-400">
          {t.settings.vaultFeatures.diaryVaultDesc}
        </p>
        <select
          id="diary-vault"
          value={diaryVaultName ?? ''}
          disabled={diaryLoading}
          onChange={event => void setDiaryVault(event.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{t.settings.vaultFeatures.diaryVaultNotSet}</option>
          {availableDiaryVaults.map(vaultName => (
            <option key={vaultName} value={vaultName}>{vaultName}</option>
          ))}
        </select>
        {diaryStatus === 'missing' && (
          <p className="mt-2 text-xs text-red-500">{t.settings.vaultFeatures.diaryVaultMissing}</p>
        )}
        <p className="mt-2 text-[11px] text-amber-700">{t.settings.vaultFeatures.diaryVaultSafety}</p>
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
                <option value="diary">{t.settings.vaultFeatures.dailyNoteTemplateDiary}</option>
              </select>
            </div>

            {preferences.planner.dailyNoteTemplate === 'postit' && <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-700">{t.settings.vaultFeatures.captureShelf}</p>
              <p className="mt-0.5 text-xs leading-5 text-gray-400">{t.settings.vaultFeatures.captureShelfDesc}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={selectedDestinationPage?.id ?? ''}
                  disabled={loading || !currentVaultName || availableDestinationPages.length === 0}
                  onChange={event => setDestinationPageId(event.target.value)}
                  aria-label={t.settings.vaultFeatures.captureDestinationPage}
                  className="min-w-44 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {availableDestinationPages.length === 0 ? (
                    <option value="">{t.settings.vaultFeatures.captureDestinationNoAvailablePage}</option>
                  ) : availableDestinationPages.map(page => (
                    <option key={page.id} value={page.id}>{page.icon || '📝'} {page.title || t.settings.vaultFeatures.homePageUntitled}</option>
                  ))}
                </select>
                <select
                  value={destinationKind}
                  disabled={loading || !currentVaultName || !selectedDestinationPage}
                  onChange={event => setDestinationKind(event.target.value as CaptureDestinationKind)}
                  aria-label={t.settings.vaultFeatures.captureDestinationKind}
                  className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="note">{t.settings.vaultFeatures.captureDestinationNote}</option>
                  <option value="task">{t.settings.vaultFeatures.captureDestinationTask}</option>
                </select>
                <button
                  type="button"
                  disabled={loading || !selectedDestinationPage}
                  onClick={() => void addSelectedPageToCaptureShelf()}
                  className="rounded border border-blue-200 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.settings.vaultFeatures.addSelectedPageToCaptureShelf}
                </button>
              </div>
              {availableDestinationPages.length === 0 && <p className="mt-2 text-[11px] text-gray-400">{t.settings.vaultFeatures.captureDestinationNoAvailablePage}</p>}
              <div className="mt-3 space-y-1.5">
                {captureDestinations.length === 0 ? (
                  <p className="text-xs text-gray-400">{t.settings.vaultFeatures.captureShelfEmpty}</p>
                ) : captureDestinations.map(destination => {
                  const page = pages.find(item => item.id === destination.pageId)
                  return (
                    <div key={destination.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                      <span aria-hidden="true">{page?.icon || '📝'}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                        {page?.title || t.settings.vaultFeatures.captureDestinationMissing}
                      </span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
                        {destination.kind === 'task'
                          ? t.settings.vaultFeatures.captureDestinationTask
                          : t.settings.vaultFeatures.captureDestinationNote}
                      </span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void removeCaptureDestination(destination.id)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.settings.vaultFeatures.removeCaptureDestination}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>}
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

      <PlannerDataVaultPanel />
      <PlannerRecoveryPanel />
      <PlannerMigrationPanel />
    </div>
  )
}
