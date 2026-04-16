// =============================================
// src/components/settings/tabs/CloudSyncTab.tsx
// 역할: Google Drive / OneDrive 연동 설정 탭
// Python으로 치면: class CloudSyncSettings(SettingsTab): def render(): ...
//
// 사용 전 준비:
//   Google Drive:
//     1. Google Cloud Console → 프로젝트 생성
//     2. Google Drive API 활성화
//     3. OAuth 2.0 클라이언트 ID 생성 (데스크톱 앱)
//     4. 리다이렉트 URI 추가: http://localhost:8000/api/cloud/google/callback
//   OneDrive:
//     1. Azure Portal → 앱 등록
//     2. 리다이렉트 URI 추가: http://localhost:8000/api/cloud/onedrive/callback
//     3. 플랫폼: 모바일 및 데스크톱 애플리케이션
// =============================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLocale } from '@/locales'

// Windows에서 localhost가 IPv6(::1)로 해석되는 문제 방지 — 127.0.0.1 고정
const BASE_URL = 'http://127.0.0.1:8000'

// 클라우드 제공자별 상태 타입
// Python으로 치면: @dataclass class ProviderStatus: connected: bool; email: str; ...
interface ProviderStatus {
  connected: boolean
  email: string
  last_upload: string
  configured: boolean
}

interface CloudStatus {
  google: ProviderStatus
  onedrive: ProviderStatus
}

type Provider = 'google' | 'onedrive'
type ActionState = 'idle' | 'loading' | 'success' | 'error'

// ── 상태 메시지 렌더 헬퍼 ──────────────────────────────────────
// 모듈 최상위로 분리 → 부모 리렌더에도 컴포넌트 타입 불변
// Python으로 치면: def render_msg(key, state, msg): return <p class={state}>{msg}</p>
interface MsgProps {
  actionKey: string
  actionState: Record<string, ActionState>
  actionMsg:   Record<string, string>
}
function Msg({ actionKey, actionState, actionMsg }: MsgProps) {
  const state = actionState[actionKey]
  const msg   = actionMsg[actionKey]
  if (!msg) return null
  const cls = state === 'success'
    ? "text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg mt-2"
    : "text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg mt-2"
  return <p className={cls}>{msg}</p>
}

// ── 제공자 카드 props ─────────────────────────────────────────
// Python으로 치면: @dataclass class ProviderCardProps: ...
interface ProviderCardProps {
  provider:    Provider
  icon:        string
  name:        string
  setupGuide:  { clientIdLabel: string; clientSecretLabel?: string }
  // 상태
  status:      CloudStatus | null
  polling:     Record<Provider, boolean>
  actionState: Record<string, ActionState>
  actionMsg:   Record<string, string>
  // 자격증명 입력 상태
  googleClientId:       string
  googleClientSecret:   string
  onedriveClientId:     string
  setGoogleClientId:    (v: string) => void
  setGoogleClientSecret:(v: string) => void
  setOnedriveClientId:  (v: string) => void
  // 액션 핸들러
  onUpload:        (p: Provider) => void
  onDownload:      (p: Provider) => void
  onDisconnect:    (p: Provider) => void
  onSaveConfig:    (p: Provider) => void
  onConnect:       (p: Provider) => void
  onCancelConnect: (p: Provider) => void
  // 번역
  t: ReturnType<typeof useLocale>
}

