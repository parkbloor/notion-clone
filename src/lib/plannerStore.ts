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
  activationMode: 'fresh' | 'migration' | null
  canStartFresh: boolean
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

export interface PlannerBatchDelete {
  id: string
  expectedRevision: number
}

export interface StoredPlannerReview {
  date: string
  content: string
  revision: number
  updated_at: string
}

export interface StoredPlannerRoutine {
  id: string
  title: string
  start: string
  end: string
  color: string
  days: number[]
  active: boolean
  revision: number
  createdAt: string
  updatedAt: string
}

export interface PlannerRoutineInput {
  id: string
  title: string
  start: string
  end: string
  color: string
  days: number[]
  active: boolean
}

export interface PlannerRoutinePolicy {
  autoApply: boolean
  revision: number
  updatedAt: string
}

export interface PlannerPortableBackup {
  format: 'notion-clone-planner'
  version: 1
  schemaVersion: number
  exportedAt: string
  checksum: string
  events: StoredPlannerEvent[]
  reviews: StoredPlannerReview[]
  routines: StoredPlannerRoutine[]
  routinePolicy: PlannerRoutinePolicy
}

export interface PlannerImportPreview {
  version: number
  totals: { additions: number; duplicates: number; conflicts: number }
  byKind: Record<'events' | 'reviews' | 'routines', { additions: number; duplicates: number; conflicts: number }>
  conflicts: Array<{ kind: string; key: string }>
  previewFingerprint: string
}

export const PLANNER_ROUTINES_CHANGED_EVENT = 'notion-clone:planner-routines-changed'
export const PLANNER_OPEN_DATE_EVENT = 'notion-clone:planner-open-date'

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

export class PlannerStoreRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'PlannerStoreRequestError'
  }
}

