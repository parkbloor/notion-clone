// =============================================
// src/lib/graphData.ts
// 역할: 페이지 블록 content에서 [[링크]] / @멘션 패턴을 추출하여
//       그래프 노드(페이지)와 엣지(링크 관계) 데이터를 생성하는 유틸
// Python으로 치면: def build_graph(pages, category_map): return nodes, edges
// =============================================

import { Page } from '@/types/block'

// -----------------------------------------------
// 그래프 노드 — 페이지 하나에 대응
// degree: 연결된 엣지 수 (많을수록 원 크기 증가)
// Python으로 치면: @dataclass class GraphNode: id, title, icon, category_id, degree
// -----------------------------------------------
export interface GraphNode {
  id: string
  title: string
  icon: string
  categoryId: string | null
  degree: number
}

// -----------------------------------------------
// 그래프 엣지 — 두 페이지 간의 링크 관계
// 양방향으로 중복 저장 안 함 (undirected)
// Python으로 치면: @dataclass class GraphEdge: source_id, target_id
// -----------------------------------------------
export interface GraphEdge {
  sourceId: string
  targetId: string
}

// -----------------------------------------------
// 그래프 전체 데이터
// Python으로 치면: @dataclass class GraphData: nodes, edges
// -----------------------------------------------
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// -----------------------------------------------
// HTML content에서 #page-{uuid} 패턴 추출
// BacklinkPanel.tsx와 동일한 패턴 사용
// Python으로 치면: re.findall(r'#page-([a-f0-9-]+)', content)
// -----------------------------------------------
function extractLinkedPageIds(content: string): string[] {
  const re = /#page-([a-f0-9-]{36})/g
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    results.push(m[1])
  }
  return results
}

// -----------------------------------------------
// 블록 트리를 재귀로 평탄화하여 모든 content를 하나의 문자열로 합침
// Python으로 치면: def flatten(blocks): return ' '.join(b.content + flatten(b.children) for b in blocks)
// -----------------------------------------------
function flattenBlockContent(blocks: Page['blocks']): string {
  return blocks.flatMap(b => [
    // content가 undefined/null이면 빈 문자열로 대체 — "undefined" 문자열이 UUID 검색에 끼어드는 것 방지
    b.content ?? '',
    b.children?.length ? flattenBlockContent(b.children) : '',
  ]).join(' ')
}

// -----------------------------------------------
// 전체 페이지 목록 + categoryMap → 그래프 데이터 생성
// Python으로 치면:
//   def build_graph(pages, category_map):
//       edges = []
//       for p in pages:
//           for target_id in extract_links(flatten(p.blocks)):
//               if target_id in page_ids and target_id != p.id:
//                   edges.append(Edge(p.id, target_id))  # 중복 제거
//       return GraphData(nodes=[Node(p) for p in pages], edges=edges)
// -----------------------------------------------
export function buildGraphData(
  pages: Page[],
  categoryMap: Record<string, string | null>
): GraphData {
  const pageSet = new Set(pages.map(p => p.id))
  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []

  for (const page of pages) {
    const content = flattenBlockContent(page.blocks)
    const linkedIds = extractLinkedPageIds(content)

    for (const targetId of linkedIds) {
      if (!pageSet.has(targetId) || targetId === page.id) continue
      // 양방향 중복 방지: 항상 사전순 정렬된 키로 체크
      const key = [page.id, targetId].sort().join('|')
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ sourceId: page.id, targetId })
      }
    }
  }

  // 노드별 연결 수(degree) 계산
  const degreeMap: Record<string, number> = {}
  for (const e of edges) {
    degreeMap[e.sourceId] = (degreeMap[e.sourceId] ?? 0) + 1
    degreeMap[e.targetId] = (degreeMap[e.targetId] ?? 0) + 1
  }

  const nodes: GraphNode[] = pages.map(p => ({
    id: p.id,
    title: p.title,
    icon: p.icon,
    categoryId: categoryMap[p.id] ?? null,
    degree: degreeMap[p.id] ?? 0,
  }))

  return { nodes, edges }
}
