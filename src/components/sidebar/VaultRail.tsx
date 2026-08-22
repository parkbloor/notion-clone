'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Archive,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/locales'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import {
  loadVaultGroups,
  VAULT_LIST_CHANGED_EVENT,
  saveVaultGroups,
  switchVault,
  type VaultEntry,
  type VaultGroup,
  type VaultGroupState,
} from '@/lib/vaultGroups'

const GROUP_ICONS: LucideIcon[] = [BriefcaseBusiness, GraduationCap, UserRound, Archive]
const VAULT_DRAG_TYPE = 'application/x-notion-clone-vault'

function stateWithGroups(state: VaultGroupState, groups: VaultGroup[]): VaultGroupState {
  const assigned = new Set(groups.flatMap(group => group.vaults))
  return {
    ...state,
    groups,
    ungrouped: state.vaults.map(vault => vault.name).filter(name => !assigned.has(name)),
  }
}

function vaultInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'V'
}

export default function VaultRail() {
  const t = useLocale()
  const s = t.sidebar
  const railRef = useRef<HTMLDivElement>(null)
  const { vaultRailCollapsed, toggleVaultRailCollapsed } = useSettingsStore()
  const { currentVaultName, resetStore, loadFromServer } = usePageStore()

  const [state, setState] = useState<VaultGroupState | null>(null)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refreshVaultGroups = () => {
      loadVaultGroups()
        .then(data => { if (!cancelled) setState(data) })
        .catch(() => { if (!cancelled) toast.error(s.vaultGroupLoadError) })
    }

    refreshVaultGroups()
    window.addEventListener(VAULT_LIST_CHANGED_EVENT, refreshVaultGroups)
    return () => {
      cancelled = true
      window.removeEventListener(VAULT_LIST_CHANGED_EVENT, refreshVaultGroups)
    }
  }, [s.vaultGroupLoadError])

  useEffect(() => {
    if (!openGroupId) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!railRef.current?.contains(event.target as Node)) setOpenGroupId(null)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [openGroupId])

  const vaultByName = useMemo(
    () => new Map((state?.vaults ?? []).map(vault => [vault.name, vault])),
    [state?.vaults]
  )
  const activeGroup = state?.groups.find(group => group.id === openGroupId) ?? null
  const panelVaultNames = openGroupId === 'ungrouped'
    ? (state?.ungrouped ?? [])
    : (activeGroup?.vaults ?? [])

  async function persistGroups(nextGroups: VaultGroup[]): Promise<boolean> {
    if (!state || saving) return false
    const previous = state
    setState(stateWithGroups(state, nextGroups))
    setSaving(true)
    try {
      const saved = await saveVaultGroups(nextGroups)
      setState(current => current ? stateWithGroups(current, saved) : current)
      return true
    } catch (error) {
      setState(previous)
      toast.error(error instanceof Error ? error.message : s.vaultGroupSaveError)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function createGroup() {
    const name = newGroupName.trim()
    if (!state || !name) return
    const group: VaultGroup = { id: crypto.randomUUID(), name, vaults: [] }
    if (await persistGroups([...state.groups, group])) {
      setNewGroupName('')
      setOpenGroupId(group.id)
    }
  }

  async function renameGroup(group: VaultGroup) {
    const name = editingName.trim()
    if (!state || !name) return
    const next = state.groups.map(item => item.id === group.id ? { ...item, name } : item)
    if (await persistGroups(next)) setEditingGroupId(null)
  }

  async function deleteGroup(group: VaultGroup) {
    if (!state) return
    if (group.vaults.length > 0) {
      toast.warning(s.groupMustBeEmpty)
      return
    }
    if (await persistGroups(state.groups.filter(item => item.id !== group.id))) {
      setOpenGroupId(null)
    }
  }

  async function moveVault(vaultName: string, targetGroupId: string | null) {
    if (!state || saving) return
    const next = state.groups.map(group => ({
      ...group,
      vaults: group.vaults.filter(name => name !== vaultName),
    }))
    if (targetGroupId) {
      const target = next.find(group => group.id === targetGroupId)
      if (!target || target.vaults.includes(vaultName)) return
      target.vaults.push(vaultName)
    }
    await persistGroups(next)
  }

  function startVaultDrag(event: DragEvent, vaultName: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(VAULT_DRAG_TYPE, vaultName)
  }

  function dropVault(event: DragEvent, targetGroupId: string | null) {
    event.preventDefault()
    const vaultName = event.dataTransfer.getData(VAULT_DRAG_TYPE)
    if (vaultName) void moveVault(vaultName, targetGroupId)
  }

  async function handleSwitch(vault: VaultEntry) {
    if (switching) return
    if (vault.name === currentVaultName || vault.is_current) {
      setOpenGroupId(null)
      return
    }
    setSwitching(vault.name)
    try {
      await switchVault(vault.name)
      resetStore()
      await loadFromServer()
      const refreshed = await loadVaultGroups()
      setState(refreshed)
      setOpenGroupId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : s.vaultSwitchError)
    } finally {
      setSwitching(null)
    }
  }

  if (vaultRailCollapsed) {
    return (
      <aside
        className="relative z-40 h-full w-5 shrink-0 border-r flex flex-col items-center"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={toggleVaultRailCollapsed}
          className="mt-2 flex h-7 w-4 items-center justify-center rounded-r text-gray-400 hover:text-gray-700 hover:bg-black/5"
          title={s.expandVaultRail}
        >
          <ChevronRight size={14} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={railRef}
      className="relative z-40 h-full w-[72px] shrink-0 border-r flex flex-col"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      aria-label={s.vaultGroups}
    >
      <div className="h-10 flex items-center justify-between px-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-[10px] font-semibold truncate" style={{ color: 'var(--color-text-muted)' }}>{s.vaultGroups}</span>
        <button
          type="button"
          onClick={toggleVaultRailCollapsed}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-black/5"
          title={s.collapseVaultRail}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1.5 space-y-1">
        {state?.groups.map((group, index) => {
          const Icon = GROUP_ICONS[index % GROUP_ICONS.length]
          const containsCurrent = group.vaults.includes(currentVaultName)
          const isOpen = openGroupId === group.id
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setOpenGroupId(current => current === group.id ? null : group.id)}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
              onDrop={event => dropVault(event, group.id)}
              className="relative w-full min-h-14 rounded-lg px-1 py-1.5 flex flex-col items-center justify-center gap-1 transition-colors"
              style={{
                background: isOpen ? 'var(--color-accent-soft)' : 'transparent',
                color: isOpen || containsCurrent ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
              title={group.name}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="w-full truncate text-center text-[10px] leading-tight">{group.name}</span>
              {containsCurrent && <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setOpenGroupId(current => current === 'ungrouped' ? null : 'ungrouped')}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
          onDrop={event => dropVault(event, null)}
          className="relative w-full min-h-14 rounded-lg px-1 py-1.5 flex flex-col items-center justify-center gap-1 transition-colors"
          style={{
            background: openGroupId === 'ungrouped' ? 'var(--color-accent-soft)' : 'transparent',
            color: openGroupId === 'ungrouped' ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
          title={s.ungroupedVaults}
        >
          <Archive size={18} strokeWidth={1.8} />
          <span className="w-full truncate text-center text-[10px] leading-tight">{s.ungroupedVaults}</span>
          {(state?.ungrouped.length ?? 0) > 0 && (
            <span className="absolute right-1 top-1 rounded-full px-1 text-[8px] font-semibold" style={{ background: 'var(--color-sunken)' }}>
              {state?.ungrouped.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpenGroupId('create')}
          className="w-full min-h-12 rounded-lg px-1 py-1.5 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
          title={s.newVaultGroup}
        >
          <FolderPlus size={18} />
          <span className="text-[10px]">{s.newVaultGroup}</span>
        </button>
      </div>

      {openGroupId && (
        <div
          className="absolute left-full top-0 h-full w-64 border-r shadow-xl flex flex-col"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}
        >
          <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <Folder size={16} style={{ color: 'var(--color-accent)' }} />
            {activeGroup && editingGroupId === activeGroup.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={event => setEditingName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void renameGroup(activeGroup)
                  if (event.key === 'Escape') setEditingGroupId(null)
                }}
                onBlur={() => { if (editingName.trim()) void renameGroup(activeGroup); else setEditingGroupId(null) }}
                className="min-w-0 flex-1 rounded px-2 py-1 text-sm outline-none border"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-accent)' }}
              />
            ) : (
              <strong className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--color-text)' }}>
                {activeGroup?.name ?? (openGroupId === 'ungrouped' ? s.ungroupedVaults : s.newVaultGroup)}
              </strong>
            )}
            {activeGroup && editingGroupId !== activeGroup.id && (
              <button
                type="button"
                onClick={() => { setEditingGroupId(activeGroup.id); setEditingName(activeGroup.name) }}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-black/5"
                title={s.renameVaultGroup}
              >
                <Pencil size={13} />
              </button>
            )}
            {activeGroup && (
              <button
                type="button"
                onClick={() => void deleteGroup(activeGroup)}
                disabled={activeGroup.vaults.length > 0 || saving}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-25"
                title={activeGroup.vaults.length > 0 ? s.groupMustBeEmpty : s.deleteVaultGroup}
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpenGroupId(null)}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-black/5"
              title={t.common.close}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {openGroupId === 'create' ? (
              <div className="p-2 space-y-2">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{s.groupNamePlaceholder}</label>
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={event => setNewGroupName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void createGroup()
                    if (event.key === 'Escape') setOpenGroupId(null)
                  }}
                  placeholder={s.groupNamePlaceholder}
                  className="w-full rounded-md px-2.5 py-2 text-sm outline-none border"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
                />
                <button
                  type="button"
                  onClick={() => void createGroup()}
                  disabled={!newGroupName.trim() || saving}
                  className="w-full rounded-md py-2 text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {saving ? <Loader2 size={15} className="mx-auto animate-spin" /> : s.newVaultGroup}
                </button>
              </div>
            ) : (
              <>
                <p className="px-2 py-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{s.dragVaultHint}</p>
                <div
                  className="min-h-12 rounded-md"
                  onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
                  onDrop={event => dropVault(event, activeGroup?.id ?? null)}
                >
                  {panelVaultNames.length === 0 && (
                    <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.emptyVaultGroup}</div>
                  )}
                  {panelVaultNames.map(name => {
                    const vault = vaultByName.get(name)
                    if (!vault) return null
                    const isCurrent = vault.name === currentVaultName || vault.is_current
                    return (
                      <div
                        key={vault.name}
                        draggable={!saving && !switching}
                        onDragStart={event => startVaultDrag(event, vault.name)}
                        className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-black/5"
                      >
                        <span className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: 'var(--color-sunken)', color: 'var(--color-text-muted)' }}>
                          {vaultInitial(vault.name)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSwitch(vault)}
                          className="min-w-0 flex-1 text-left"
                          title={`${s.switchVault}: ${vault.name}`}
                        >
                          <span className="block truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{vault.name}</span>
                          <span className="block text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{vault.page_count}{s.pagesCountSuffix}</span>
                        </button>
                        {switching === vault.name ? <Loader2 size={14} className="animate-spin" /> : isCurrent ? <Check size={14} style={{ color: 'var(--color-accent)' }} /> : null}
                        {activeGroup && (
                          <button
                            type="button"
                            onClick={() => void moveVault(vault.name, null)}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                            title={s.removeFromGroup}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {activeGroup && (state?.ungrouped.length ?? 0) > 0 && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="px-2 pb-1 text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>{s.ungroupedVaults}</div>
                    {state?.ungrouped.map(name => {
                      const vault = vaultByName.get(name)
                      if (!vault) return null
                      return (
                        <div key={name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5">
                          <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--color-text)' }}>{name}</span>
                          <button
                            type="button"
                            onClick={() => void moveVault(name, activeGroup.id)}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                            title={s.addToGroup}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="h-9 shrink-0 px-3 border-t flex items-center justify-between text-[10px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            <span>{state?.vaults.length ?? 0} vaults</span>
            {saving && <Loader2 size={12} className="animate-spin" />}
          </div>
        </div>
      )}
    </aside>
  )
}
