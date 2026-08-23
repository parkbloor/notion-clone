// ==============================================
// src/lib/api.ts
// 역할: FastAPI 백엔드와 통신하는 함수 모음
// Python으로 치면: import requests; def get_pages(): return requests.get(url).json()
// ==============================================

import { Page, Category, PlanEvent, Routine } from '@/types/block'

// FastAPI 서버 주소 (Windows에서 localhost가 IPv6 ::1로 해석되는 문제로 127.0.0.1 사용)
// Python으로 치면: BASE_URL = 'http://127.0.0.1:8000'
export const BASE_URL = 'http://127.0.0.1:8000'

export interface ImageUploadResult {
  url: string
  name: string
  size: number
  mime: string
}

export interface PlannerRecoveryTotals {
  vaultCount: number
  sourceCount: number
  liveEventOccurrences: number
  archiveEventOccurrences: number
  uniqueEventCount: number
  duplicateOccurrences: number
  errorCount: number
}

export interface PlannerRecoveryVault {
  vaultName: string
  plannerMode: string
  scheduleHomeConfigured: boolean
  scheduleHomeFound: boolean
  scheduleHomePlannerBlocks: number
  plannerBlockCount: number
  dateCount: number
  eventCount: number
  archiveDateCount: number
  archiveEventCount: number
}

export interface PlannerRecoverySource {
  vaultName: string
  pageId: string
  pageTitle: string
  blockId: string
  sourceFile: string
  location: 'active' | 'trash'
  isScheduleHome: boolean
  schema: 'current' | 'legacy' | 'mixed' | 'empty' | 'invalid'
  dateCount: number
  eventCount: number
  duplicateEventCount: number
  firstDate: string | null
  lastDate: string | null
  issues: string[]
}

export interface PlannerRecoveryAudit {
  version: number
  generatedAt: string
  totals: PlannerRecoveryTotals
  vaults: PlannerRecoveryVault[]
  sources: PlannerRecoverySource[]
  errors: Array<{ vaultName: string; sourceFile: string; message: string }>
}

export interface PlannerRecoveryBackupResult {
  status: 'ok'
  backupFile: string
  fileCount: number
  sizeBytes: number
  sha256: string
  auditTotals: PlannerRecoveryTotals
}

// -----------------------------------------------
// Date 직렬화 헬퍼
// Page/Block의 Date 객체를 ISO 문자열로 변환 (JSON 전송용)
// Python으로 치면: def serialize(page): page['createdAt'] = page['createdAt'].isoformat()
// -----------------------------------------------
function serializePage(page: Page): object {
  return {
    ...page,
    // createdAt/updatedAt은 이미 ISO 문자열 — 그대로 전달
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    blocks: page.blocks.map(block => ({
      ...block,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    })),
  }
}

// -----------------------------------------------
// API 응답 → Page 타입으로 정규화 (createdAt/updatedAt은 ISO 문자열 그대로 사용)
// Python으로 치면: def parse_page(p): return p  (이미 문자열이므로 변환 불필요)
// -----------------------------------------------
function parsePage(p: Page): Page {
  return {
    ...p,
    blocks: p.blocks ?? [],
  }
}

// -----------------------------------------------
// API 응답 → Routine[] 타입으로 정규화
// 저장 파일이 손상됐을 때 잘못된 값이 플래너 상태에 들어가지 않게 방지
// Python으로 치면: def parse_routines(data): validate_each_routine(data)
// -----------------------------------------------
function parseRoutines(data: unknown): Routine[] {
  if (!Array.isArray(data)) throw new Error('루틴 응답 형식이 올바르지 않습니다.')

  return data.map((item, index) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.start !== 'string' ||
      typeof item.end !== 'string' ||
      typeof item.color !== 'string' ||
      !Array.isArray(item.days) ||
      !/^\d{2}:\d{2}$/.test(item.start) ||
      !/^\d{2}:\d{2}$/.test(item.end) ||
      !item.days.every((day: unknown) => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
    ) {
      throw new Error(`루틴 응답 ${index + 1}번의 형식이 올바르지 않습니다.`)
    }

    return item as Routine
  })
}

