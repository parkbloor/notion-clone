import { create } from 'zustand'
import { diaryConfigApi, type DiaryConfig, type DiaryConfigStatus } from '@/lib/diaryConfig'

interface DiaryStore {
  diaryVaultName: string | null
  status: DiaryConfigStatus
  availableVaults: string[]
  loading: boolean
  loaded: boolean
  error: string | null
  load: (force?: boolean) => Promise<void>
  setDiaryVault: (vaultName: string | null) => Promise<void>
}

function applyConfig(config: DiaryConfig) {
  return {
    diaryVaultName: config.diaryVaultName,
    status: config.status,
    availableVaults: Array.isArray(config.availableVaults) ? config.availableVaults : [],
    loading: false,
    loaded: true,
    error: null,
  }
}

export const useDiaryStore = create<DiaryStore>((set, get) => ({
  diaryVaultName: null,
  status: 'unconfigured',
  availableVaults: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return
    set({ loading: true, error: null })
    try {
      set(applyConfig(await diaryConfigApi.get()))
    } catch (error) {
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : '일기 볼트 설정을 불러오지 못했습니다.',
      })
    }
  },

  setDiaryVault: async (vaultName) => {
    set({ loading: true, error: null })
    try {
      set(applyConfig(await diaryConfigApi.update(vaultName)))
    } catch (error) {
      const message = error instanceof Error ? error.message : '일기 볼트 설정을 저장하지 못했습니다.'
      set({ loading: false, error: message })
      throw error
    }
  },
}))
