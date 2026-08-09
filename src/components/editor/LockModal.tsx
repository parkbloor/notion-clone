// ==============================================
// src/components/editor/LockModal.tsx
// 역할: 페이지 잠금 설정/해제 PIN 모달
//   - mode='lock'  : PIN 2회 입력 → 잠금 설정
//   - mode='unlock': PIN 1회 입력 → 잠금 해제
// Python으로 치면: class LockModal(QDialog): ...
// ==============================================

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Lock, Unlock, X, Eye, EyeOff } from 'lucide-react'
import { useLocale } from '@/locales'

interface LockModalProps {
  // 'lock'  = 새 PIN 설정 (잠금)
  // 'unlock' = 기존 PIN 검증 (잠금 해제)
  // Python으로 치면: mode: Literal['lock', 'unlock']
  mode: 'lock' | 'unlock'
  // 잠금 설정 완료 → pinHash 전달
  // Python으로 치면: on_lock: Callable[[str], None]
  onLock?: (pinHash: string) => void
  // 잠금 해제 완료 콜백
  // Python으로 치면: on_unlock: Callable[[], None]
  onUnlock?: () => void
  // 취소 콜백
  // Python으로 치면: on_cancel: Callable[[], None]
  onCancel: () => void
  // 현재 저장된 PIN 해시 (unlock 모드에서 검증용)
  // Python으로 치면: stored_pin_hash: str | None = None
  storedPinHash?: string
}

// ── SHA-256 해시 헬퍼 ────────────────────────────
// Web Crypto API 사용 (브라우저 내장, 외부 라이브러리 불필요)
// Python으로 치면: def sha256(text): return hashlib.sha256(text.encode()).hexdigest()
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function LockModal({
  mode, onLock, onUnlock, onCancel, storedPinHash,
}: LockModalProps) {
  // 로케일 훅
  const t = useLocale()

  // ── PIN 입력 상태 ──────────────────────────────
  // Python으로 치면: self.pin = ''; self.pin_confirm = ''
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  // 에러 메시지 (불일치 / 오류 등)
  // Python으로 치면: self.error = ''
  const [error, setError] = useState('')
  // 로딩 (SHA-256 비동기 해시 중)
  // Python으로 치면: self.loading = False
  const [loading, setLoading] = useState(false)
  // PIN 표시/숨기기 토글
  // Python으로 치면: self.show_pin = False
  const [showPin, setShowPin] = useState(false)

  // ── 첫 입력창 자동 포커스 ─────────────────────
  const pinRef = useRef<HTMLInputElement>(null)
  useEffect(() => { pinRef.current?.focus() }, [])

  // ── Esc 키로 닫기 ─────────────────────────────
  // Python으로 치면: def on_key_down(e): if e.key == 'Escape': on_cancel()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // ── 잠금 설정: PIN 확인 후 SHA-256 해시 → onLock ─
  // Python으로 치면: def handle_lock(): hash = sha256(pin); on_lock(hash)
  const handleLock = useCallback(async () => {
    if (pin.length < 4) { setError(t.overlay.lock.errorTooShort); return }
    if (pin !== pinConfirm) { setError(t.overlay.lock.errorMismatch); return }
    setLoading(true)
    try {
      const hash = await sha256(pin)
      onLock?.(hash)
    } finally {
      setLoading(false)
    }
  }, [pin, pinConfirm, onLock, t.overlay.lock.errorMismatch, t.overlay.lock.errorTooShort])

  // ── 잠금 해제: 입력 PIN → SHA-256 → 저장된 해시와 비교 ─
  // Python으로 치면: def handle_unlock(): if sha256(pin) == stored_hash: on_unlock()
  const handleUnlock = useCallback(async () => {
    if (!pin) { setError(t.overlay.lock.errorEmpty); return }
    setLoading(true)
    try {
      const hash = await sha256(pin)
      if (hash === storedPinHash) {
        onUnlock?.()
      } else {
        setError(t.overlay.lock.errorWrong)
        setPin('')
        pinRef.current?.focus()
      }
    } finally {
      setLoading(false)
    }
  }, [pin, storedPinHash, onUnlock, t.overlay.lock.errorEmpty, t.overlay.lock.errorWrong])

  // ── Enter 키 제출 ─────────────────────────────
  // Python으로 치면: def on_enter(e): if e.key == 'Enter': handle_submit()
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !loading) {
      if (mode === 'lock') handleLock()
      else handleUnlock()
    }
  }

  return (
    // ── 모달 오버레이 ────────────────────────────
    // Python으로 치면: overlay = fixed full-screen semi-transparent bg
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex flex-col gap-5 relative">

        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>

        {/* 아이콘 + 제목 */}
        <div className="flex flex-col items-center gap-2">
          <div className={['w-12 h-12 rounded-full flex items-center justify-center', mode === 'lock' ? 'bg-amber-100' : 'bg-green-100'].join(' ')}>
            {mode === 'lock'
              ? <Lock size={22} className="text-amber-600" />
              : <Unlock size={22} className="text-green-600" />}
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            {mode === 'lock' ? t.overlay.lock.lockTitle : t.overlay.lock.unlockTitle}
          </h2>
          <p className="text-xs text-gray-400 text-center">
            {mode === 'lock' ? t.overlay.lock.lockDesc : t.overlay.lock.unlockDesc}
          </p>
        </div>

        {/* PIN 입력 */}
        <div className="flex flex-col gap-3">
          {/* 첫 번째 입력 */}
          <div className="relative">
            <input
              ref={pinRef}
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => { setPin(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'lock' ? t.overlay.lock.pinPlaceholder : t.overlay.lock.pinPlaceholderUnlock}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 pr-10 tracking-widest"
              maxLength={20}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPin(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* 잠금 모드: 확인 입력 */}
          {mode === 'lock' && (
            <input
              type={showPin ? 'text' : 'password'}
              value={pinConfirm}
              onChange={e => { setPinConfirm(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder={t.overlay.lock.pinConfirmPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 tracking-widest"
              maxLength={20}
              autoComplete="off"
            />
          )}

          {/* 에러 메시지 */}
          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>

        {/* 버튼 영역 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={mode === 'lock' ? handleLock : handleUnlock}
            disabled={loading}
            className={['flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors', mode === 'lock' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600', loading ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
          >
            {loading ? t.overlay.lock.processing : mode === 'lock' ? t.overlay.lock.lockBtn : t.overlay.lock.unlockBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
