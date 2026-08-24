// =============================================
// SQLite planner routine manager. Legacy routine files are only copied after
// an explicit, backup-gated action; normal edits never write that source file.
// =============================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import {
  PLANNER_ROUTINES_CHANGED_EVENT,
  PlannerStoreRequestError,
  plannerStoreApi,
  type PlannerRoutineInput,
  type PlannerRoutinePolicy,
  type StoredPlannerRoutine,
} from '@/lib/plannerStore'
import { EVENT_COLORS, getColor } from '@/components/editor/planner/PlannerTimeline'

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toInput(routine: StoredPlannerRoutine): PlannerRoutineInput {
  return {
    id: routine.id, title: routine.title, start: routine.start, end: routine.end,
    color: routine.color, days: routine.days, active: routine.active,
  }
}

function emptyRoutine(): PlannerRoutineInput {
  return { id: crypto.randomUUID(), title: '', start: '09:00', end: '10:00', color: 'blue', days: [1, 2, 3, 4, 5], active: true }
}

export default function SqliteRoutineManager({ date }: { date: string }) {
  const t = useLocale()
  const [open, setOpen] = useState(false)
  const [routines, setRoutines] = useState<StoredPlannerRoutine[]>([])
  const [policy, setPolicy] = useState<PlannerRoutinePolicy | null>(null)
  const [draft, setDraft] = useState<PlannerRoutineInput | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [nextRoutines, nextPolicy] = await Promise.all([plannerStoreApi.listRoutines(), plannerStoreApi.getRoutinePolicy()])
      setRoutines(nextRoutines)
      setPolicy(nextPolicy)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.day.routineLoadError)
    }
  }, [t.planner.day.routineLoadError])

  useEffect(() => { if (open) void load() }, [load, open])
  useEffect(() => {
    const refresh = () => { if (open) void load() }
    window.addEventListener(PLANNER_ROUTINES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PLANNER_ROUTINES_CHANGED_EVENT, refresh)
  }, [load, open])

  const saveRoutine = useCallback(async () => {
    if (!draft) return
    if (!draft.title.trim() || !/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end) || draft.start >= draft.end) {
      toast.error(t.planner.day.routineValidationError)
      return
    }
    setSaving(true)
    try {
      const existing = routines.find(routine => routine.id === editingId)
      if (existing) await plannerStoreApi.updateRoutine({ ...draft, title: draft.title.trim() }, existing.revision)
      else await plannerStoreApi.createRoutine({ ...draft, title: draft.title.trim() })
      setDraft(null)
      setEditingId(null)
      await load()
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        await load()
        toast.error(t.planner.day.routineConflict)
      } else toast.error(error instanceof Error ? error.message : t.planner.day.routineSaveError)
    } finally {
      setSaving(false)
    }
  }, [draft, editingId, load, routines, t])

  const deleteRoutine = useCallback(async (routine: StoredPlannerRoutine) => {
    if (!window.confirm(t.planner.day.routineDeleteConfirm)) return
    try {
      await plannerStoreApi.deleteRoutine(routine.id, routine.revision)
      await load()
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) await load()
      toast.error(error instanceof Error ? error.message : t.planner.day.routineDeleteError)
    }
  }, [load, t])

  const toggleAutoApply = useCallback(async () => {
    if (!policy) return
    try {
      setPolicy(await plannerStoreApi.updateRoutinePolicy(!policy.autoApply, policy.revision))
    } catch (error) {
      await load()
      toast.error(error instanceof Error ? error.message : t.planner.day.routinePolicyError)
    }
  }, [load, policy, t.planner.day.routinePolicyError])

  const applyForDate = useCallback(async () => {
    try {
      const result = await plannerStoreApi.applyRoutines(date)
      toast.success(result.created.length ? t.planner.day.routineApplied.replace('{count}', String(result.created.length)) : t.planner.day.routineAlreadyApplied)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.day.routineApplyError)
    }
  }, [date, t])

  const importLegacy = useCallback(async () => {
    if (!window.confirm(t.planner.day.routineImportConfirm)) return
    try {
      const result = await plannerStoreApi.importLegacyRoutines()
      toast.success(t.planner.day.routineImported.replace('{count}', String(result.imported)))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.day.routineImportError)
    }
  }, [load, t])

  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(value => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><RotateCcw size={13} /> {t.planner.day.routineTitle}</button>
        <button type="button" onClick={() => void applyForDate()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"><Check size={13} /> {t.planner.day.routineApply}</button>
        {policy && <button type="button" onClick={() => void toggleAutoApply()} className={`ml-auto rounded-lg px-2.5 py-1.5 text-xs ${policy.autoApply ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{policy.autoApply ? t.planner.day.routineAutoOn : t.planner.day.routineAutoOff}</button>}
      </div>

      {open && <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
        <p className="text-[11px] leading-4 text-gray-500">{t.planner.day.routineHint}</p>
        {routines.map(routine => {
          const color = getColor(routine.color)
          return <div key={routine.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2">
            <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
            <span className={`min-w-0 flex-1 truncate text-xs ${routine.active ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{routine.title} · {routine.start}–{routine.end} · {routine.days.length ? routine.days.map(day => DAY_LABELS[day]).join('') : t.planner.day.routineEveryDay}</span>
            <button type="button" title={t.planner.day.routineEdit} onClick={() => { setDraft(toInput(routine)); setEditingId(routine.id) }} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Pencil size={13} /></button>
            <button type="button" title={t.planner.day.routineDelete} onClick={() => void deleteRoutine(routine)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
          </div>
        })}
        {draft && <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
          <input autoFocus value={draft.title} placeholder={t.planner.day.routineNamePlaceholder} onChange={event => setDraft(current => current ? { ...current, title: event.target.value } : current)} className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400" />
          <div className="flex items-center gap-1.5"><input type="time" value={draft.start} onChange={event => setDraft(current => current ? { ...current, start: event.target.value } : current)} className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs" /><span className="text-xs text-gray-400">~</span><input type="time" value={draft.end} onChange={event => setDraft(current => current ? { ...current, end: event.target.value } : current)} className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs" /></div>
          <div className="flex flex-wrap items-center gap-1">{DAY_LABELS.map((label, day) => <button key={day} type="button" onClick={() => setDraft(current => current ? { ...current, days: current.days.includes(day) ? current.days.filter(value => value !== day) : [...current.days, day].sort() } : current)} className={`h-6 w-6 rounded-full text-[10px] font-medium ${draft.days.includes(day) ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{label}</button>)}<button type="button" onClick={() => setDraft(current => current ? { ...current, days: [] } : current)} className={`ml-1 rounded px-1.5 py-1 text-[10px] ${draft.days.length === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{t.planner.day.routineEveryDay}</button><label className="ml-auto flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={draft.active} onChange={event => setDraft(current => current ? { ...current, active: event.target.checked } : current)} /> {t.planner.day.routineActive}</label></div>
          <div className="flex flex-wrap gap-1">{EVENT_COLORS.map(color => <button key={color.id} type="button" title={color.id} onClick={() => setDraft(current => current ? { ...current, color: color.id } : current)} className={`h-4 w-4 rounded-full ${color.dot} ${draft.color === color.id ? 'ring-2 ring-gray-400 ring-offset-1' : ''}`} />)}</div>
          <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void saveRoutine()} className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"><Check size={12} /> {t.planner.day.saveChanges}</button><button type="button" onClick={() => { setDraft(null); setEditingId(null) }} className="rounded px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><X size={12} /></button></div>
        </div>}
        <div className="flex flex-wrap items-center gap-2 pt-1"><button type="button" disabled={draft !== null} onClick={() => { setDraft(emptyRoutine()); setEditingId(null) }} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 disabled:opacity-40"><Plus size={13} /> {t.planner.day.routineAdd}</button><button type="button" onClick={() => void importLegacy()} className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-800"><Copy size={13} /> {t.planner.day.routineImport}</button><button type="button" onClick={() => void load()} className="ml-auto rounded p-1 text-gray-400 hover:bg-white"><RefreshCw size={13} /></button></div>
      </div>}
    </div>
  )
}
