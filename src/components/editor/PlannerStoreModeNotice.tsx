'use client'

import { useLocale } from '@/locales'

type PendingPlannerStoreMode = 'loading' | 'unavailable'

interface PlannerStoreModeNoticeProps {
  mode: PendingPlannerStoreMode
}

// SQLite/레거시 원본을 아직 판별하지 못한 동안에는 어떤 원본도 수정하지 않는다.
// Python으로 치면: return render_read_only_notice(mode)
export function PlannerStoreModeNotice({ mode }: PlannerStoreModeNoticeProps) {
  const t = useLocale()
  const unavailable = mode === 'unavailable'
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs ${unavailable ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
      {unavailable ? t.settings.vaultFeatures.plannerStoreUnavailable : t.settings.vaultFeatures.plannerStoreChecking}
    </div>
  )
}