// ── 각 제공자 카드 렌더 ──────────────────────────────────────
// 모듈 최상위로 분리 → CloudSyncTab 리렌더 시 DOM 재마운트 방지
// Python으로 치면: class ProviderCard(Component): def render(self): ...
function ProviderCard({
  provider, icon, name, setupGuide,
  status, polling, actionState, actionMsg,
  googleClientId, googleClientSecret, onedriveClientId,
  setGoogleClientId, setGoogleClientSecret, setOnedriveClientId,
  onUpload, onDownload, onDisconnect, onSaveConfig, onConnect, onCancelConnect,
  t,
}: ProviderCardProps) {
  const ps = status?.[provider]
  const isConnected  = ps?.connected ?? false
  const isConfigured = ps?.configured ?? false
  const isPolling    = polling[provider]

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-semibold text-gray-800">{name}</span>
        </div>
        {isConnected ? (
          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full font-medium">
            ✅ {t.settings.cloud.connected}
          </span>
        ) : (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {t.settings.cloud.notConnected}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* 연결됨: 이메일 + 마지막 업로드 + 업로드/다운로드/해제 버튼 */}
        {isConnected ? (
          <>
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>{t.settings.cloud.accountLabel}: <span className="font-medium text-gray-700">{ps?.email}</span></p>
              {ps?.last_upload && (
                <p>{t.settings.cloud.lastUpload}: <span className="font-medium text-gray-700">{ps.last_upload}</span></p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onUpload(provider)}
                disabled={actionState[`${provider}_upload`] === 'loading'}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {actionState[`${provider}_upload`] === 'loading'
                  ? t.settings.cloud.uploading
                  : t.settings.cloud.uploadBtn}
              </button>
              <button
                type="button"
                onClick={() => onDownload(provider)}
                disabled={actionState[`${provider}_download`] === 'loading'}
                className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {actionState[`${provider}_download`] === 'loading'
                  ? t.settings.cloud.downloading
                  : t.settings.cloud.downloadBtn}
              </button>
              <button
                type="button"
                onClick={() => onDisconnect(provider)}
                className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
              >
                {t.settings.cloud.disconnectBtn}
              </button>
            </div>

            <Msg actionKey={`${provider}_upload`}      actionState={actionState} actionMsg={actionMsg} />
            <Msg actionKey={`${provider}_download`}    actionState={actionState} actionMsg={actionMsg} />
            <Msg actionKey={`${provider}_disconnect`}  actionState={actionState} actionMsg={actionMsg} />
          </>
        ) : (
          <>
            {/* 미연결: 자격증명 입력 + 연결 버튼 */}
            {/* CLIENT_ID 입력 */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">{setupGuide.clientIdLabel}</label>
              <input
                type="text"
                value={provider === 'google' ? googleClientId : onedriveClientId}
                onChange={e => provider === 'google'
                  ? setGoogleClientId(e.target.value)
                  : setOnedriveClientId(e.target.value)
                }
                placeholder="xxxxxx.apps.googleusercontent.com"
                className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white"
              />
            </div>

            {/* Google 전용: CLIENT_SECRET 입력 */}
            {setupGuide.clientSecretLabel && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500">{setupGuide.clientSecretLabel}</label>
                <input
                  type="password"
                  value={googleClientSecret}
                  onChange={e => setGoogleClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white"
                />
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {/* 자격증명 저장 */}
              <button
                type="button"
                onClick={() => onSaveConfig(provider)}
                disabled={actionState[`${provider}_save`] === 'loading'}
                className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {actionState[`${provider}_save`] === 'loading'
                  ? t.settings.cloud.saving
                  : t.settings.cloud.saveBtn}
              </button>

              {/* 연결 (자격증명이 저장된 경우에만 활성) */}
              {isConfigured && !isPolling && (
                <button
                  type="button"
                  onClick={() => onConnect(provider)}
                  disabled={actionState[`${provider}_connect`] === 'loading'}
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {actionState[`${provider}_connect`] === 'loading'
                    ? t.settings.cloud.connecting
                    : t.settings.cloud.connectBtn}
                </button>
              )}

              {/* 폴링 중: 대기 표시 + 취소 버튼 */}
              {isPolling && (
                <>
                  <span className="text-xs text-gray-400">⏳ {t.settings.cloud.connectWaiting}</span>
                  <button
                    type="button"
                    onClick={() => onCancelConnect(provider)}
                    className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    {t.settings.cloud.connectCancelBtn}
                  </button>
                </>
              )}
            </div>

            <Msg actionKey={`${provider}_save`}    actionState={actionState} actionMsg={actionMsg} />
            <Msg actionKey={`${provider}_connect`} actionState={actionState} actionMsg={actionMsg} />

            {/* 설정 가이드 안내 */}
            <details className="group">
              <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 select-none">
                {t.settings.cloud.setupGuide} ›
              </summary>
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1 leading-relaxed">
                {provider === 'google' ? (
                  <>
                    <p>1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-500 underline">Google Cloud Console</a> 접속</p>
                    <p>2. 새 프로젝트 생성 → Google Drive API 활성화</p>
                    <p>3. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기</p>
                    <p>4. 애플리케이션 유형: <b>데스크톱 앱</b></p>
                    <p>5. 클라이언트 ID / 보안 비밀 복사 후 위에 입력</p>
                  </>
                ) : (
                  <>
                    <p>1. <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="text-blue-500 underline">Azure Portal</a> 접속</p>
                    <p>2. Microsoft Entra ID → 앱 등록 → 새 등록</p>
                    <p>3. 리다이렉트 URI 플랫폼: <b>모바일 및 데스크톱 애플리케이션</b></p>
                    <p>4. 리다이렉트 URI 추가: <code className="bg-gray-200 px-1 rounded">http://localhost:8000/api/cloud/onedrive/callback</code></p>
                    <p>5. 애플리케이션(클라이언트) ID 복사 후 위에 입력</p>
                  </>
                )}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}

// ── 메인 탭 컴포넌트 ──────────────────────────────────────────
// Python으로 치면: class CloudSyncTab(SettingsTab): def render(self): ...
export default function CloudSyncTab() {
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 연결 상태
  // Python으로 치면: self.status = None
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  // 자격증명 입력 폼 상태 (각 제공자별)
  // Python으로 치면: self.google_client_id = self.google_client_secret = ''
  const [googleClientId,     setGoogleClientId]     = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [onedriveClientId,   setOnedriveClientId]   = useState('')

  // 각 액션 상태 (업로드/다운로드/연결/저장)
  // Python으로 치면: self.action_states = {'google_upload': 'idle', ...}
  const [actionState, setActionState] = useState<Record<string, ActionState>>({})
  const [actionMsg,   setActionMsg]   = useState<Record<string, string>>({})

  // OAuth 완료 대기 중 (폴링 중)
  // Python으로 치면: self.polling = {'google': False, 'onedrive': False}
  const [polling, setPolling] = useState<Record<Provider, boolean>>({
    google: false, onedrive: false,
  })

  // ── 상태 조회 ──────────────────────────────────
  // Python으로 치면: def fetch_status(self): self.status = requests.get('/api/cloud/status').json()
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/cloud/status`)
      if (r.ok) setStatus(await r.json())
    } catch {
      /* 서버 미연결 시 무시 */
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // ── OAuth 완료 폴링 ────────────────────────────
  // window.open() 후 백엔드가 토큰 저장할 때까지 2초마다 상태 확인
  // 최대 60회(2분) 후 자동 타임아웃 → polling 리셋 + 재시도 가능하게 복원
  // Python으로 치면: for _ in range(60): sleep(2); if connected: break else: timeout()
  useEffect(() => {
    const providers: Provider[] = ['google', 'onedrive']
    const timers: ReturnType<typeof setInterval>[] = []
    // 제공자별 폴링 횟수 카운터
    const counts: Record<Provider, number> = { google: 0, onedrive: 0 }
    const MAX_POLLS = 60  // 2초 × 60 = 최대 2분

    providers.forEach(provider => {
      if (!polling[provider]) return
      const timer = setInterval(async () => {
        counts[provider] += 1

        // 타임아웃: 최대 횟수 초과 시 폴링 종료 + 버튼 복원
        if (counts[provider] > MAX_POLLS) {
          clearInterval(timer)  // cleanup 전까지 중복 fire 방지
          setPolling(p => ({ ...p, [provider]: false }))
          setActionState(s => ({ ...s, [`${provider}_connect`]: 'error' }))
          setActionMsg(m => ({ ...m, [`${provider}_connect`]: t.settings.cloud.connectTimeout }))
          return
        }

        // updater 내 side effects 방지 — 직접 fetch 후 결과로 분기
        // Python으로 치면: result = requests.get('/api/cloud/status').json(); if result[provider]['connected']: ...
        try {
          const r = await fetch(`${BASE_URL}/api/cloud/status`)
          if (!r.ok) return
          const newStatus: CloudStatus = await r.json()
          setStatus(newStatus)
          if (newStatus[provider]?.connected) {
            clearInterval(timer)
            setPolling(p => ({ ...p, [provider]: false }))
            setActionState(s => ({ ...s, [`${provider}_connect`]: 'success' }))
            setActionMsg(m => ({ ...m, [`${provider}_connect`]: t.settings.cloud.connectSuccess }))
          }
        } catch { /* 서버 미연결 시 무시 */ }
      }, 2000)
      timers.push(timer)
    })

    return () => timers.forEach(clearInterval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling])

  // ── 자격증명 저장 ──────────────────────────────
  // Python으로 치면: def save_config(provider, client_id, client_secret): requests.post('/api/cloud/config', ...)
  async function saveConfig(provider: Provider) {
    const key = `${provider}_save`
    setActionState(s => ({ ...s, [key]: 'loading' }))
    try {
      const body: Record<string, string> = { provider }
      if (provider === 'google') {
        body.client_id     = googleClientId.trim()
        body.client_secret = googleClientSecret.trim()
      } else {
        body.client_id = onedriveClientId.trim()
      }
      const r = await fetch(`${BASE_URL}/api/cloud/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error()
      setActionState(s => ({ ...s, [key]: 'success' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.savedOk }))
      await fetchStatus()
    } catch {
      setActionState(s => ({ ...s, [key]: 'error' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.saveFail }))
    }
  }

  // ── OAuth 연결 시작 ────────────────────────────
  // auth-url 요청 → 브라우저 창 열기 → 폴링 시작
  // Python으로 치면: def connect(provider): url = get_auth_url(); webbrowser.open(url)
  async function connect(provider: Provider) {
    const key = `${provider}_connect`
    setActionState(s => ({ ...s, [key]: 'loading' }))
    setActionMsg(m => ({ ...m, [key]: '' }))
    try {
      const r = await fetch(`${BASE_URL}/api/cloud/${provider}/auth-url`)
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.detail ?? '')
      }
      const { url } = await r.json()
      window.open(url, '_blank', 'width=600,height=700')
      // 브라우저에서 인증 완료 후 폴링으로 감지
      setPolling(p => ({ ...p, [provider]: true }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.connectWaiting }))
    } catch (err: unknown) {
      setActionState(s => ({ ...s, [key]: 'error' }))
      const msg = err instanceof Error ? err.message : ''
      setActionMsg(m => ({ ...m, [key]: msg || t.settings.cloud.connectFail }))
    }
  }

  // ── 연결 해제 ──────────────────────────────────
  // Python으로 치면: def disconnect(provider): requests.delete(f'/api/cloud/{provider}/disconnect')
  async function disconnect(provider: Provider) {
    if (!confirm(t.settings.cloud.disconnectConfirm)) return
    const key = `${provider}_disconnect`
    setActionState(s => ({ ...s, [key]: 'loading' }))
    setActionMsg(m => ({ ...m, [key]: '' }))
    try {
      const r = await fetch(`${BASE_URL}/api/cloud/${provider}/disconnect`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      await fetchStatus()
      setActionState(s => ({ ...s, [key]: 'idle' }))
    } catch {
      setActionState(s => ({ ...s, [key]: 'error' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.disconnectFail }))
    }
  }

  // ── 업로드 ─────────────────────────────────────
  // Python으로 치면: def upload(provider): requests.post(f'/api/cloud/{provider}/upload')
  async function upload(provider: Provider) {
    const key = `${provider}_upload`
    setActionState(s => ({ ...s, [key]: 'loading' }))
    setActionMsg(m => ({ ...m, [key]: '' }))
    try {
      const r = await fetch(`${BASE_URL}/api/cloud/${provider}/upload`, { method: 'POST' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setActionState(s => ({ ...s, [key]: 'success' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.uploadOk(data.size_kb ?? 0) }))
      await fetchStatus()
    } catch {
      setActionState(s => ({ ...s, [key]: 'error' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.uploadFail }))
    }
  }

  // ── OAuth 연결 취소 ────────────────────────────
  // 폴링 중 사용자가 취소 → polling 리셋 + actionState 복원
  // Python으로 치면: def cancel_connect(provider): self.polling[provider] = False; reset_state()
  function cancelConnect(provider: Provider) {
    setPolling(p => ({ ...p, [provider]: false }))
    setActionState(s => ({ ...s, [`${provider}_connect`]: 'idle' }))
    setActionMsg(m => ({ ...m, [`${provider}_connect`]: '' }))
  }

  // ── 다운로드 ────────────────────────────────────
  // Python으로 치면: def download(provider): requests.post(f'/api/cloud/{provider}/download')
  async function download(provider: Provider) {
    if (!confirm(t.settings.cloud.downloadConfirm)) return
    const key = `${provider}_download`
    setActionState(s => ({ ...s, [key]: 'loading' }))
    setActionMsg(m => ({ ...m, [key]: '' }))
    try {
      const r = await fetch(`${BASE_URL}/api/cloud/${provider}/download`, { method: 'POST' })
      if (!r.ok) throw new Error()
      setActionState(s => ({ ...s, [key]: 'success' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.downloadOk }))
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setActionState(s => ({ ...s, [key]: 'error' }))
      setActionMsg(m => ({ ...m, [key]: t.settings.cloud.downloadFail }))
    }
  }

  // ProviderCard에 전달할 공통 props
  // Python으로 치면: common_props = {'status': status, 'polling': polling, ...}
  const cardCommonProps = {
    status, polling, actionState, actionMsg,
    googleClientId, googleClientSecret, onedriveClientId,
    setGoogleClientId, setGoogleClientSecret, setOnedriveClientId,
    onUpload: upload, onDownload: download, onDisconnect: disconnect,
    onSaveConfig: saveConfig, onConnect: connect, onCancelConnect: cancelConnect,
    t,
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.cloud.title}</h3>
        <p className="text-xs text-gray-400 mb-6">{t.settings.cloud.titleDesc}</p>
      </div>

      {statusLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <span className="animate-spin">⟳</span> {t.settings.cloud.loading}
        </div>
      ) : (
        <div className="space-y-4">
          <ProviderCard
            provider="google"
            icon="🔵"
            name="Google Drive"
            setupGuide={{
              clientIdLabel:     t.settings.cloud.googleClientId,
              clientSecretLabel: t.settings.cloud.googleClientSecret,
            }}
            {...cardCommonProps}
          />
          <ProviderCard
            provider="onedrive"
            icon="🟦"
            name="OneDrive"
            setupGuide={{
              clientIdLabel: t.settings.cloud.onedriveClientId,
            }}
            {...cardCommonProps}
          />
        </div>
      )}

      {/* 다운로드 주의 안내 */}
      <p className="text-xs text-orange-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
        {t.settings.cloud.downloadWarning}
      </p>
    </div>
  )
}
