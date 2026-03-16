// =============================================
// src/components/editor/ArrowLayer.tsx
// 역할: 페이지 전역 SVG 오버레이
//       1. [data-arrow-id] DOM 속성을 스캔 → arrowId별 1:N 쌍 구성 → 베지에 곡선 렌더링
//       2. 연결 대기 모드(connectingState) → 마우스 따라 고무줄 선 + 시작 원 렌더링
//       3. 텍스트 클릭 → caretRangeFromPoint로 클릭 위치 탐색 → 단어에 end 마크 적용
//
// 타입별 렌더링:
//   margin   : 텍스트 왼쪽 여백을 통과하는 S자 삼차 베지에 (xPosition으로 위치 조절)
//   diagonal : 시작→끝 직접 연결하는 이차 베지에 (약한 곡률)
//
// 화살촉:
//   endHead=true  : 끝점에 채워진 삼각형
//   startHead=true: 시작점에도 채워진 삼각형 (양방향)
//
// 분기 (1:N): 같은 arrowId를 가진 start 1개 + end 여러 개 → 각 end마다 path 1개
//
// Python으로 치면: class ArrowLayer(Component): def refresh(): scan_dom(); draw_svg()
// =============================================

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ARROW_COLORS } from '@/extensions/ArrowMark'
import { Block } from '@/types/block'
import { useArrowStore } from '@/store/arrowStore'

// -----------------------------------------------
// 화살표 한 줄의 렌더링 데이터
// (1:N 분기 시 같은 arrowId에서 여러 ArrowSegment 생성)
// Python으로 치면: @dataclass class ArrowSegment: ...
// -----------------------------------------------
interface ArrowSegment {
  // 고유 키 (arrowId + end 인덱스)
  key: string
  sx: number; sy: number    // 시작 앵커 (텍스트 left, 수직 중앙)
  ex: number; ey: number    // 끝 앵커
  color: string             // CSS 색상 (HEX 또는 이름)
  opacity: number           // 0~1
  arrowType: 'margin' | 'diagonal'
  xPosition: number         // 0~30 (margin 타입에서 여백 위치)
  startHead: boolean        // 시작점 화살촉 여부
  endHead: boolean          // 끝점 화살촉 여부
}

// -----------------------------------------------
// DOM에서 읽은 화살표 마커 데이터
// Python으로 치면: @dataclass class MarkerInfo: ...
// -----------------------------------------------
interface MarkerInfo {
  anchor: { x: number; y: number }
  color: string
  opacity: number
  arrowType: 'margin' | 'diagonal'
  xPosition: number
  startHead: boolean
  endHead: boolean
}

// -----------------------------------------------
// 화살촉 삼각형 꼭짓점 계산
//
// tailX/tailY: 화살표 꼬리 (반대쪽 점), tipX/tipY: 화살촉 끝 (붙을 점)
// 접선 방향으로 삼각형 꼭짓점 3개를 반환
// Python으로 치면: def calc_arrowhead(tail, tip) -> str: ...
// -----------------------------------------------
function calcArrowhead(
  tailX: number, tailY: number,
  tipX: number,  tipY: number,
): string {
  const dx = tipX - tailX
  const dy = tipY - tailY
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len
  const uy = dy / len
  const headLen = 9
  const headWidth = 4
  const x1 = tipX - headLen * ux + headWidth * (-uy)
  const y1 = tipY - headLen * uy + headWidth * ux
  const x2 = tipX - headLen * ux - headWidth * (-uy)
  const y2 = tipY - headLen * uy - headWidth * ux
  return `${tipX},${tipY} ${x1},${y1} ${x2},${y2}`
}

