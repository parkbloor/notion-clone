import { BASE_URL } from '@/lib/api'

export interface VaultEntry {
  name: string
  path: string
  page_count: number
  initialized: boolean
  is_current: boolean
}

export interface VaultGroup {
  id: string
  name: string
  vaults: string[]
}

export interface VaultGroupState {
  groups: VaultGroup[]
  vaults: VaultEntry[]
  ungrouped: string[]
}

async function responseError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}))
  return new Error(typeof data.detail === 'string' ? data.detail : fallback)
}

export async function loadVaultGroups(): Promise<VaultGroupState> {
  const res = await fetch(`${BASE_URL}/api/settings/vault-groups`)
  if (!res.ok) throw await responseError(res, '볼트 그룹을 불러오지 못했습니다.')
  return res.json()
}

export async function saveVaultGroups(groups: VaultGroup[]): Promise<VaultGroup[]> {
  const res = await fetch(`${BASE_URL}/api/settings/vault-groups`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups }),
  })
  if (!res.ok) throw await responseError(res, '볼트 그룹을 저장하지 못했습니다.')
  const data = await res.json()
  return data.groups
}

export async function switchVault(vaultName: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/settings/switch-vault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_name: vaultName }),
  })
  if (!res.ok) throw await responseError(res, '볼트를 전환하지 못했습니다.')
}
