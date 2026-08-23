import { BASE_URL } from '@/lib/api'

export const PLANNER_STORE_MODE_CHANGED_EVENT = 'notion-clone:planner-store-mode-changed'
export const PLANNER_EVENTS_CHANGED_EVENT = 'notion-clone:planner-events-changed'

export type PlannerDataStatus = 'unconfigured' | 'ready' | 'missing'

export interface PlannerDataConfig {
  version: number
  plannerVaultName: string | null
  status: PlannerDataStatus
  availableVaults: string[]
  storage: 'sqlite'
}

export interface PlannerStoreStatus extends PlannerDataConfig {
  databaseReady: boolean
  schemaVersion: number | null
  eventCount: number
  migrationComplete: boolean
  writeMode: 'legacy' | 'sqlite'
}

export interface StoredPlannerEvent {
  id: string
  date: string
  title: string
  start: string
  end: string
  color: string
  done: boolean
  scheduled: boolean | null
  clockIn: string | null
  clockOut: string | null
  elapsed: number | null
  log: string | null
  subtasks: unknown[]
  energy: number | null
  source: string | null
  routineId: string | null
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface PlannerEventInput {
  id: string
  date: string
  title: string
  start: string
  end: string
  color: string
  done: boolean
  scheduled?: boolean | null
  clockIn?: string | null
  clockOut?: string | null
  elapsed?: number | null
  log?: string | null
  subtasks?: unknown[]
  energy?: number | null
  source?: string | null
  routineId?: string | null
}

export interface StoredPlannerReview {
  date: string
  content: string
  revision: number
  updated_at: string
}

export interface PlannerMigrationPreview {
  version: number
  sourceVaults: string[]
  targetVaultName: string | null
  targetReady: boolean
  backup: null | { backupFile: string; sha256: string; createdAt: string; fileCount: number }
  readyToMigrate: boolean
  previewFingerprint: string
  totals: {
    eventOccurrences: number
    uniqueEvents: number
    duplicateEvents: number
    eventConflicts: number
    invalidEvents: number
    uniqueReviews: number
    duplicateReviews: number
    reviewConflicts: number
  }
  conflicts: Array<{ kind: 'event' | 'review'; key: string; sourceFile: string; occurrenceCount: number }>
}

export interface PlannerMigrationResult {
  status: 'ok'
  backupFile: string
  importedEvents: number
  importedReviews: number
  preservedOriginals: boolean
}

async function readError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json() as { detail?: string }
    return new Error(data.detail || fallback)
  } catch {
    return new Error(fallback)
  }
}

export const plannerStoreApi = {
  getStatus: async (): Promise<PlannerStoreStatus> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/status`)
    if (!response.ok) throw await readError(response, '일정 저장소 상태를 확인하지 못했습니다.')
    return response.json()
  },

  updateConfig: async (plannerVaultName: string | null): Promise<PlannerDataConfig> => {
    const response = await fetch(`${BASE_URL}/api/settings/planner-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plannerVaultName }),
    })
    if (!response.ok) throw await readError(response, '일정 데이터 볼트 설정을 저장하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_STORE_MODE_CHANGED_EVENT))
    return result
  },

  listEvents: async (startDate?: string, endDate?: string): Promise<StoredPlannerEvent[]> => {
    const query = new URLSearchParams()
    if (startDate) query.set('start_date', startDate)
    if (endDate) query.set('end_date', endDate)
    const suffix = query.size ? `?${query}` : ''
    const response = await fetch(`${BASE_URL}/api/planner/store/events${suffix}`)
    if (!response.ok) throw await readError(response, '일정을 불러오지 못했습니다.')
    return response.json()
  },

  createEvent: async (event: PlannerEventInput): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
    })
    if (!response.ok) throw await readError(response, '일정을 만들지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  updateEvent: async (event: PlannerEventInput, expectedRevision: number): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events/${encodeURIComponent(event.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '일정을 수정하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  deleteEvent: async (id: string, expectedRevision: number): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '일정을 삭제하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  restoreEvent: async (id: string, expectedRevision: number): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events/${encodeURIComponent(id)}/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '삭제한 일정을 복구하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  getReview: async (date: string): Promise<StoredPlannerReview | null> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/reviews/${encodeURIComponent(date)}`)
    if (!response.ok) throw await readError(response, '회고를 불러오지 못했습니다.')
    return response.json()
  },

  saveReview: async (date: string, content: string, expectedRevision?: number): Promise<StoredPlannerReview> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/reviews/${encodeURIComponent(date)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '회고를 저장하지 못했습니다.')
    return response.json()
  },

  previewMigration: async (sourceVaults: string[]): Promise<PlannerMigrationPreview> => {
    const response = await fetch(`${BASE_URL}/api/planner/migration/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceVaults }),
    })
    if (!response.ok) throw await readError(response, '일정 이전 미리보기를 만들지 못했습니다.')
    return response.json()
  },

  executeMigration: async (preview: PlannerMigrationPreview): Promise<PlannerMigrationResult> => {
    if (!preview.backup) throw new Error('검증된 백업이 필요합니다.')
    const response = await fetch(`${BASE_URL}/api/planner/migration/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceVaults: preview.sourceVaults, backupFile: preview.backup.backupFile,
        previewFingerprint: preview.previewFingerprint, confirmation: 'MIGRATE',
      }),
    })
    if (!response.ok) throw await readError(response, '일정을 이전하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_STORE_MODE_CHANGED_EVENT))
    return result
  },
}
