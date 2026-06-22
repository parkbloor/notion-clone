// =============================================
// planner/usePlannerEventDrag.ts
// 역할: Day Planner 일정의 세로 드래그·리사이즈 포인터 상태 관리
// Python으로 치면: class PlannerEventDragController
// =============================================

'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { type PlanEvent } from '@/types/block'
import { eventPx, minToTime, timeToMin } from './PlannerTimeline'

interface DragState {
  event: PlanEvent
  startClientY: number
  origStartMin: number
  duration: number
  currentTop: number
  moved: boolean
}

interface ResizeState {
  event: PlanEvent
  startClientY: number
  origEndMin: number
  startMin: number
  currentHeight: number
}

interface UsePlannerEventDragOptions {
  hourPx: number
  startHour: number
  endHour: number
  snapMin: number
  onUpsertEvent: (event: PlanEvent) => void
  onSelectEvent: (eventId: string) => void
}

// Day Planner의 실제 이벤트 위치 변경과 미리보기 상태를 한 곳에서 관리한다.
// Python으로 치면: controller = PlannerEventDragController(config, on_upsert, on_select)
export function usePlannerEventDrag({
  hourPx,
  startHour,
  endHour,
  snapMin,
  onUpsertEvent,
  onSelectEvent,
}: UsePlannerEventDragOptions) {
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const justDraggedRef = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPreviewTop, setDragPreviewTop] = useState<number | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [resizePreviewHeight, setResizePreviewHeight] = useState<number | null>(null)

  // 일정 본문 mousedown → 세로 이동 시작
  // Python으로 치면: def start_drag(event, plan_event): ...
  const startDrag = useCallback((e: ReactMouseEvent, event: PlanEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const px = eventPx(event, hourPx, startHour, endHour)
    if (!px) return
    dragRef.current = {
      event,
      startClientY: e.clientY,
      origStartMin: timeToMin(event.start),
      duration: timeToMin(event.end) - timeToMin(event.start),
      currentTop: px.top,
      moved: false,
    }
    setDraggingId(event.id)
    setDragPreviewTop(px.top)
  }, [hourPx, startHour, endHour])

  // 일정 하단 핸들 mousedown → 종료 시각 리사이즈 시작
  // Python으로 치면: def start_resize(event, plan_event): ...
  const startResize = useCallback((e: ReactMouseEvent, event: PlanEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const px = eventPx(event, hourPx, startHour, endHour)
    if (!px) return
    resizeRef.current = {
      event,
      startClientY: e.clientY,
      origEndMin: timeToMin(event.end),
      startMin: timeToMin(event.start),
      currentHeight: px.height,
    }
    setResizingId(event.id)
    setResizePreviewHeight(px.height)
  }, [hourPx, startHour, endHour])

  useEffect(() => {
    const pxPerMin = hourPx / 60

    // mouseup 직후의 합성 click만 막고, 다음 정상 빈 슬롯 클릭은 막지 않는다.
    // Python으로 치면: suppress_click_once() -> call_soon(reset_flag)
    function suppressTimelineClickOnce() {
      justDraggedRef.current = true
      window.setTimeout(() => { justDraggedRef.current = false }, 0)
    }

    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (drag) {
        const deltaY = e.clientY - drag.startClientY
        if (Math.abs(deltaY) > 4) drag.moved = true
        if (drag.moved) {
          const deltaMin = Math.round(deltaY / pxPerMin / snapMin) * snapMin
          const nextStart = Math.max(startHour * 60, Math.min(endHour * 60 - drag.duration, drag.origStartMin + deltaMin))
          drag.currentTop = (nextStart - startHour * 60) * pxPerMin
          setDragPreviewTop(drag.currentTop)
        }
      }

      const resize = resizeRef.current
      if (resize) {
        const deltaMin = Math.round((e.clientY - resize.startClientY) / pxPerMin / snapMin) * snapMin
        const nextEnd = Math.max(resize.startMin + snapMin, Math.min(endHour * 60, resize.origEndMin + deltaMin))
        resize.currentHeight = (nextEnd - resize.startMin) * pxPerMin
        setResizePreviewHeight(resize.currentHeight)
      }
    }

    function onMouseUp() {
      const drag = dragRef.current
      if (drag) {
        dragRef.current = null
        setDraggingId(null)
        setDragPreviewTop(null)
        suppressTimelineClickOnce()
        if (drag.moved) {
          const nextStart = Math.round(drag.currentTop / pxPerMin / snapMin) * snapMin + startHour * 60
          const clamped = Math.max(startHour * 60, Math.min(endHour * 60 - drag.duration, nextStart))
          onUpsertEvent({ ...drag.event, start: minToTime(clamped), end: minToTime(clamped + drag.duration) })
        } else {
          onSelectEvent(drag.event.id)
        }
      }

      const resize = resizeRef.current
      if (resize) {
        resizeRef.current = null
        setResizingId(null)
        setResizePreviewHeight(null)
        suppressTimelineClickOnce()
        const nextEnd = Math.max(
          resize.startMin + snapMin,
          Math.min(endHour * 60, Math.round(resize.currentHeight / pxPerMin / snapMin) * snapMin + resize.startMin),
        )
        onUpsertEvent({ ...resize.event, end: minToTime(nextEnd) })
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [hourPx, startHour, endHour, snapMin, onUpsertEvent, onSelectEvent])

  // 드래그 뒤 이어지는 타임라인 click으로 새 일정 폼이 열리는 것을 한 번 차단한다.
  // Python으로 치면: def consume_dragged_click(): return flag_and_reset()
  const consumeDraggedClick = useCallback(() => {
    if (!justDraggedRef.current) return false
    justDraggedRef.current = false
    return true
  }, [])

  return {
    draggingId,
    dragPreviewTop,
    resizingId,
    resizePreviewHeight,
    startDrag,
    startResize,
    consumeDraggedClick,
  }
}
