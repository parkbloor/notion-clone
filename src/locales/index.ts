// -----------------------------------------------
// 로케일 진입점
// useLocale()  : React 컴포넌트 내부용 — settingsStore 구독, 언어 변경 시 자동 리렌더
// getLocale()  : 컴포넌트 외부용 — 현재 스토어 스냅샷 반환 (훅 사용 불가 위치)
// Python으로 치면:
//   def use_locale() -> LocaleDict: return LOCALES[store.locale]
// -----------------------------------------------

import { ko } from './ko'
import { en } from './en'
import { useSettingsStore } from '@/store/settingsStore'

// 지원 언어 목록 — 새 언어 추가 시 여기에만 추가하면 됨
export const LOCALES = { ko, en } as const
export type LocaleKey = keyof typeof LOCALES

// Locale 타입 재export — 컴포넌트에서 import { Locale } from '@/locales' 가능
export type { Locale } from './ko'

// -----------------------------------------------
// useLocale — React 컴포넌트 내부에서 사용
// settingsStore.locale 값이 바뀌면 자동으로 리렌더링됨
// Python으로 치면: locale_dict = LOCALES[settings.locale]
// -----------------------------------------------
export function useLocale() {
  // Python으로 치면: locale = settings_store.locale
  const locale = useSettingsStore(s => s.locale)
  // 알 수 없는 locale 값이 들어오면 한국어로 폴백
  return (LOCALES[locale as LocaleKey] ?? ko)
}

// -----------------------------------------------
// getLocale — 컴포넌트 외부에서 사용 (모듈 레벨 상수 초기화 등)
// useSettingsStore.getState() 로 훅 없이 현재 값을 읽음
// Python으로 치면: locale_dict = LOCALES[settings_store.get_state().locale]
// -----------------------------------------------
export function getLocale() {
  const locale = useSettingsStore.getState().locale
  return (LOCALES[locale as LocaleKey] ?? ko)
}

// 언어 선택 UI용 옵션 목록
// Python으로 치면: LANGUAGE_OPTIONS = [{'value': 'ko', 'label': '한국어'}, ...]
export const LANGUAGE_OPTIONS: { value: LocaleKey; label: string; nativeLabel: string }[] = [
  { value: 'ko', label: '한국어', nativeLabel: '한국어' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
]