// -----------------------------------------------
// API 함수들
// Python으로 치면: class ApiClient: def get_pages(self): ...
// -----------------------------------------------
export const api = {

  // ── 모든 페이지 불러오기 (카테고리 정보 포함) ────
  // Python으로 치면: requests.get(f'{BASE_URL}/api/pages').json()
  getPages: async (): Promise<{
    pages: Page[]
    currentPageId: string | null
    categories: Category[]
    // pageId → categoryId 매핑 (null이면 미분류)
    categoryMap: Record<string, string | null>
    categoryOrder: string[]
    // 하위 폴더 순서: { parentCatId: [childCatId, ...] }
    categoryChildOrder: Record<string, string[]>
    // 현재 볼트 폴더명 (사이드바 표시용)
    vault_name?: string
  }> => {
    const res = await fetch(`${BASE_URL}/api/pages`)
    if (!res.ok) throw new Error('페이지 목록 불러오기 실패')
    const data = await res.json()
    // ISO 문자열 → Date 객체로 복원
    data.pages = data.pages.map(parsePage)
    return data
  },

  // 단일 페이지 최신본 조회 — 저장 충돌 복구에 사용
  getPage: async (pageId: string): Promise<Page> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}`)
    if (!res.ok) throw new Error('페이지 불러오기 실패')
    return parsePage(await res.json())
  },

  // ── 새 페이지 생성 ────────────────────────────
  // categoryId를 전달하면 해당 카테고리 폴더에 생성
  // Python으로 치면: requests.post(url, json={'title': title, 'icon': icon, 'categoryId': cat_id})
  createPage: async (title: string, icon: string, categoryId?: string | null): Promise<Page> => {
    const res = await fetch(`${BASE_URL}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, icon, categoryId: categoryId ?? null }),
    })
    if (!res.ok) throw new Error('페이지 생성 실패')
    const data = await res.json()
    return parsePage(data)
  },

  // ── 페이지 저장 (upsert) ──────────────────────
  // 제목 변경으로 폴더 rename된 경우 → 업데이트된 Page 반환 (이미지 URL 갱신용)
  // 모든 성공 저장은 서버의 최신 페이지(이미지 URL·revision 포함)를 반환
  // Python으로 치면: res = requests.put(url, json=page_data); return res.json()['page'] if renamed
  // categoryId: 신규 페이지(로컬 폴백으로 생성된 경우)를 카테고리 폴더에 배치
  // Python으로 치면: requests.put(url, json=page_data, params={'categoryId': cat_id})
  savePage: async (pageId: string, page: Page, categoryId?: string | null): Promise<Page | null> => {
    const params = new URLSearchParams()
    if (categoryId) params.set('categoryId', categoryId)
    if (page.revision !== undefined) params.set('expectedRevision', String(page.revision))
    const query = params.size ? `?${params.toString()}` : ''
    const url = `${BASE_URL}/api/pages/${pageId}${query}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializePage(page)),
    })
    // !res.ok 시 throw → scheduleSave의 catch 블록에서 toast 표시
    // 기존: return null (조용한 실패 — 사용자가 저장 오류를 알 수 없음)
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`저장 실패 (${res.status}): ${errText}`)
    }
    const data = await res.json()
    return data.page ? parsePage(data.page) : null
  },

  // ── 페이지 삭제 ──────────────────────────────
  deletePage: async (pageId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('페이지 삭제 실패')
  },

  // ── 현재 페이지 ID 저장 ──────────────────────
  // Python으로 치면: requests.patch(url, json={'pageId': page_id})
  setCurrentPage: async (pageId: string): Promise<void> => {
    await fetch(`${BASE_URL}/api/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId }),
    })
  },

  // ── 이미지 파일 업로드 ───────────────────────
  // Python으로 치면: requests.post(url, files={'file': file_obj})
  uploadImage: async (pageId: string, file: File): Promise<ImageUploadResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/images`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      // 서버 에러 메시지를 그대로 던져 호출부에서 구체적 안내 가능
      const body = await res.json().catch(() => ({}))
      throw Object.assign(new Error(body.detail || '이미지 업로드 실패'), { status: res.status })
    }
    const data = await res.json()
    return {
      url: data.url as string,
      name: (data.originalName as string | undefined) || file.name,
      size: Number(data.size ?? file.size),
      mime: (data.mime as string | undefined) || file.type || 'application/octet-stream',
    }
  },

  // ── 현재 메모가 참조하는 이미지 원본 다운로드 ──
  downloadImage: async (pageId: string, url: string): Promise<Blob> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/images/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || '이미지 원본 다운로드에 실패했습니다')
    }
    return await res.blob()
  },

  // ── 현재 메모의 로컬 원본 이미지 전체 ZIP 다운로드 ──
  downloadAllImages: async (pageId: string): Promise<Blob> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/images/download-all`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || '이미지 전체 다운로드에 실패했습니다')
    }
    return await res.blob()
  },

  // ── 본문·커버·히스토리에서 참조되지 않는 이미지 파일만 정리 ──
  cleanupImage: async (pageId: string, url: string): Promise<{ deleted: boolean }> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/images/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) throw new Error('이미지 파일 정리에 실패했습니다')
    return await res.json() as { deleted: boolean }
  },

  // ── 비디오 파일 업로드 ───────────────────────
  // Python으로 치면: requests.post(url, files={'file': video_file})
  uploadVideo: async (pageId: string, file: File): Promise<string> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/videos`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? '비디오 업로드 실패')
    }
    const data = await res.json()
    return data.url as string
  },

  // ── 일반 파일 업로드 (PDF / docx / zip 등) ───
  // Python으로 치면: requests.post(url, files={'file': file_obj})
  uploadFile: async (pageId: string, file: File): Promise<{ url: string; name: string; size: number; ext: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/files`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? '파일 업로드 실패')
    }
    const data = await res.json()
    // lastIndexOf로 마지막 점 위치 확인 — 확장자 없는 파일명(index <= 0)이면 빈 문자열
    const originalName = data.original_name as string
    const dotIdx = originalName.lastIndexOf('.')
    const ext = dotIdx > 0 ? originalName.slice(dotIdx).toLowerCase() : ''
    return {
      url: data.url as string,
      name: data.original_name as string,
      size: data.size as number,
      ext,
    }
  },

  // ── 카테고리 생성 (parentId 있으면 하위 폴더) ──
  // Python으로 치면: requests.post(url, json={'name': name, 'parentId': parent_id})
  createCategory: async (name: string, parentId?: string | null): Promise<Category> => {
    const res = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    })
    if (!res.ok) throw new Error('카테고리 생성 실패')
    return await res.json()
  },

  // ── 카테고리 이름 변경 ────────────────────────
  // Python으로 치면: requests.put(url, json={'name': name})
  renameCategory: async (categoryId: string, name: string): Promise<{ ok: boolean; renamed: boolean; category: Category }> => {
    const res = await fetch(`${BASE_URL}/api/categories/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('카테고리 이름 변경 실패')
    return await res.json()
  },

  // ── 카테고리 삭제 ─────────────────────────────
  // 안에 메모가 있으면 hasPages: true 반환 (삭제 안 됨)
  // 하위 폴더가 있으면 hasChildren: true 반환 (삭제 안 됨)
  // Python으로 치면: requests.delete(url)
  deleteCategory: async (categoryId: string): Promise<{ ok: boolean; hasPages?: boolean; hasChildren?: boolean; count?: number }> => {
    const res = await fetch(`${BASE_URL}/api/categories/${categoryId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('카테고리 삭제 실패')
    return await res.json()
  },

  // ── 페이지 카테고리 이동 ──────────────────────
  // categoryId: null이면 미분류로 이동
  // Python으로 치면: requests.patch(url, json={'categoryId': cat_id})
  movePageToCategory: async (pageId: string, categoryId: string | null): Promise<{ ok: boolean; moved: boolean; page?: Page }> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    })
    if (!res.ok) throw new Error('카테고리 이동 실패')
    const data = await res.json()
    // 이미지 URL이 바뀐 경우 업데이트된 page 반환
    if (data.page) {
      data.page = parsePage(data.page)
    }
    return data
  },

  // ── 최상위 카테고리 순서 변경 ────────────────
  // Python으로 치면: requests.patch(url, json={'order': order})
  reorderCategories: async (order: string[]): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/categories/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) throw new Error('카테고리 순서 변경 실패')
  },

  // ── 하위 카테고리 순서 변경 ───────────────────
  // Python으로 치면: requests.patch(url, json={'order': order})
  reorderChildCategories: async (parentId: string, order: string[]): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/categories/${parentId}/reorder-children`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) throw new Error('하위 카테고리 순서 변경 실패')
  },

  // ── 폴더를 다른 부모로 이동 ───────────────────
  // parentId=null이면 최상위로 이동, str이면 해당 폴더의 자식으로
  // Python으로 치면: requests.patch(url, json={'parentId': parent_id})
  moveCategoryToParent: async (categoryId: string, parentId: string | null): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/categories/${categoryId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId }),
    })
    if (!res.ok) throw new Error('폴더 이동 실패')
  },

  // ── 폴더 색상 변경 ───────────────────────────
  // color=null이면 기본 색상으로 초기화
  // Python으로 치면: requests.patch(url, json={'color': color})
  updateCategoryColor: async (categoryId: string, color: string | null): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/categories/${categoryId}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (!res.ok) throw new Error('폴더 색상 변경 실패')
  },

  // ── 페이지 순서 변경 ──────────────────────────
  // Python으로 치면: requests.patch(url, json={'order': order})
  reorderPages: async (order: string[]): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/pages/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) throw new Error('페이지 순서 변경 실패')
  },

  // ── 전체 텍스트 검색 ──────────────────────────
  // 페이지 제목 + 블록 내용을 서버에서 검색
  // Python으로 치면: requests.get(url, params={'q': query}).json()
  searchPages: async (q: string): Promise<SearchResult[]> => {
    const res = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.results as SearchResult[]
  },

  // ── 휴지통 API ────────────────────────────────
  // Python으로 치면: requests.get('/api/trash').json()
  getTrash: async (): Promise<{ items: import('@/types/block').TrashItem[] }> => {
    const res = await fetch(`${BASE_URL}/api/trash`)
    if (!res.ok) return { items: [] }
    return res.json()
  },

  restoreTrashItem: async (itemId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/trash/${itemId}/restore`, { method: 'PATCH' })
    if (!res.ok) throw new Error('항목 복원 실패')
  },

  permanentDeleteTrashItem: async (itemId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/trash/${itemId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('영구 삭제 실패')
  },

  emptyTrash: async (): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/trash`, { method: 'DELETE' })
    if (!res.ok) throw new Error('휴지통 비우기 실패')
  },
}

// ── 템플릿 타입 ─────────────────────────────────
// Python으로 치면: @dataclass class Template: id: str; name: str; ...
export interface Template {
  id: string
  name: string
  icon: string
  description: string
  content: string  // 마크다운 형식 텍스트
}

// ── 템플릿 CRUD API ──────────────────────────────
// Python으로 치면: class TemplateApiClient: ...
export const templateApi = {

  // 모든 템플릿 목록
  // Python으로 치면: requests.get(f'{BASE_URL}/api/templates').json()['templates']
  getAll: async (): Promise<Template[]> => {
    const res = await fetch(`${BASE_URL}/api/templates`)
    if (!res.ok) return []
    const data = await res.json()
    return data.templates as Template[]
  },

  // 현재 볼트의 새 메모 기본 템플릿
  getDefault: async (): Promise<string | null> => {
    const res = await fetch(`${BASE_URL}/api/templates/default`)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.templateId === 'string' ? data.templateId : null
  },

  setDefault: async (templateId: string | null): Promise<string | null> => {
    const res = await fetch(`${BASE_URL}/api/templates/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    })
    if (!res.ok) throw new Error('기본 템플릿 저장 실패')
    const data = await res.json()
    return typeof data.templateId === 'string' ? data.templateId : null
  },

  // 새 템플릿 생성
  // Python으로 치면: requests.post(url, json=body).json()
  create: async (body: Omit<Template, 'id'>): Promise<Template> => {
    const res = await fetch(`${BASE_URL}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('템플릿 생성 실패')
    return await res.json()
  },

  // 템플릿 수정
  // Python으로 치면: requests.put(url, json=body).json()
  update: async (id: string, body: Omit<Template, 'id'>): Promise<Template> => {
    const res = await fetch(`${BASE_URL}/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('템플릿 수정 실패')
    return await res.json()
  },

  // 템플릿 삭제
  // Python으로 치면: requests.delete(url)
  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/templates/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('템플릿 삭제 실패')
  },
}