async function readError(response: Response, fallback: string): Promise<PlannerStoreRequestError> {
  try {
    const data = await response.json() as { detail?: string }
    return new PlannerStoreRequestError(data.detail || fallback, response.status)
  } catch {
    return new PlannerStoreRequestError(fallback, response.status)
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

  activateEmpty: async (): Promise<PlannerStoreStatus> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/activate-empty`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'START_EMPTY' }),
    })
    if (!response.ok) throw await readError(response, '새 일정 저장소를 활성화하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_STORE_MODE_CHANGED_EVENT))
    return result
  },

  listEvents: async (startDate?: string, endDate?: string, includeDeleted = false): Promise<StoredPlannerEvent[]> => {
    const query = new URLSearchParams()
    if (startDate) query.set('start_date', startDate)
    if (endDate) query.set('end_date', endDate)
    if (includeDeleted) query.set('include_deleted', 'true')
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

  clockInEvent: async (id: string, expectedRevision: number): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events/${encodeURIComponent(id)}/clock-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '타이머를 시작하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  clockOutEvent: async (id: string, expectedRevision: number): Promise<StoredPlannerEvent> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/events/${encodeURIComponent(id)}/clock-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '타이머를 종료하지 못했습니다.')
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

  applyBatch: async (creates: PlannerEventInput[], deletes: PlannerBatchDelete[]): Promise<{ status: 'ok'; created: StoredPlannerEvent[]; deleted: string[] }> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creates, deletes }),
    })
    if (!response.ok) throw await readError(response, 'AI 일정 제안을 적용하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  listRoutines: async (): Promise<StoredPlannerRoutine[]> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines`)
    if (!response.ok) throw await readError(response, '루틴을 불러오지 못했습니다.')
    return response.json()
  },

  createRoutine: async (routine: PlannerRoutineInput): Promise<StoredPlannerRoutine> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(routine),
    })
    if (!response.ok) throw await readError(response, '루틴을 만들지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
    return result
  },

  updateRoutine: async (routine: PlannerRoutineInput, expectedRevision: number): Promise<StoredPlannerRoutine> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines/${encodeURIComponent(routine.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...routine, expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '루틴을 수정하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
    return result
  },

  deleteRoutine: async (id: string, expectedRevision: number): Promise<void> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '루틴을 삭제하지 못했습니다.')
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
  },

  getRoutinePolicy: async (): Promise<PlannerRoutinePolicy> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routine-policy`)
    if (!response.ok) throw await readError(response, '루틴 자동 적용 설정을 불러오지 못했습니다.')
    return response.json()
  },

  updateRoutinePolicy: async (autoApply: boolean, expectedRevision: number): Promise<PlannerRoutinePolicy> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routine-policy`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoApply, expectedRevision }),
    })
    if (!response.ok) throw await readError(response, '루틴 자동 적용 설정을 저장하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
    return result
  },

  applyRoutines: async (date: string, automatic = false): Promise<{ created: StoredPlannerEvent[]; skipped: string | null }> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines/apply/${encodeURIComponent(date)}?automatic=${automatic}` , { method: 'POST' })
    if (!response.ok) throw await readError(response, '루틴을 일정에 적용하지 못했습니다.')
    const result = await response.json()
    if (result.created.length && typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
    return result
  },

  importLegacyRoutines: async (): Promise<{ backupFile: string; imported: number; skipped: number; preservedOriginal: boolean }> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/routines/import-legacy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'COPY_LEGACY_ROUTINES' }),
    })
    if (!response.ok) throw await readError(response, '기존 루틴을 복사하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
    return result
  },

  getReview: async (date: string): Promise<StoredPlannerReview | null> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/reviews/${encodeURIComponent(date)}`)
    if (!response.ok) throw await readError(response, '회고를 불러오지 못했습니다.')
    return response.json()
  },

  getBackup: async (): Promise<PlannerPortableBackup> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/backup`)
    if (!response.ok) throw await readError(response, '일정 백업을 만들지 못했습니다.')
    return response.json()
  },

  previewImport: async (payload: PlannerPortableBackup): Promise<PlannerImportPreview> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/import/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }),
    })
    if (!response.ok) throw await readError(response, '일정 가져오기 미리보기를 만들지 못했습니다.')
    return response.json()
  },

  commitImport: async (payload: PlannerPortableBackup, previewFingerprint: string): Promise<{ status: 'ok'; imported: PlannerImportPreview['byKind']; preservedLegacySources: boolean }> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, previewFingerprint }),
    })
    if (!response.ok) throw await readError(response, '일정 가져오기를 적용하지 못했습니다.')
    const result = await response.json()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(PLANNER_EVENTS_CHANGED_EVENT))
      window.dispatchEvent(new Event(PLANNER_ROUTINES_CHANGED_EVENT))
    }
    return result
  },

  exportCsv: async (startDate: string, endDate: string): Promise<Blob> => {
    const response = await fetch(`${BASE_URL}/api/planner/store/export.csv?${new URLSearchParams({ start_date: startDate, end_date: endDate })}`)
    if (!response.ok) throw await readError(response, 'CSV 내보내기를 만들지 못했습니다.')
    return response.blob()
  },

  exportHtml: async (startDate: string, endDate: string): Promise<Blob> => {
    const response = await fetch(`${BASE_URL}/api/export/planner-period?${new URLSearchParams({ start_date: startDate, end_date: endDate })}`)
    if (!response.ok) throw await readError(response, 'HTML 내보내기를 만들지 못했습니다.')
    return response.blob()
  },

  listArchive: async (startDate?: string, endDate?: string): Promise<StoredPlannerEvent[]> => {
    const query = new URLSearchParams()
    if (startDate) query.set('start_date', startDate)
    if (endDate) query.set('end_date', endDate)
    const response = await fetch(`${BASE_URL}/api/planner/store/archive${query.size ? `?${query}` : ''}`)
    if (!response.ok) throw await readError(response, '삭제한 일정을 불러오지 못했습니다.')
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
