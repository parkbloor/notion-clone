// =============================================
// src/components/settings/tabs/DataTab.tsx
// 역할: 데이터 내보내기/백업/복구 탭
// Python으로 치면: class DataSettings(SettingsTab): def render_export_buttons(): ...
// =============================================

'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'

const BASE_URL = 'http://localhost:8000'

export default function DataTab() {

  // 복구 파일 선택 input 참조
  // Python으로 치면: self.file_input_ref = None
  const importRef = useRef<HTMLInputElement>(null)

  // 복구 진행 상태 메시지
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // -----------------------------------------------
  // JSON 백업 다운로드
  // Python으로 치면: def download_json(self): response = requests.get(url); save_file(response.content)
  // -----------------------------------------------
  async function downloadJSON() {
    setIsExporting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/export/json`)
      if (!res.ok) throw new Error('내보내기 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notion-clone-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('JSON 내보내기 중 오류가 발생했습니다.')
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
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('마크다운 내보내기 중 오류가 발생했습니다.')
    } finally {
      setIsExporting(false)
    }
  }

  // -----------------------------------------------
  // JSON 백업에서 복구
  // Python으로 치면: def import_json(self, file): requests.post(url, data=file.read())
  // -----------------------------------------------
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      setImportStatus({ type: 'error', msg: '.json 파일만 가능합니다' })
      return
    }
    // 기존 데이터 덮어쓰기 확인
    if (!confirm('기존 모든 데이터가 덮어쓰입니다. 계속하시겠습니까?')) {
      e.target.value = ''
      return
    }
    try {
      const text = await file.text()
      const res = await fetch(`${BASE_URL}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      })
      if (!res.ok) throw new Error('복구 실패')
      setImportStatus({ type: 'ok', msg: '복구 완료! 페이지를 새로고침합니다.' })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setImportStatus({ type: 'error', msg: '복구 중 오류가 발생했습니다.' })
    }
    e.target.value = ''
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">데이터 관리</h3>
        <p className="text-xs text-gray-400 mb-6">
          전체 데이터를 내보내거나 백업 파일에서 복구합니다
        </p>
      </div>

      {/* 내보내기 섹션 */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">내보내기</h4>

        {/* JSON 내보내기 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-800">📦 JSON 백업</p>
            <p className="text-xs text-gray-400 mt-0.5">모든 페이지와 블록 데이터를 JSON으로 저장</p>
          </div>
          <button
            type="button"
            onClick={downloadJSON}
            disabled={isExporting}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isExporting ? '처리 중...' : '다운로드'}
          </button>
        </div>

        {/* 마크다운 내보내기 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-800">📝 마크다운 내보내기</p>
            <p className="text-xs text-gray-400 mt-0.5">모든 페이지를 .md 파일 ZIP으로 저장</p>
          </div>
          <button
            type="button"
            onClick={downloadMarkdown}
            disabled={isExporting}
            className="px-4 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isExporting ? '처리 중...' : '다운로드'}
          </button>
        </div>
      </section>

      {/* 복구 섹션 */}
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">복구</h4>

        <div className="px-4 py-3 rounded-xl border border-orange-200 bg-orange-50">
          <p className="text-xs text-orange-700 font-medium mb-3">
            ⚠️ 복구 시 기존 모든 데이터가 덮어쓰입니다
          </p>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="px-4 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            📂 백업 파일에서 복구
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* 복구 상태 메시지 */}
        {importStatus && (
          <p className={importStatus.type === 'ok'
            ? "text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg"
            : "text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg"
          }>
            {importStatus.msg}
          </p>
        )}
      </section>
    </div>
  )
}