// -----------------------------------------------
// margin 타입: 삼차 베지에(cubic bezier) S자 경로 계산
//
// 경로:
//   시작 → 왼쪽 여백으로 빠져나감 → 수직 이동 → 끝점으로 들어옴
//
// xPosition(0~30): 여백 깊이 조절
//   0 = 텍스트에서 가장 멀리 (arc 깊이 최대)
//   30 = 텍스트 가까이 (arc 깊이 최소)
//
// Python으로 치면: def margin_path(sx, sy, ex, ey, x_pos) -> str: ...
// -----------------------------------------------
// -----------------------------------------------
// margin 타입: 옵시디언 arrows 플러그인 방식 그리드 경로
//
// 경로: 줄 왼쪽 끝 → 수평으로 여백 이동 → 수직 이동 → 수평으로 끝 줄 복귀
// 모서리: SVG A 아크(둥근 코너)로 처리 — 베지에 곡선 대신 직각+라운드
//
// 옵시디언 구현 참조 (artisticat1/arrows):
//   - 앵커 x = .cm-line(라인 컨테이너) 왼쪽 끝 - MARGIN_ARROW_X_OFFSET
//   - LeaderLine "grid" path + startSocket/endSocket: "left"
//   - makeArrowArc()로 90도 코너를 A 아크로 교체
//
// xPosition=0  → 라인 왼쪽에서 20px (가장 가까운 여백)
// xPosition=30 → 라인 왼쪽에서 170px (깊은 여백)
//
// Python으로 치면: def margin_path(sx, sy, ex, ey, x_pos) -> str: ...
// -----------------------------------------------
function marginPath(
  sx: number, sy: number,
  ex: number, ey: number,
  xPosition: number,
): { d: string; cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
  // 여백 수직선 x 위치 — anchorX(텍스트 왼쪽 경계)에서 더 왼쪽으로 이동
  //
  // anchorX = ProseMirror.left - 10 (텍스트 영역 밖)
  // marginX = anchorX에서 추가로 왼쪽으로: xPosition=0이면 15px, 30이면 90px
  //
  // xPosition=0  → 15px 추가 오프셋 (블록 wrapper 안쪽)
  // xPosition=30 → 90px 추가 오프셋 (페이지 왼쪽 여백 깊이)
  //
  // Python으로 치면: margin_x = min(sx, ex) - (15 + x_pos * 2.5)
  const marginOffset = 15 + xPosition * 2.5
  const marginX = Math.min(sx, ex) - marginOffset

  // 모서리 반지름: 수직 거리가 작으면 반지름도 줄여 아크가 겹치지 않게 함
  // Python으로 치면: r = min(12, abs(ey - sy) / 2)
  const r = Math.min(12, Math.abs(ey - sy) / 2)

  // cp1, cp2: 화살촉 방향 계산용 (화살표가 수평으로 들어오는 방향)
  const cp1x = marginX; const cp1y = sy
  const cp2x = marginX; const cp2y = ey

  // sy ≈ ey (같은 줄): 반지름이 거의 0 → 직선으로 처리
  if (r < 1) {
    return {
      d: `M ${sx},${sy} L ${marginX},${sy} L ${ex},${ey}`,
      cp1x, cp1y, cp2x, cp2y,
    }
  }

  // 그리드 경로 + SVG A 아크 모서리
  // 방향: 시작점 아래(goingDown) vs 위(goingUp)
  // 코너 sweepFlag 테이블 (옵시디언 makeArrowArc 참조):
  //   l→d: 0  d→r: 0  (아래로 내려갈 때)
  //   l→u: 1  u→r: 1  (위로 올라갈 때)
  // Python으로 치면: sweep = 0 if going_down else 1
  const goingDown = ey >= sy
  const sweep = goingDown ? 0 : 1
  const rSign = goingDown ? 1 : -1  // 수직 방향 부호

  const d = [
    `M ${sx},${sy}`,
    `L ${marginX + r},${sy}`,                                       // 수평 이동 (왼쪽)
    `A ${r} ${r} 0 0 ${sweep} ${marginX},${sy + rSign * r}`,        // 코너1: 수평→수직
    `L ${marginX},${ey - rSign * r}`,                               // 수직 이동
    `A ${r} ${r} 0 0 ${sweep} ${marginX + r},${ey}`,                // 코너2: 수직→수평
    `L ${ex},${ey}`,                                                 // 수평 이동 (오른쪽)
  ].join(' ')

  return { d, cp1x, cp1y, cp2x, cp2y }
}

