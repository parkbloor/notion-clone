// ==============================================
// src/lib/api.ts
// 역할: FastAPI 백엔드와 통신하는 함수 모음
// Python으로 치면: import requests; def get_pages(): return requests.get(url).json()
// ==============================================

import { Page, Category } from '@/types/block'

// FastAPI 서버 주소
// Python으로 치면: BASE_URL = 'http://localhost:8000'
const BASE_URL = 'http://localhost:8000'

// -----------------------------------------------
// Date 직렬화 헬퍼
// Page/Block의 Date 객체를 ISO 문자열로 변환 (JSON 전송용)
// Python으로 치면: def serialize(page): page['createdAt'] = page['createdAt'].isoformat()
// -----------------------------------------------
function serializePage(page: Page): object {
  return {
    ...page,
    // Date 객체 → ISO 8601 문자열
    createdAt: page.createdAt instanceof Date
      ? page.createdAt.toISOString()
      : page.createdAt,
    updatedAt: page.updatedAt instanceof Date
      ? page.updatedAt.toISOString()
      : page.updatedAt,
    blocks: page.blocks.map(block => ({
      ...block,
      createdAt: block.createdAt instanceof Date
        ? block.createdAt.toISOString()
        : block.createdAt,
      updatedAt: block.updatedAt instanceof Date
        ? block.updatedAt.toISOString()
        : block.updatedAt,
    })),
  }
}

// -----------------------------------------------
// ISO 문자열 → Date 객체로 변환하는 헬퍼
// Python으로 치면: def parse_page(p): p['createdAt'] = datetime.fromisoformat(p['createdAt'])
// -----------------------------------------------
function parsePage(p: Page & { createdAt: string; updatedAt: string }): Page {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    blocks: ((p.blocks ?? []) as unknown as Array<{ createdAt: string; updatedAt: string }>).map(b => ({
      ...b,
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
    })),
  } as Page
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
  }> => {
    const res = await fetch(`${BASE_URL}/api/pages`)
    if (!res.ok) throw new Error('페이지 목록 불러오기 실패')
    const data = await res.json()
    // ISO 문자열 → Date 객체로 복원
    data.pages = data.pages.map(parsePage)
    return data
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
  // rename 없으면 → null 반환
  // Python으로 치면: res = requests.put(url, json=page_data); return res.json()['page'] if renamed
  savePage: async (pageId: string, page: Page): Promise<Page | null> => {
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializePage(page)),
    })
    if (!res.ok) return null
    const data = await res.json()
    // rename이 발생한 경우에만 업데이트된 page 반환
    if (!data.renamed || !data.page) return null
    return parsePage(data.page)
  },

  // ── 페이지 삭제 ──────────────────────────────
  deletePage: async (pageId: string): Promise<void> => {
    await fetch(`${BASE_URL}/api/pages/${pageId}`, { method: 'DELETE' })
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
  uploadImage: async (pageId: string, file: File): Promise<string> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/api/pages/${pageId}/images`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error('이미지 업로드 실패')
    const data = await res.json()
    return data.url as string
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

  // ── 카테고리 생성 ─────────────────────────────
  // Python으로 치면: requests.post(url, json={'name': name})
  createCategory: async (name: string): Promise<Category> => {
    const res = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
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
  // Python으로 치면: requests.delete(url)
  deleteCategory: async (categoryId: string): Promise<{ ok: boolean; hasPages: boolean; count?: number }> => {
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

  // ── 카테고리 순서 변경 ────────────────────────
  // Python으로 치면: requests.patch(url, json={'order': order})
  reorderCategories: async (order: string[]): Promise<void> => {
    await fetch(`${BASE_URL}/api/categories/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
  },

  // ── 페이지 순서 변경 ──────────────────────────
  // Python으로 치면: requests.patch(url, json={'order': order})
  reorderPages: async (order: string[]): Promise<void> => {
    await fetch(`${BASE_URL}/api/pages/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
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
    await fetch(`${BASE_URL}/api/templates/${id}`, { method: 'DELETE' })
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
