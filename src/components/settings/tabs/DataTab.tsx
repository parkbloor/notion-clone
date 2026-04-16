// =============================================
// src/components/settings/tabs/DataTab.tsx
// 역할: 데이터 내보내기/백업/복구 탭
// Python으로 치면: class DataSettings(SettingsTab): def render_export_buttons(): ...
// =============================================

'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'

// Windows에서 localhost가 IPv6(::1)로 해석되는 문제 방지 — api.ts와 동일하게 127.0.0.1 사용
const BASE_URL = 'http://127.0.0.1:8000'

export default function DataTab() {
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 파일/폴더 input 참조
  // Python으로 치면: self.import_ref = self.merge_ref = self.folder_ref = None
  const importRef = useRef<HTMLInputElement>(null)
  const mergeRef = useRef<HTMLInputElement>(null)
  const folderMergeRef = useRef<HTMLInputElement>(null)

  // 상태
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [mergeStatus, setMergeStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  // -----------------------------------------------
  // localStorage 설정을 읽어 민감 정보(aiApiKey)를 제거한 뒤 반환
  // Python으로 치면: def get_safe_settings(): d = json.loads(localStorage['notion-clone-settings']); del d['aiApiKey']; return d
  // -----------------------------------------------
  function getSafeSettings(): Record<string, unknown> | null {
    try {
      const raw = localStorage.getItem('notion-clone-settings')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // state 키 안에 실제 값이 들어있는 Zustand persist 포맷
      // Python으로 치면: state = parsed.get('state', parsed)
      const state = parsed?.state ?? parsed
      // API 키는 보안상 내보내기에서 제외 (구 aiApiKey + 현재 openaiApiKey / anthropicApiKey)
      const { aiApiKey: _a, openaiApiKey: _b, anthropicApiKey: _c, ...safeState } = state
      return { ...parsed, state: safeState }
    } catch {
      return null
    }
  }

  // -----------------------------------------------
  // 백업 JSON의 settings 필드를 localStorage에 복원
  // Python으로 치면: def restore_settings(data): localStorage['notion-clone-settings'] = json.dumps(data['settings'])
  // -----------------------------------------------
  function restoreSettings(backupData: Record<string, unknown>) {
    try {
      const settingsBackup = backupData.settings
      if (!settingsBackup) return
      localStorage.setItem('notion-clone-settings', JSON.stringify(settingsBackup))
    } catch {
      // 설정 복원 실패는 치명적이지 않으므로 무시
    }
  }

  // -----------------------------------------------
  // 병합 API 공통 호출 — { index, pages } 형태로 전송
  // Python으로 치면: def call_merge_api(index, pages): requests.post('/api/import/merge', ...)
  // -----------------------------------------------
  async function callMergeApi(index: unknown, pages: unknown[]) {
    const res = await fetch(`${BASE_URL}/api/import/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { index, pages } }),
    })
    if (!res.ok) throw new Error('병합 실패')
    return res.json()
  }

  // -----------------------------------------------
  // JSON 백업 다운로드 — 페이지 데이터 + 설정 포함
  // Python으로 치면: def download_json(self): response = requests.get(url); inject_settings(response); save_file(response.content)
  // -----------------------------------------------
  async function downloadJSON() {
    setIsExporting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/export/json`)
      if (!res.ok) throw new Error('내보내기 실패')
      // 백엔드 JSON에 프론트 설정을 추가해서 다운로드
      // Python으로 치면: export_obj = json.loads(response.text); export_obj['settings'] = get_safe_settings()
      const exportObj = await res.json()
      const safeSettings = getSafeSettings()
      if (safeSettings) exportObj.settings = safeSettings
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notion-clone-backup-${new Date().toISOString().slice(0, 10)}.nct`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // revokeObjectURL을 다음 태스크로 지연 — Firefox에서 click() 직후 revoke 시 다운로드 실패 방지
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch {
      toast.error(t.settings.data.exportError)
    } finally {
      setIsExporting(false)
    }
  }

  // -----------------------------------------------
  // 마크다운 ZIP 내보내기
  // Python으로 치면: def download_markdown(self): response = requests.get(url); save_zip(response.content)
  // -----------------------------------------------
  async function downloadMarkdown() {
    setIsExporting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/export/markdown`)
      if (!res.ok) throw new Error('내보내기 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notion-clone-markdown-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // revokeObjectURL을 다음 태스크로 지연 — Firefox에서 click() 직후 revoke 시 다운로드 실패 방지
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch {
      toast.error(t.settings.data.exportMarkdownError)
    } finally {
      setIsExporting(false)
    }
  }

  // -----------------------------------------------
  // .nct 백업 파일에서 전체 복구 (기존 데이터 덮어씀)
  // Python으로 치면: def import_json(self, file): requests.post(url, data=file.read())
  // -----------------------------------------------
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.nct')) {
      setImportStatus({ type: 'error', msg: t.settings.data.jsonOnly })
      return
    }
    if (!confirm(t.settings.data.importConfirm)) {
      e.target.value = ''
      return
    }
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)
      const res = await fetch(`${BASE_URL}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: backupData }),
      })
      if (!res.ok) throw new Error('복구 실패')
      // 백업에 설정이 포함되어 있으면 localStorage에도 복원
      // Python으로 치면: if 'settings' in backup: restore_settings(backup['settings'])
      restoreSettings(backupData)
      setImportStatus({ type: 'ok', msg: t.settings.data.importSuccess })
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setImportStatus({ type: 'error', msg: t.settings.data.importFail })
    }
    e.target.value = ''
  }

  // -----------------------------------------------
  // .nct 백업 파일로 병합 가져오기
  // Python으로 치면: def handle_merge(self, file): requests.post('/api/import/merge', data=parse(file))
  // -----------------------------------------------
  async function handleMerge(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.nct')) {
      setMergeStatus({ type: 'error', msg: t.settings.data.jsonOnly })
      return
    }
    if (!confirm(t.settings.data.mergeConfirm)) {
      e.target.value = ''
      return
    }
    setIsMerging(true)
    setMergeStatus(null)
    try {
      const backupData = JSON.parse(await file.text())
      const result = await callMergeApi(backupData.index, backupData.pages ?? [])
      const msg = t.settings.data.mergeSuccess(result.added_pages ?? 0, result.skipped_pages ?? 0)
      setMergeStatus({ type: 'ok', msg })
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setMergeStatus({ type: 'error', msg: t.settings.data.mergeFail })
    } finally {
      setIsMerging(false)
      e.target.value = ''
    }
  }

  // -----------------------------------------------
  // vault 폴더 선택 → _index.nct + 하위 모든 content.nct 읽어서 일괄 병합
  // 핵심: webkitRelativePath로 폴더명을 직접 추출하여 folderMap 보강
  //   → 구버전 vault처럼 _index.nct에 folderMap이 없어도 정상 동작
  // Python으로 치면:
  //   def handle_folder_merge(folder):
  //     index = json.load(folder / '_index.nct')
  //     for f in folder.rglob('content.nct'):
  //       folder_name = f.parent.name   # 경로에서 폴더명 추출
  //       folder_map[page.id] = folder_name
  //     merge_api(index_with_patched_folder_map, pages)
  // -----------------------------------------------
  async function handleFolderMerge(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (!confirm(t.settings.data.mergeFolderConfirm)) {
      e.target.value = ''
      return
    }
    setIsMerging(true)
    setMergeStatus(null)
    try {
      // 선택한 폴더의 루트 이름 추출 (webkitRelativePath 첫 컴포넌트)
      // Python으로 치면: root = files[0].webkitRelativePath.split('/')[0]
      const rootPrefix = ((files[0] as File & { webkitRelativePath: string })?.webkitRelativePath?.split('/')[0] ?? '') + '/'

      // _index.nct / _index.json 찾기
      const indexFile =
        files.find(f => f.name === '_index.nct') ??
        files.find(f => f.name === '_index.json')

      // content.nct / content.json 수집
      const contentFiles = files.filter(
        f => f.name === 'content.nct' || f.name === 'content.json'
      )
      if (contentFiles.length === 0) {
        setMergeStatus({ type: 'error', msg: t.settings.data.mergeFolderEmpty })
        return
      }

      // 인덱스 파싱 (없으면 빈 객체)
      // Python으로 치면: index_data = json.load(index_file) if index_file else {}
      let indexData: Record<string, unknown> = {}
      if (indexFile) {
        indexData = JSON.parse(await indexFile.text())
      }

      // content.nct 파싱 + webkitRelativePath에서 폴더/카테고리 정보 추출
      // webkitRelativePath 예시:
      //   vault/abc-123/content.nct              → pageFolder='abc-123', catFolder=null
      //   vault/카테고리/abc-123/content.nct     → pageFolder='abc-123', catFolder='카테고리'
      // Python으로 치면:
      //   for f in content_files:
      //     parts = f.relative_path.split('/')
      //     page_folder = parts[-2]
      //     cat_folder  = parts[-3] if len(parts) >= 3 else None
      const pages = await Promise.all(contentFiles.map(async (file) => {
        const pageData = JSON.parse(await file.text())
        const wp = (file as File & { webkitRelativePath: string }).webkitRelativePath ?? ''
        const relativePath = wp.startsWith(rootPrefix) ? wp.slice(rootPrefix.length) : wp
        const parts = relativePath.split('/')
        const pageFolder = parts.length >= 2 ? parts[parts.length - 2] : ''
        // 3단계 경로(catFolder/pageFolder/content.nct)이면 카테고리 하위 페이지
        const catFolder  = parts.length >= 3 ? parts[parts.length - 3] : null
        return { pageData, pageFolder, catFolder }
      }))

      // 파일 경로에서 folderMap 구성
      // Python으로 치면: folder_map = {p.id: p.folder for p in pages if p.id}
      const folderMapFromPaths: Record<string, string> = {}
      pages.forEach(({ pageData, pageFolder }) => {
        if (pageData.id && pageFolder) folderMapFromPaths[pageData.id] = pageFolder
      })

      // 카테고리 folderName → id 역매핑 구성
      // Python으로 치면: cat_by_folder = {c['folderName']: c['id'] for c in index.categories}
      const catByFolder: Record<string, string> = {}
      ;((indexData.categories as Array<{ id: string; folderName: string }>) ?? []).forEach(cat => {
        if (cat.id && cat.folderName) catByFolder[cat.folderName] = cat.id
      })

      // 경로에서 categoryMap 구성 (catFolder가 있는 페이지만)
      // Python으로 치면:
      //   for p in pages:
      //     if p.cat_folder:
      //       category_map[p.id] = cat_by_folder.get(p.cat_folder)
      const categoryMapFromPaths: Record<string, string> = {}
      pages.forEach(({ pageData, catFolder }) => {
        if (pageData.id && catFolder) {
          const catId = catByFolder[catFolder]
          if (catId) categoryMapFromPaths[pageData.id] = catId
        }
      })

      const mergedFolderMap = {
        ...((indexData.folderMap as Record<string, string>) ?? {}),
        ...folderMapFromPaths,
      }
      const mergedCategoryMap = {
        ...((indexData.categoryMap as Record<string, string>) ?? {}),
        ...categoryMapFromPaths,
      }
      const pageOrderFromPaths = pages.map(({ pageData }) => pageData.id).filter(Boolean)
      const mergedIndex = {
        ...indexData,
        folderMap:   mergedFolderMap,
        categoryMap: mergedCategoryMap,
        pageOrder:   (indexData.pageOrder as string[] | undefined)?.length
          ? indexData.pageOrder
          : pageOrderFromPaths,
      }

      const cleanPages = pages.map(({ pageData }) => pageData)
      const result = await callMergeApi(mergedIndex, cleanPages)
      const msg = t.settings.data.mergeSuccess(result.added_pages ?? 0, result.skipped_pages ?? 0)
      setMergeStatus({ type: 'ok', msg })
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setMergeStatus({ type: 'error', msg: t.settings.data.mergeFail })
    } finally {
      setIsMerging(false)
      e.target.value = ''
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.data.title}</h3>
        <p className="text-xs text-gray-400 mb-6">
          {t.settings.data.titleDesc}
        </p>
      </div>

      {/* 내보내기 섹션 */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.data.exportSection}</h4>

        {/* .nct 백업 내보내기 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-800">{t.settings.data.jsonBackup}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.settings.data.jsonBackupDesc}</p>
          </div>
          <button
            type="button"
            onClick={downloadJSON}
            disabled={isExporting}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isExporting ? t.settings.data.processing : t.settings.data.download}
          </button>
        </div>

        {/* 마크다운 내보내기 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-800">{t.settings.data.markdownExportTitle}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.settings.data.markdownExportDesc}</p>
          </div>
          <button
            type="button"
            onClick={downloadMarkdown}
            disabled={isExporting}
            className="px-4 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isExporting ? t.settings.data.processing : t.settings.data.download}
          </button>
        </div>
      </section>

      {/* 복구 섹션 */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.data.restoreSection}</h4>

        <div className="px-4 py-3 rounded-xl border border-orange-200 bg-orange-50">
          <p className="text-xs text-orange-700 font-medium mb-3">
            {t.settings.data.restoreWarning}
          </p>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="px-4 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            {t.settings.data.restoreBtn}
          </button>
          <input ref={importRef} type="file" accept=".nct" onChange={handleImport} className="hidden" />
        </div>

        {importStatus && (
          <p className={importStatus.type === 'ok'
            ? "text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg"
            : "text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg"
          }>
            {importStatus.msg}
          </p>
        )}
      </section>

      {/* 병합 가져오기 섹션 */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.data.mergeSection}</h4>

        {/* .nct 백업 파일로 병합 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
          <div>
            <p className="text-sm font-medium text-blue-800">{t.settings.data.mergeFileTitle}</p>
            <p className="text-xs text-blue-600 mt-0.5">{t.settings.data.mergeJsonDesc}</p>
          </div>
          <button
            type="button"
            onClick={() => mergeRef.current?.click()}
            disabled={isMerging}
            className="shrink-0 ml-4 px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isMerging ? t.settings.data.processing : t.settings.data.mergeBtn}
          </button>
          <input ref={mergeRef} type="file" accept=".nct" onChange={handleMerge} className="hidden" />
        </div>

        {/* vault 폴더 통째로 병합 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
          <div>
            <p className="text-sm font-medium text-blue-800">{t.settings.data.mergeFolderTitle}</p>
            <p className="text-xs text-blue-600 mt-0.5">{t.settings.data.mergeFolderDesc}</p>
          </div>
          <button
            type="button"
            onClick={() => folderMergeRef.current?.click()}
            disabled={isMerging}
            className="shrink-0 ml-4 px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isMerging ? t.settings.data.processing : t.settings.data.mergeFolderBtn}
          </button>
          {/* webkitdirectory: 폴더 선택 다이얼로그 — TypeScript 비표준 속성이므로 spread로 전달 */}
          <input
            ref={folderMergeRef}
            type="file"
            onChange={handleFolderMerge}
            className="hidden"
            {...{ webkitdirectory: '', mozdirectory: '' }}
          />
        </div>

        {mergeStatus && (
          <p className={mergeStatus.type === 'ok'
            ? "text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg"
            : "text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg"
          }>
            {mergeStatus.msg}
          </p>
        )}
      </section>
    </div>
  )
}