// ── 볼트별 기능 표시 설정 ────────────────────────
export type CaptureDestinationKind = 'task' | 'note'

// 포스트잇 분류함의 한 목적지다. 페이지 제목 대신 ID를 저장하므로 이름 변경에도 연결을 유지한다.
export interface CaptureDestination {
  id: string
  pageId: string
  kind: CaptureDestinationKind
}

export interface VaultPlannerFeatures {
  mode: 'off' | 'daily'
  homePageId: string | null
  dailyNoteTemplate: 'standard' | 'postit' | 'diary'
  dailyCustomTemplateId: string | null
  todayShortcut: boolean
  planMenu: boolean
  reviews: boolean
  calendar: boolean
  timeline: boolean
  routines: boolean
  slashPlannerBlocks: boolean
  // 현재 볼트에서만 쓰는 포스트잇 분류함 목적지 목록이다.
  captureDestinations: CaptureDestination[]
}

export interface VaultPreferences {
  planner: VaultPlannerFeatures
}

export interface CaptureTransferResult {
  sourcePage: Page
  destinationPage: Page
  alreadyTransferred: boolean
}

export interface CrossVaultDestination {
  id: string
  pageId: string
  kind: CaptureDestinationKind
  pageTitle: string
  pageIcon: string
  revision: number
}