// -----------------------------------------------
// diagonal 타입: 이차 베지에 — 시작→끝 대각 직선 (약한 곡률)
//
// 제어점: 두 점의 중간에서 살짝 오른쪽으로 오프셋 → 자연스러운 곡선
// Python으로 치면: def diagonal_path(sx, sy, ex, ey) -> str: ...
// -----------------------------------------------
function diagonalPath(
  sx: number, sy: number,
  ex: number, ey: number,
): { d: string; cpx: number; cpy: number } {
  // 두 점 수직 차이가 작으면 곡률도 작게 유지
  const cpx = (sx + ex) / 2 + (ey - sy) * 0.1
  const cpy = (sy + ey) / 2 - Math.abs(ex - sx) * 0.05
  return { d: `M ${sx},${sy} Q ${cpx},${cpy} ${ex},${ey}`, cpx, cpy }
}

interface ArrowLayerProps {
  dep: Block[]
}

export default function ArrowLayer({ dep }: ArrowLayerProps) {
  const [segments, setSegments] = useState<ArrowSegment[]>([])
  // 현재 호버된 화살표 key
  // Python으로 치면: self.hovered_key: str | None = None
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  // 마우스 좌표 (연결 대기 모드에서 고무줄 선 끝점)
  // Python으로 치면: self.mouse_pos: tuple[float, float] = (0, 0)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  // 1:N 분기 순환 인덱스: arrowId → 마지막으로 이동한 end 인덱스
  // Python으로 치면: self.cycle_index: dict[str, int] = {}
  const cycleIndexRef = useRef<Map<string, number>>(new Map())

  // 연결 대기 상태 구독
  const connectingState = useArrowStore(s => s.connectingState)

  // -----------------------------------------------
  // DOM 스캔 → ArrowSegment 목록 생성
  //
  // 1. [data-arrow-id] 요소 전체 수집
  // 2. arrowId별로 start 1개 + end[] 구성 (1:N 분기 지원)
  // 3. start × end 쌍마다 ArrowSegment 생성
  //
  // Python으로 치면:
  //   def scan():
  //       groups = group_by(elements, key=lambda e: e.data_arrow_id)
  //       for id, group in groups.items():
  //           start = next(e for e in group if e.is_start)
  //           ends = [e for e in group if not e.is_start]
  //           for end in ends: segments.append(ArrowSegment(start, end))
  // -----------------------------------------------
  const scan = () => {
    const elements = document.querySelectorAll<HTMLElement>('[data-arrow-id]')

    // arrowId → { start, ends[], 공유 속성 } 맵
    const groups = new Map<string, {
      start?: MarkerInfo
      ends: MarkerInfo[]
    }>()

    elements.forEach((el) => {
      const id = el.getAttribute('data-arrow-id')
      if (!id) return
      const isStart = el.getAttribute('data-arrow-start') === 'true'
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return

      // 앵커 x: 화살표 타입에 따라 다른 기준 사용
      //
      // margin 타입: .ProseMirror 왼쪽 경계 - 10px (drag handle 영역)
      //   → 줄 왼쪽에서 출발해 텍스트와 겹치지 않음
      //
      // diagonal 타입: 스팬 중앙 x (선택된 텍스트 중앙)
      //   → 텍스트를 직접 가로질러 연결하는 방식이므로 텍스트 위치 기준
      //
      // Python으로 치면:
      //   if arrow_type == 'margin': anchor_x = prosemirror.left - 10
      //   else: anchor_x = rect.left + rect.width / 2
      const arrowTypeAttr = el.getAttribute('data-arrow-type') ?? 'margin'
      const proseMirrorEl = el.closest('.ProseMirror') as HTMLElement | null
      const proseMirrorRect = proseMirrorEl?.getBoundingClientRect()
      // diagonal: rect.left = 스팬 시작점 = ●(::before) 위치에 근접
      // margin:   ProseMirror.left - 10 = 줄 왼쪽 경계 밖
      const anchorX = arrowTypeAttr === 'diagonal'
        ? rect.left
        : (proseMirrorRect ? proseMirrorRect.left - 10 : rect.left)
      const anchor = {
        x: anchorX,
        y: rect.top + rect.height / 2,
      }

      // 속성 파싱 — start 마크에 모든 설정이 들어있음
      // Python으로 치면: info = MarkerInfo.from_element(el)
      const info: MarkerInfo = {
        anchor,
        color: el.getAttribute('data-arrow-color') ?? 'blue',
        opacity: parseFloat(el.getAttribute('data-arrow-opacity') ?? '1'),
        arrowType: (el.getAttribute('data-arrow-type') ?? 'margin') as 'margin' | 'diagonal',
        xPosition: parseInt(el.getAttribute('data-arrow-x') ?? '0', 10),
        startHead: el.getAttribute('data-arrow-start-head') === 'true',
        endHead: el.getAttribute('data-arrow-end-head') !== 'false',
      }

      const group = groups.get(id) ?? { ends: [] }
      if (isStart) {
        // start는 항상 덮어쓰기 (같은 arrowId의 start span이 여러 개여도 마지막 1개만 사용)
        group.start = info
      } else {
        // end 중복 제거: 같은 선택에서 생긴 인접 span은 1개로 합산
        //
        // 멀티 단어 선택(예: "hello world") 시 ProseMirror가 각 단어를 별도 span으로
        // 렌더링할 수 있어 중복 end가 발생함. 이를 1개로 줄여야 함.
        //
        // 구분 기준:
        //   - 같은 선택 span: y 차이 < 10px AND x 차이 < 40px (인접한 단어들)
        //   - 의도적 1:N 끝점: y가 같아도 x 거리가 40px 이상 (다른 위치의 단어)
        //
        // Python으로 치면:
        //   def is_adjacent(a, b): return abs(a.y-b.y)<10 and abs(a.x-b.x)<40
        //   if not any(is_adjacent(e, info) for e in ends): ends.append(info)
        const isDuplicateSpan = group.ends.some(
          e => Math.abs(e.anchor.y - anchor.y) < 10 && Math.abs(e.anchor.x - anchor.x) < 40
        )
        if (!isDuplicateSpan) {
          group.ends.push(info)
        }
      }
      groups.set(id, group)
    })

    // 쌍 생성: start × 각 end → 1개 ArrowSegment
    // Python으로 치면: segments = [Segment(start, end, i) for end, i in enumerate(ends)]
    const result: ArrowSegment[] = []
    groups.forEach(({ start, ends }, id) => {
      if (!start || ends.length === 0) return
      ends.forEach((end, i) => {
        result.push({
          key: `${id}-${i}`,
          sx: start.anchor.x, sy: start.anchor.y,
          ex: end.anchor.x,   ey: end.anchor.y,
          color: start.color,
          opacity: start.opacity,
          arrowType: start.arrowType,
          xPosition: start.xPosition,
          startHead: start.startHead,
          // end 마크의 endHead 속성 우선 (no-arrow 옵션 지원)
          endHead: end.endHead,
        })
      })
    })

    setSegments(result)
  }

  // rAF 기반 스캔 최적화
  const scheduleScan = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      scan()
      rafRef.current = null
    })
  }

  useEffect(() => { scheduleScan() }, [dep])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('scroll', scheduleScan, true)
    window.addEventListener('resize', scheduleScan)
    return () => {
      window.removeEventListener('scroll', scheduleScan, true)
      window.removeEventListener('resize', scheduleScan)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 연결 대기 모드 진입/해제 시 body 커서 변경
  // crosshair: 끝점 클릭 위치를 정확히 지정해야 함을 시각적으로 표시
  // Python으로 치면: body.style.cursor = 'crosshair' if connecting else ''
  // -----------------------------------------------
  useEffect(() => {
    if (connectingState) {
      document.body.style.cursor = 'crosshair'
    } else {
      document.body.style.cursor = ''
    }
    return () => { document.body.style.cursor = '' }
  }, [connectingState])

  // -----------------------------------------------
  // 마커 이동 시 0.6초 하이라이트 효과
  // Python으로 치면: def flash_marker(el): el.classList.add('arrow-flash'); sleep(0.6); el.classList.remove(...)
  // -----------------------------------------------
  const flashMarker = useCallback((el: HTMLElement) => {
    el.classList.add('arrow-marker-flash')
    setTimeout(() => el.classList.remove('arrow-marker-flash'), 700)
  }, [])

  // -----------------------------------------------
  // ● 클릭 네비게이션
  //
  // 클릭 위치가 span 왼쪽 15px 이내(● pseudo-element 영역)이면 네비게이션 실행
  // start 클릭 → end로 이동 (1:N이면 순환)
  // end 클릭   → start로 이동
  //
  // Python으로 치면:
  //   def on_marker_click(e):
  //       if e.x - el.left > 15: return  # 텍스트 영역 클릭 → 무시
  //       if is_start: scroll_to_next_end(arrow_id)
  //       else:        scroll_to_start(arrow_id)
  // -----------------------------------------------
  useEffect(() => {
    const handleMarkerNav = (e: MouseEvent) => {
      // 좌클릭(button===0)에만 반응 — 우클릭은 contextMenu 전용
      if (e.button !== 0) return
      // 연결 대기 모드 중에는 네비게이션 비활성
      if (useArrowStore.getState().connectingState) return

      const target = e.target as HTMLElement
      const marker = target.closest('.arrow-marker') as HTMLElement | null
      if (!marker) return

      const arrowId = marker.getAttribute('data-arrow-id')
      if (!arrowId) return

      // ● pseudo-element 영역(span 왼쪽 15px 이내)인지 확인
      const rect = marker.getBoundingClientRect()
      if (e.clientX > rect.left + 15) return

      e.preventDefault()
      e.stopPropagation()

      const isStart = marker.getAttribute('data-arrow-start') === 'true'
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-arrow-id="${arrowId}"]`)
      )

      if (isStart) {
        // start → end로 이동 (1:N 순환)
        // Python으로 치면: ends[cycle_index % len(ends)].scroll_into_view()
        const ends = all.filter(el => el.getAttribute('data-arrow-start') !== 'true')
        if (ends.length === 0) return
        const prev = cycleIndexRef.current.get(arrowId) ?? -1
        const next = (prev + 1) % ends.length
        cycleIndexRef.current.set(arrowId, next)
        ends[next].scrollIntoView({ behavior: 'smooth', block: 'center' })
        flashMarker(ends[next])
      } else {
        // end → start로 이동
        const start = all.find(el => el.getAttribute('data-arrow-start') === 'true')
        if (!start) return
        start.scrollIntoView({ behavior: 'smooth', block: 'center' })
        flashMarker(start)
      }
    }

    // mousedown 사용: click보다 먼저 실행되어 ProseMirror 커서 이동 방지
    // button === 0 (좌클릭)에만 반응 — 우클릭은 contextMenu 전용
    document.addEventListener('mousedown', handleMarkerNav)
    return () => document.removeEventListener('mousedown', handleMarkerNav)
  }, [flashMarker])

  // -----------------------------------------------
  // 우클릭 시 ProseMirror 커서 이동 방지
  //
  // 마커 우클릭(button===2) → mousedown이 ProseMirror로 전파되어 커서/선택이 이동
  // → contextMenu 메뉴를 꺼내기 어려움
  // 해결: .arrow-marker 위에서 우클릭 mousedown을 막아 ProseMirror 이벤트 차단
  //
  // Python으로 치면: if e.button == 2 and is_marker: e.prevent_default()
  // -----------------------------------------------
  useEffect(() => {
    const handleRightMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      const marker = (e.target as HTMLElement).closest('.arrow-marker')
      if (!marker) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('mousedown', handleRightMouseDown, true)  // capture 단계
    return () => document.removeEventListener('mousedown', handleRightMouseDown, true)
  }, [])

  // -----------------------------------------------
  // 화살표 마커 우클릭 → contextMenu 오픈
  //
  // 이벤트 위임: document에 단일 리스너 → .arrow-marker 요소 탐지
  // Python으로 치면:
  //   document.on_contextmenu(lambda e:
  //       if e.target.matches('.arrow-marker'): open_context_menu(e))
  // -----------------------------------------------
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const marker = target.closest('.arrow-marker') as HTMLElement | null
      if (!marker) return

      const arrowId = marker.getAttribute('data-arrow-id')
      if (!arrowId) return

      e.preventDefault()
      e.stopPropagation()

      // 현재 마커의 속성을 초기값으로 컨텍스트 메뉴 열기
      // Python으로 치면: ctx_menu = ContextMenu(x, y, arrowId, attrs_from_marker)
      useArrowStore.getState().setContextMenu({
        x: e.clientX,
        y: e.clientY,
        arrowId,
        isStart: marker.getAttribute('data-arrow-start') === 'true',
        attrs: {
          color:     marker.getAttribute('data-arrow-color')    ?? 'blue',
          opacity:   parseFloat(marker.getAttribute('data-arrow-opacity') ?? '1'),
          arrowType: (marker.getAttribute('data-arrow-type')    ?? 'margin') as 'margin' | 'diagonal',
          xPosition: parseInt(marker.getAttribute('data-arrow-x') ?? '0', 10),
          startHead: marker.getAttribute('data-arrow-start-head') === 'true',
          endHead:   marker.getAttribute('data-arrow-end-head')  !== 'false',
        },
      })
    }

    // capture 단계 사용: Editor.tsx onContextMenu보다 먼저 실행
    // → stopPropagation()으로 에디터 본문 우클릭 메뉴 차단
    // Python으로 치면: document.add_event_listener('contextmenu', handler, use_capture=True)
    document.addEventListener('contextmenu', handleContextMenu, true)
    return () => document.removeEventListener('contextmenu', handleContextMenu, true)
  }, [])

  // -----------------------------------------------
  // 연결 대기 모드 — 마우스 이동 추적 + 클릭 시 끝점 지정
  //
  // 마우스 이동: mousePos 갱신 → 고무줄 선 끝점으로 사용
  // 클릭: caretRangeFromPoint → 클릭한 위치의 텍스트 노드 탐색
  //        → 해당 단어 범위 선택 → end 마크 적용
  //
  // Python으로 치면:
  //   def on_click(x, y):
  //       range = caret_range_from_point(x, y)
  //       word_range = expand_to_word(range)
  //       editor.set_mark('arrowMark', {isStart:false, ...})
  // -----------------------------------------------
  useEffect(() => {
    if (!connectingState) return

    // 마우스 이동 → mousePos 갱신
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }

    // 클릭 → 끝점 단어에 마크 적용
    // Python으로 치면: def handle_click(e): find_word_at_click(e) → apply_end_mark()
    const handleClick = (e: MouseEvent) => {
      if (!connectingState) return

      // caretRangeFromPoint: 클릭 좌표의 텍스트 캐럿 위치 탐색
      // Python으로 치면: range = document.caret_range_from_point(x, y)
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
      if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
        // 텍스트 노드가 아닌 곳 클릭 → 연결 취소
        useArrowStore.getState().clearConnecting()
        return
      }

      // 클릭 위치에서 단어 경계로 확장
      // Python으로 치면: word_range = expand_to_word_boundary(range)
      const textNode = range.startContainer as Text
      const offset = range.startOffset
      const text = textNode.textContent ?? ''

      // 단어 시작: offset에서 왼쪽으로 비알파벳 문자 찾기
      let wordStart = offset
      while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--
      // 단어 끝: offset에서 오른쪽으로 비알파벳 문자 찾기
      let wordEnd = offset
      while (wordEnd < text.length && /\S/.test(text[wordEnd])) wordEnd++

      if (wordStart === wordEnd) {
        // 공백 클릭 → 연결 취소
        useArrowStore.getState().clearConnecting()
        return
      }

      // DOM Range 생성
      const wordRange = document.createRange()
      wordRange.setStart(textNode, wordStart)
      wordRange.setEnd(textNode, wordEnd)

      // ProseMirror 에디터 DOM 탐색 → 해당 에디터 인스턴스 찾기
      // Python으로 치면: editor = find_editor_containing(text_node)
      const editorDom = textNode.parentElement?.closest('.ProseMirror')
      if (!editorDom) {
        useArrowStore.getState().clearConnecting()
        return
      }

      // 에디터 인스턴스를 DOM에서 가져오기 — tiptap이 __tiptapEditor 속성에 저장
      // Python으로 치면: editor = editor_dom.__tiptap_editor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editorDom as any).__tiptapEditor
      if (!tiptapEditor || !tiptapEditor.schema.marks['arrowMark']) {
        useArrowStore.getState().clearConnecting()
        return
      }

      // DOM 오프셋 → ProseMirror 포지션 변환
      // Python으로 치면: pm_pos = editor.view.pos_at_dom(text_node, word_start)
      const pmStart = tiptapEditor.view.posAtDOM(textNode, wordStart)
      const pmEnd   = tiptapEditor.view.posAtDOM(textNode, wordEnd)

      if (pmStart >= pmEnd) {
        useArrowStore.getState().clearConnecting()
        return
      }

      // 끝점 마크 적용
      // Python으로 치면: editor.set_mark('arrowMark', {isStart:false, arrowId, ...})
      tiptapEditor.chain()
        .focus()
        .setTextSelection({ from: pmStart, to: pmEnd })
        .setMark('arrowMark', {
          arrowId: connectingState.arrowId,
          isStart: false,
          color: connectingState.color,
          opacity: connectingState.opacity,
          arrowType: connectingState.arrowType,
          xPosition: connectingState.xPosition,
          startHead: connectingState.startHead,
          endHead: connectingState.endHead,
        })
        .run()

      // 연결 완료 → 대기 모드 해제
      useArrowStore.getState().clearConnecting()
      // DOM 업데이트 반영을 위해 스캔 예약
      scheduleScan()
    }

    // Escape → 연결 취소
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useArrowStore.getState().clearConnecting()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [connectingState])  // eslint-disable-line react-hooks/exhaustive-deps

  // 연결 대기 중이 아니고 세그먼트도 없으면 렌더링 생략
  if (segments.length === 0 && !connectingState) return null

  return (
    // SVG 자체: pointer-events none, 각 <g>: pointer-events stroke (호버 감지)
    // 연결 대기 모드에서는 커서를 crosshair로 변경
    <svg
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: connectingState ? 'none' : 'none',
        zIndex: 9999,
        overflow: 'visible',
        // 연결 대기 모드: 전체 화면 커서 변경 (SVG 자체에는 pointer-events 없으므로 body에 적용)
        cursor: 'default',
      }}
    >
      {/* ── 기존 화살표 세그먼트 렌더링 ─────────── */}
      {segments.map(({
        key, sx, sy, ex, ey,
        color, opacity, arrowType, xPosition,
        startHead, endHead,
      }) => {
        // 색상: ARROW_COLORS 이름이면 HEX 변환, 아니면 CSS 색상 직접 사용
        // Python으로 치면: color_hex = ARROW_COLORS.get(color, color)
        const colorHex = ARROW_COLORS[color] ?? color

        const isHovered = hoveredKey === key
        // 기본 낮은 투명도 → 호버 시 원래 opacity로 복원
        // Python으로 치면: final_opacity = opacity if hovered else opacity * 0.15
        const baseOpacity = opacity * 0.15
        const finalOpacity = isHovered ? opacity : baseOpacity

        // ── 경로 + 제어점 계산 ──────────────────
        // Python으로 치면: path_data = margin_path(...) if type == 'margin' else diagonal_path(...)
        let pathD: string
        let startTailX: number, startTailY: number  // 시작 화살촉 방향 (cp1 방향)
        let endTailX: number,   endTailY: number     // 끝 화살촉 방향 (cp2 방향)

        // ● 원과 선이 겹치지 않도록 경로 시작/끝점을 원 반경만큼 오프셋
        // diagonal: anchorX = rect.left = ● 위치 → 8px 안쪽에서 선 시작
        // margin:   anchorX = ProseMirror.left - 10 (margin 영역) = ● 위치와 다름 → 오프셋 불필요
        // Python으로 치면: (ps, pe) = offset_from_circle(sx, sy, ex, ey, gap=8)
        const CIRCLE_GAP = 8
        let psx = sx, psy = sy, pex = ex, pey = ey  // path 실제 시작/끝점

        if (arrowType === 'diagonal') {
          const dx = ex - sx
          const dy = ey - sy
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          psx = sx + (dx / len) * CIRCLE_GAP
          psy = sy + (dy / len) * CIRCLE_GAP
          pex = ex - (dx / len) * CIRCLE_GAP
          pey = ey - (dy / len) * CIRCLE_GAP
        }

        if (arrowType === 'margin') {
          const { d, cp1x, cp1y, cp2x, cp2y } = marginPath(psx, psy, pex, pey, xPosition)
          pathD = d
          startTailX = cp1x; startTailY = cp1y
          endTailX = cp2x; endTailY = cp2y
        } else {
          const { d, cpx, cpy } = diagonalPath(psx, psy, pex, pey)
          pathD = d
          startTailX = cpx; startTailY = cpy
          endTailX = cpx;   endTailY = cpy
        }

        // 끝 화살촉: endTail → (pex, pey) 방향
        const endHeadPoints   = calcArrowhead(endTailX,   endTailY,   pex, pey)
        // 시작 화살촉: startTail → (psx, psy) 방향 (역방향)
        const startHeadPoints = calcArrowhead(startTailX, startTailY, psx, psy)

        return (
          <g
            key={key}
            style={{
              pointerEvents: 'stroke',
              cursor: 'default',
              transition: 'opacity 0.2s ease',
              opacity: finalOpacity,
            }}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            {/* 호버 감지 확장용 투명 패스 — strokeWidth로 감지 범위 설정 */}
            {/* 선 두께(2.7px) 기준으로 양쪽 ~18px 범위 커버 */}
            <path d={pathD} fill="none" stroke="transparent" strokeWidth={20} />

            {/* 실제 보이는 선 — 점선 제거, 굵기 2.7(기존 1.8의 1.5배) */}
            <path
              d={pathD}
              fill="none"
              stroke={colorHex}
              strokeWidth={2.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 끝점 화살촉 */}
            {endHead && (
              <polygon points={endHeadPoints} fill={colorHex} />
            )}

            {/* 시작점 화살촉 (양방향) */}
            {startHead && (
              <polygon points={startHeadPoints} fill={colorHex} />
            )}
          </g>
        )
      })}

      {/* ── 연결 대기 모드: 고무줄 선 + 시작 원 ── */}
      {/* Python으로 치면: if connecting_state: draw_rubber_band_line() */}
      {connectingState && (() => {
        const { anchorX, anchorY, color } = connectingState
        const colorHex = ARROW_COLORS[color] ?? color
        const mx = mousePos.x
        const my = mousePos.y

        // 고무줄 선 경로: 시작 원에서 마우스 커서까지 직선
        const rubberD = `M ${anchorX},${anchorY} L ${mx},${my}`

        return (
          <g style={{ pointerEvents: 'none' }}>
            {/* 고무줄 선 */}
            <path
              d={rubberD}
              fill="none"
              stroke={colorHex}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* 시작 원 핸들 */}
            <circle
              cx={anchorX}
              cy={anchorY}
              r={5}
              fill={colorHex}
              opacity={0.9}
            />
            {/* 마우스 끝점 원 */}
            <circle
              cx={mx}
              cy={my}
              r={3}
              fill={colorHex}
              opacity={0.6}
            />
          </g>
        )
      })()}
    </svg>
  )
}
