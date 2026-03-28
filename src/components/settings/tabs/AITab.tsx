// =============================================
// src/components/settings/tabs/AITab.tsx
// 역할: AI 설정 탭 — 제공자 선택, API 키 입력, 모델 선택, 연결 테스트
// Python으로 치면: class AITab(QWidget): def render(self): ...
// =============================================

'use client'

import { useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocale } from '@/locales'

// -----------------------------------------------
// 제공자별 지원 모델 목록
// Python으로 치면: MODELS = {'openai': [...], 'claude': [...]}
// -----------------------------------------------
const OPENAI_MODELS = [
  { value: 'gpt-4o-mini',   label: 'GPT-4o mini  (빠름·저렴·추천)' },
  { value: 'gpt-4o',        label: 'GPT-4o  (강력·고비용)' },
  { value: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo  (최저비용)' },
]

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-6',       label: 'Claude Sonnet 4.6  (추천)' },
  { value: 'claude-opus-4-6',         label: 'Claude Opus 4.6  (강력·고비용)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5  (빠름·저렴)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-opus-20240229',  label: 'Claude 3 Opus' },
]

export default function AITab() {
  // 로케일 훅 — Python으로 치면: t = get_translation()
  const t = useLocale()
  const {
    aiProvider, aiModel, aiApiKey, ollamaUrl,
    setAiProvider, setAiModel, setAiApiKey, setOllamaUrl,
  } = useSettingsStore()

  // API 키 표시/숨김 토글
  // Python으로 치면: self.show_key = False
  const [showKey, setShowKey] = useState(false)

  // 연결 테스트 상태: 'idle' | 'loading' | 'ok' | 'error'
  // Python으로 치면: self.test_status = 'idle'
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg]       = useState('')

  // -----------------------------------------------
  // 제공자 변경 시 모델 기본값 자동 전환
  // Python으로 치면: def on_provider_change(p): self.ai_provider = p; self.ai_model = DEFAULT_MODEL[p]
  // -----------------------------------------------
  function handleProviderChange(provider: string) {
    setAiProvider(provider)
    setTestStatus('idle')
    setTestMsg('')
    if (provider === 'openai') setAiModel('gpt-4o-mini')
    else if (provider === 'claude') setAiModel('claude-sonnet-4-6')
    else if (provider === 'ollama') setAiModel('llama3.2')
  }

  // -----------------------------------------------
  // 연결 테스트 — POST /api/ai/test 호출
  // Python으로 치면: async def test_connection(self): ...
  // -----------------------------------------------
  async function handleTest() {
    if (aiProvider !== 'ollama' && !aiApiKey.trim()) {
      setTestStatus('error')
      setTestMsg(t.settings.ai.apiKeyRequired)
      return
    }
    setTestStatus('loading')
    setTestMsg('')
    try {
      const body: Record<string, string> = {
        provider: aiProvider,
        model: aiModel,
        api_key: aiApiKey,
      }
      // Ollama는 base_url 추가 전송
      if (aiProvider === 'ollama') body.base_url = ollamaUrl

      const res = await fetch('http://localhost:8000/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setTestStatus('ok')
        setTestMsg(`${t.settings.ai.testSuccessPrefix}${data.model}`)
      } else {
        setTestStatus('error')
        setTestMsg(data.detail ?? t.settings.ai.testFail)
      }
    } catch {
      setTestStatus('error')
      setTestMsg(t.settings.ai.serverError)
    }
  }

  // -----------------------------------------------
  // 현재 제공자에 맞는 모델 드롭다운 목록 반환
  // Python으로 치면: def get_models(provider): return MODELS[provider]
  // -----------------------------------------------
  function getModels() {
    if (aiProvider === 'openai') return OPENAI_MODELS
    if (aiProvider === 'claude') return CLAUDE_MODELS
    return null  // Ollama: 자유 입력
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── 헤더 ─────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{t.settings.ai.header}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {t.settings.ai.headerDesc}
        </p>
      </div>

      {/* ── 제공자 선택 ─────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">{t.settings.ai.providerLabel}</label>
        <div className="flex gap-2">
          {/* OpenAI 버튼 */}
          <button
            type="button"
            onClick={() => handleProviderChange('openai')}
            className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${aiProvider === 'openai' ? 'bg-green-50 border-green-400 text-green-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            🟢 OpenAI
          </button>
          {/* Claude 버튼 */}
          <button
            type="button"
            onClick={() => handleProviderChange('claude')}
            className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${aiProvider === 'claude' ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            🟠 Claude
          </button>
          {/* Ollama 버튼 */}
          <button
            type="button"
            onClick={() => handleProviderChange('ollama')}
            className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${aiProvider === 'ollama' ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            🔵 Ollama
          </button>
        </div>
      </div>

      {/* ── 모델 선택 (OpenAI / Claude) ──────── */}
      {/* Ollama는 자유 입력 — 아래 별도 섹션 */}
      {/* Python으로 치면: if provider in ('openai', 'claude'): render_model_select() */}
      {aiProvider !== 'ollama' && getModels() && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">{t.settings.ai.model}</label>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-700"
          >
            {getModels()!.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── API 키 입력 (OpenAI / Claude) ──────── */}
      {/* Python으로 치면: if provider != 'ollama': render_api_key_input() */}
      {aiProvider !== 'ollama' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">{t.settings.ai.apiKey}</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={aiApiKey}
              onChange={(e) => { setAiApiKey(e.target.value); setTestStatus('idle') }}
              placeholder={aiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              spellCheck={false}
              className="w-full pr-16 pl-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 font-mono text-gray-700"
            />
            {/* 표시/숨김 토글 버튼 */}
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded"
            >
              {showKey ? t.settings.ai.keyHide : t.settings.ai.keyShow}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {t.settings.ai.apiKeyHint}
          </p>
        </div>
      )}

      {/* ── Ollama 전용 설정 ────────────────── */}
      {/* Python으로 치면: if provider == 'ollama': render_ollama_settings() */}
      {aiProvider === 'ollama' && (
        <div className="space-y-4">
          {/* 서버 URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">{t.settings.ai.ollamaUrl}</label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => { setOllamaUrl(e.target.value); setTestStatus('idle') }}
              placeholder="http://localhost:11434"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 font-mono text-gray-700"
            />
            <p className="text-xs text-gray-400">
              {t.settings.ai.ollamaUrlDesc}
            </p>
          </div>
          {/* 모델 이름 (자유 입력) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">{t.settings.ai.ollamaModelLabel}</label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="llama3.2"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 font-mono text-gray-700"
            />
            <p className="text-xs text-gray-400">
              {t.settings.ai.ollamaModelDesc}
            </p>
          </div>
          {/* Ollama 설치 안내 */}
          <div className="bg-blue-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-medium text-blue-700">{t.settings.ai.ollamaGuideTitle}</p>
            <p className="text-xs text-blue-600">{t.settings.ai.ollamaStep1}</p>
            <p className="text-xs text-blue-600">{t.settings.ai.ollamaStep2.replace('{cmd}', '')}<code className="bg-blue-100 px-1 rounded font-mono">ollama pull llama3.2</code></p>
            <p className="text-xs text-blue-600">{t.settings.ai.ollamaStep3}</p>
          </div>
        </div>
      )}

      {/* ── 연결 테스트 버튼 ────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === 'loading'}
          className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testStatus === 'loading' ? t.settings.ai.testing : t.settings.ai.testConnection}
        </button>

        {/* 테스트 결과 메시지 */}
        {testStatus === 'ok'    && <span className="text-xs text-green-600">✓ {testMsg}</span>}
        {testStatus === 'error' && <span className="text-xs text-red-500">✗ {testMsg}</span>}
      </div>

      {/* ── 사용 안내 ───────────────────────── */}
      <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
        <p className="text-xs font-medium text-blue-700">{t.settings.ai.usageTitle}</p>
        <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
          <li>{t.settings.ai.usageStep1}</li>
          <li>{t.settings.ai.usageStep2}</li>
          <li>{t.settings.ai.usageStep3}</li>
        </ul>
      </div>

    </div>
  )
}