export interface CrossVaultDestinationGroup {
  name: string
  destinations: CrossVaultDestination[]
}

export const captureTransferApi = {
  transfer: async (request: {
    sourcePageId: string
    sourceBlockId: string
    sourceEntryId: string
    destinationPageId: string
    sourceRevision: number
    destinationRevision: number
    kind: CaptureDestinationKind
  }): Promise<CaptureTransferResult> => {
    const res = await fetch(`${BASE_URL}/api/capture-transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || '포스트잇 분류에 실패했습니다.')
    }
    const data = await res.json()
    return {
      sourcePage: parsePage(data.sourcePage as Page),
      destinationPage: parsePage(data.destinationPage as Page),
      alreadyTransferred: Boolean(data.alreadyTransferred),
    }
  },

  getCrossVaultDestinations: async (): Promise<CrossVaultDestinationGroup[]> => {
    const res = await fetch(`${BASE_URL}/api/capture-transfers/destinations`)
    if (!res.ok) throw new Error('다른 볼트의 분류함을 불러오지 못했습니다.')
    const data = await res.json()
    return Array.isArray(data.vaults) ? data.vaults as CrossVaultDestinationGroup[] : []
  },

  transferAcrossVault: async (request: {
    sourcePageId: string
    sourceBlockId: string
    sourceEntryId: string
    destinationVaultName: string
    destinationPageId: string
    sourceRevision: number
    destinationRevision: number
    kind: CaptureDestinationKind
  }): Promise<CaptureTransferResult> => {
    const res = await fetch(`${BASE_URL}/api/capture-transfers/cross-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || '다른 볼트로 복사하지 못했습니다.')
    }
    const data = await res.json()
    return {
      sourcePage: parsePage(data.sourcePage as Page),
      destinationPage: parsePage(data.destinationPage as Page),
      alreadyTransferred: Boolean(data.alreadyTransferred),
    }
  },
}

