'use client'

import { useEffect, useState } from 'react'
import { PLANNER_STORE_MODE_CHANGED_EVENT, plannerStoreApi } from '@/lib/plannerStore'

export function usePlannerStoreMode(): 'loading' | 'legacy' | 'sqlite' | 'unavailable' {
  const [mode, setMode] = useState<'loading' | 'legacy' | 'sqlite' | 'unavailable'>('loading')

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void plannerStoreApi.getStatus()
        .then(status => { if (!cancelled) setMode(status.writeMode === 'sqlite' ? 'sqlite' : 'legacy') })
        .catch(() => { if (!cancelled) setMode('unavailable') })
    }
    load()
    window.addEventListener(PLANNER_STORE_MODE_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(PLANNER_STORE_MODE_CHANGED_EVENT, load)
    }
  }, [])

  return mode
}
