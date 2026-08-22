import { create } from 'zustand'
import {
  vaultPreferencesApi,
  type VaultPlannerFeatures,
  type VaultPreferences,
} from '@/lib/api'

export const DEFAULT_VAULT_PREFERENCES: VaultPreferences = {
  planner: {
    // 일반 볼트에서는 플래너 UI와 자동 진입점을 기본으로 숨긴다.
    mode: 'off',
    homePageId: null,
    dailyNoteTemplate: 'standard',
    dailyCustomTemplateId: null,
    todayShortcut: true,
    planMenu: true,
    reviews: true,
    calendar: true,
    timeline: true,
    routines: true,
    slashPlannerBlocks: true,
  },
}

interface VaultPreferencesStore {
  preferences: VaultPreferences
  vaultName: string | null
  loading: boolean
  error: string | null
  clearForVault: () => void
  loadForVault: (vaultName: string, force?: boolean) => Promise<void>
  setPlannerFeature: <K extends keyof VaultPlannerFeatures>(
    key: K,
    value: VaultPlannerFeatures[K],
  ) => Promise<void>
}

let loadSequence = 0

export const useVaultPreferencesStore = create<VaultPreferencesStore>((set, get) => ({
  preferences: DEFAULT_VAULT_PREFERENCES,
  vaultName: null,
  loading: false,
  error: null,

  // 볼트 전환 직후 이전 볼트의 플래너 진입점이 잠깐 보이지 않도록 즉시 비운다.
  // Python으로 치면: def clear_for_vault(): self.preferences = DEFAULT; self.vault_name = None
  clearForVault: () => {
    loadSequence += 1
    set({
      preferences: DEFAULT_VAULT_PREFERENCES,
      vaultName: null,
      loading: false,
      error: null,
    })
  },

  loadForVault: async (vaultName, force = false) => {
    if (!vaultName) return
    const current = get()
    if (!force && current.vaultName === vaultName && !current.error) return

    const sequence = ++loadSequence
    set({
      preferences: DEFAULT_VAULT_PREFERENCES,
      vaultName,
      loading: true,
      error: null,
    })
    try {
      const preferences = await vaultPreferencesApi.get()
      if (sequence !== loadSequence) return
      set({ preferences, loading: false })
    } catch (error) {
      if (sequence !== loadSequence) return
      set({
        preferences: DEFAULT_VAULT_PREFERENCES,
        loading: false,
        error: error instanceof Error ? error.message : '볼트 기능 설정 불러오기 실패',
      })
    }
  },

  setPlannerFeature: async (key, value) => {
    const previous = get().preferences
    const targetVault = get().vaultName
    const next: VaultPreferences = {
      ...previous,
      planner: { ...previous.planner, [key]: value },
    }
    set({ preferences: next, error: null })
    try {
      const saved = await vaultPreferencesApi.updatePlanner({ [key]: value })
      if (get().vaultName === targetVault) set({ preferences: saved })
    } catch (error) {
      if (get().vaultName === targetVault) {
        set({
          preferences: previous,
          error: error instanceof Error ? error.message : '볼트 기능 설정 저장 실패',
        })
      }
      throw error
    }
  },
}))