export const vaultPreferencesApi = {
  get: async (): Promise<VaultPreferences> => {
    const res = await fetch(`${BASE_URL}/api/vault-preferences`)
    if (!res.ok) throw new Error('볼트 기능 설정 불러오기 실패')
    return res.json()
  },

  updatePlanner: async (planner: Partial<VaultPlannerFeatures>): Promise<VaultPreferences> => {
    const res = await fetch(`${BASE_URL}/api/vault-preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner }),
    })
    if (!res.ok) throw new Error('볼트 기능 설정 저장 실패')
    return res.json()
  },
}

// ── 검색 결과 한 건의 타입 ───────────────────────
// Python으로 치면: @dataclass class SearchResult: ...
export interface SearchResult {
  pageId: string
  pageTitle: string
  pageIcon: string
  blockId: string | null
  blockType: string | null
  snippet: string
  matchType: 'title' | 'content'
}

// ── 버전 히스토리 타입 ─────────────────────────────
// Python으로 치면: @dataclass class HistoryVersion: ...
export interface HistoryVersion {
  filename: string      // 스냅샷 파일명 (예: "2026-03-17T11-17-22.nct")
  snapshotAt: string    // ISO 8601 타임스탬프
  title: string         // 해당 버전의 페이지 제목
  blockCount: number    // 해당 버전의 블록 수
}

// ── 히스토리 API ────────────────────────────────────
// Python으로 치면: class HistoryApi: ...
export const historyApi = {

  // 버전 목록 조회 (최신순)
  // Python으로 치면: requests.get(f'/api/pages/{id}/history').json()['versions']
  list: async (pageId: string): Promise<HistoryVersion[]> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/history`)
    if (!res.ok) throw new Error('히스토리 목록 조회 실패')
    const data = await res.json()
    return data.versions as HistoryVersion[]
  },

  // 특정 버전 전체 데이터 조회 (미리보기용)
  // Python으로 치면: requests.get(f'/api/pages/{id}/history/{filename}').json()
  get: async (pageId: string, filename: string): Promise<Page> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/history/${encodeURIComponent(filename)}`)
    if (!res.ok) throw new Error('버전 데이터 조회 실패')
    // parsePage 호출로 blocks ?? [] 정규화 (누락 시 blocks.map() TypeError 발생)
    return parsePage(await res.json())
  },

  // 선택한 버전으로 복원
  // Python으로 치면: requests.post(f'/api/pages/{id}/history/restore/{filename}')
  restore: async (pageId: string, filename: string): Promise<void> => {
    const res = await fetch(
      `${BASE_URL}/api/pages/${pageId}/history/restore/${encodeURIComponent(filename)}`,
      { method: 'POST' },
    )
    if (!res.ok) throw new Error('버전 복원 실패')
  },
}

// ── 플래너 루틴 API ──────────────────────────────
// 루틴을 localStorage 대신 vault 파일(_planner_routines.json)에 영속 저장
// Python으로 치면: import requests; def get_routines(): return requests.get(...).json()
export const plannerApi = {

  // 루틴 목록 로드 (앱 시작 시 settingsStore에서 호출)
  // Python으로 치면: requests.get('/api/planner/routines').json()
  getRoutines: async (): Promise<Routine[]> => {
    const res = await fetch(`${BASE_URL}/api/planner/routines`)
    if (!res.ok) throw new Error('루틴 로드 실패')
    return parseRoutines(await res.json())
  },

  // 루틴 목록 전체 저장 (setPlannerRoutines 호출 시 자동 실행)
  // Python으로 치면: requests.put('/api/planner/routines', json=routines)
  saveRoutines: async (routines: Routine[]): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/planner/routines`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(routines),
    })
    if (!res.ok) throw new Error('루틴 저장 실패')
  },

  // 90일 초과 플래너 기록 로드
  getArchive: async (): Promise<Record<string, PlanEvent[]>> => {
    const res = await fetch(`${BASE_URL}/api/planner/archive`)
    if (!res.ok) throw new Error('아카이브 로드 실패')
    return res.json()
  },

  // 90일 초과 플래너 기록 병합 저장
  appendArchive: async (archive: Record<string, PlanEvent[]>): Promise<void> => {
    const res = await fetch(`${BASE_URL}/api/planner/archive`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(archive),
    })
    if (!res.ok) throw new Error('아카이브 저장 실패')
  },

  // 모든 볼트의 Day Planner 원본을 변경 없이 집계한다.
  getRecoveryAudit: async (): Promise<PlannerRecoveryAudit> => {
    const res = await fetch(`${BASE_URL}/api/planner/recovery/audit`)
    if (!res.ok) throw new Error('일정 복구 진단 실패')
    return res.json()
  },

  // 사용자가 명시적으로 요청할 때만 원본 보존 ZIP을 만든다.
  createRecoveryBackup: async (): Promise<PlannerRecoveryBackupResult> => {
    const res = await fetch(`${BASE_URL}/api/planner/recovery/backup`, { method: 'POST' })
    if (!res.ok) throw new Error('일정 복구 백업 실패')
    return res.json()
  },
}
