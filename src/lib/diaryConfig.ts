import { BASE_URL } from '@/lib/api'

export type DiaryConfigStatus = 'unconfigured' | 'ready' | 'missing'

export interface DiaryConfig {
  version: 1
  diaryVaultName: string | null
  status: DiaryConfigStatus
  availableVaults: string[]
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error(typeof body.detail === 'string' ? body.detail : fallback)
}

export const diaryConfigApi = {
  get: async (): Promise<DiaryConfig> => {
    const response = await fetch(`${BASE_URL}/api/settings/diary`)
    if (!response.ok) throw await responseError(response, '일기 볼트 설정을 불러오지 못했습니다.')
    return response.json()
  },

  update: async (diaryVaultName: string | null): Promise<DiaryConfig> => {
    const response = await fetch(`${BASE_URL}/api/settings/diary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diaryVaultName }),
    })
    if (!response.ok) throw await responseError(response, '일기 볼트 설정을 저장하지 못했습니다.')
    return response.json()
  },
}
