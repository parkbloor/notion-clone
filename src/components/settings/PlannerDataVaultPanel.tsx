'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveRestore, Database, Download, FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { plannerStoreApi, type PlannerImportPreview, type PlannerPortableBackup, type PlannerStoreStatus, type StoredPlannerEvent } from '@/lib/plannerStore'

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function mondayOf(date: Date): string {
  const result = new Date(date)
  result.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return formatDate(result)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function PlannerDataVaultPanel() {
  const t = useLocale()
  const labels = t.settings.vaultFeatures.plannerData
  const [status, setStatus] = useState<PlannerStoreStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingImport, setPendingImport] = useState<{ payload: PlannerPortableBackup; preview: PlannerImportPreview } | null>(null)
  const [archive, setArchive] = useState<StoredPlannerEvent[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function activateEmptyStore() {
    if (!status?.canStartFresh) return
    if (!window.confirm(labels.startFreshConfirm)) return
    setLoading(true)
    try {
      await plannerStoreApi.activateEmpty()
      setStatus(await plannerStoreApi.getStatus())
      toast.success(labels.startFreshSuccess)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.startFreshError)
    } finally {
      setLoading(false)
    }
  }

  // SQLite 일정만 JSON으로 내려받는다. 기존 페이지·아카이브 파일은 읽거나 수정하지 않는다.
  // Python으로 치면: download_json(await planner_store.backup())
  async function downloadBackup() {
    try {
      const backup = await plannerStoreApi.getBackup()
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }), `planner-backup-${backup.exportedAt.slice(0, 10)}.json`)
      toast.success('일정 백업을 검증값과 함께 내려받았습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '일정 백업을 만들지 못했습니다.')
    }
  }

  // 이번 주 SQLite 일정만 CSV/HTML 기록으로 만든다.
  // Python으로 치면: export_range(monday, sunday, format)
  async function downloadRange(format: 'csv' | 'html') {
    const start = mondayOf(new Date())
    const endDate = new Date(`${start}T00:00:00`)
    endDate.setDate(endDate.getDate() + 6)
    const end = formatDate(endDate)
    try {
      const blob = format === 'csv' ? await plannerStoreApi.exportCsv(start, end) : await plannerStoreApi.exportHtml(start, end)
      downloadBlob(blob, `planner-${start}-${end}.${format}`)
      toast.success(`이번 주 ${format.toUpperCase()} 기록을 내려받았습니다.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '기간 내보내기를 만들지 못했습니다.')
    }
  }

  // 사용자가 고른 파일을 먼저 서버 미리보기에 보내고, 충돌 없는 경우에만 별도 확인 버튼을 노출한다.
  // Python으로 치면: preview = await planner_store.preview_import(json.loads(file))
  async function chooseImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const payload = JSON.parse(await file.text()) as PlannerPortableBackup
      const preview = await plannerStoreApi.previewImport(payload)
      setPendingImport({ payload, preview })
      toast.success(`가져오기 미리보기: 추가 ${preview.totals.additions}, 중복 ${preview.totals.duplicates}, 충돌 ${preview.totals.conflicts}`)
    } catch (error) {
      setPendingImport(null)
      toast.error(error instanceof Error ? error.message : '일정 백업 파일을 읽지 못했습니다.')
    }
  }

  async function commitImport() {
    if (!pendingImport || pendingImport.preview.totals.conflicts > 0) return
    if (!window.confirm(`추가 ${pendingImport.preview.totals.additions}개를 SQLite 일정 저장소에 가져올까요? 기존 페이지 원본은 바뀌지 않습니다.`)) return
    try {
      await plannerStoreApi.commitImport(pendingImport.payload, pendingImport.preview.previewFingerprint)
      setPendingImport(null)
      await load()
      toast.success('일정 백업을 하나의 트랜잭션으로 가져왔습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '일정 가져오기를 적용하지 못했습니다.')
    }
  }

  async function loadArchive() {
    try {
      setArchive(await plannerStoreApi.listArchive())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제한 일정을 불러오지 못했습니다.')
    }
  }

  async function restoreArchivedEvent(event: StoredPlannerEvent) {
    if (!window.confirm(`삭제한 일정 “${event.title}”을 복원할까요?`)) return
    try {
      await plannerStoreApi.restoreEvent(event.id, event.revision)
      await loadArchive()
      toast.success('삭제한 일정을 복원했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '일정을 복원하지 못했습니다.')
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
          {status?.status === 'ready' && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-xs font-medium text-emerald-900">{labels.startFreshTitle}</p>
              <p className="mt-1 text-[11px] leading-4 text-emerald-800">{labels.startFreshDescription}</p>
              <button
                type="button"
                disabled={loading || !status.canStartFresh}
                onClick={() => void activateEmptyStore()}
                className="mt-2 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {labels.startFreshButton}
              </button>
              {!status.canStartFresh && <p className="mt-1.5 text-[11px] leading-4 text-emerald-800">{labels.startFreshUnavailable}</p>}
            </div>
          )}
          {status?.status === 'ready' && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800"><ArchiveRestore size={13} /> SQLite 일정 백업·복원</div>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">백업은 일정·회고·루틴과 검증값을 포함합니다. 빈 저장소에 확인된 백업을 복원하면 SQLite 일정 모드가 활성화되며, 기존 페이지 원본은 변경하지 않습니다.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" disabled={status.writeMode !== 'sqlite'} onClick={() => void downloadBackup()} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Download size={12} /> JSON 백업</button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100"><Upload size={12} /> JSON 가져오기</button>
                <button type="button" disabled={status.writeMode !== 'sqlite'} onClick={() => void downloadRange('csv')} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Download size={12} /> 이번 주 CSV</button>
                <button type="button" disabled={status.writeMode !== 'sqlite'} onClick={() => void downloadRange('html')} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"><FileText size={12} /> 이번 주 HTML</button>
                <button type="button" disabled={status.writeMode !== 'sqlite'} onClick={() => void loadArchive()} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"><ArchiveRestore size={12} /> 삭제 일정</button>
                <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={event => void chooseImport(event)} className="hidden" />
              </div>
              {pendingImport && <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${pendingImport.preview.totals.conflicts ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}><p>추가 {pendingImport.preview.totals.additions} · 중복 {pendingImport.preview.totals.duplicates} · 충돌 {pendingImport.preview.totals.conflicts}</p>{pendingImport.preview.totals.conflicts ? <p className="mt-1">충돌이 있으면 기존 SQLite 일정을 덮어쓰지 않습니다. 다른 빈 저장소에서 복원하거나 충돌 항목을 정리해 주세요.</p> : <div className="mt-1.5 flex gap-1.5"><button type="button" disabled={pendingImport.preview.totals.additions === 0} onClick={() => void commitImport()} className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-50">가져오기 적용</button><button type="button" onClick={() => setPendingImport(null)} className="rounded border border-emerald-300 px-2 py-1">취소</button></div>}</div>}
              {archive && <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">{archive.length === 0 ? <p className="text-[11px] text-slate-400">삭제한 SQLite 일정이 없습니다.</p> : archive.map(event => <div key={event.id} className="flex items-center gap-2 text-[11px]"><span className="min-w-0 flex-1 truncate text-slate-600">{event.date} {event.start} {event.title}</span><button type="button" onClick={() => void restoreArchivedEvent(event)} className="rounded border border-slate-300 px-1.5 py-0.5 text-slate-700 hover:bg-slate-100">복원</button></div>)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
