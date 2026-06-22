'use client'

import { type ReactNode, type Ref, useMemo } from 'react'
import { PlanEvent } from '@/types/block'

export const EVENT_COLORS = [
  { id: 'blue',     bg: 'bg-blue-400',     text: 'text-white', dot: 'bg-blue-400'     },
  { id: 'sky',      bg: 'bg-sky-400',      text: 'text-white', dot: 'bg-sky-400'      },
  { id: 'cyan',     bg: 'bg-cyan-400',     text: 'text-white', dot: 'bg-cyan-400'     },
  { id: 'teal',     bg: 'bg-teal-400',     text: 'text-white', dot: 'bg-teal-400'     },
  { id: 'green',    bg: 'bg-emerald-400',  text: 'text-white', dot: 'bg-emerald-400'  },
  { id: 'lime',     bg: 'bg-lime-400',     text: 'text-gray-800', dot: 'bg-lime-400'  },
  { id: 'yellow',   bg: 'bg-yellow-400',   text: 'text-gray-800', dot: 'bg-yellow-400'},
  { id: 'amber',    bg: 'bg-amber-400',    text: 'text-white', dot: 'bg-amber-400'    },
  { id: 'orange',   bg: 'bg-orange-400',   text: 'text-white', dot: 'bg-orange-400'   },
  { id: 'red',      bg: 'bg-rose-400',     text: 'text-white', dot: 'bg-rose-400'     },
  { id: 'pink',     bg: 'bg-pink-400',     text: 'text-white', dot: 'bg-pink-400'     },
  { id: 'fuchsia',  bg: 'bg-fuchsia-400',  text: 'text-white', dot: 'bg-fuchsia-400'  },
  { id: 'purple',   bg: 'bg-violet-400',   text: 'text-white', dot: 'bg-violet-400'   },
  { id: 'indigo',   bg: 'bg-indigo-400',   text: 'text-white', dot: 'bg-indigo-400'   },
  { id: 'slate',    bg: 'bg-slate-400',    text: 'text-white', dot: 'bg-slate-400'    },
  { id: 'gray',     bg: 'bg-gray-400',     text: 'text-white', dot: 'bg-gray-400'     },
]

export function getColor(id: string) {
  return EVENT_COLORS.find(c => c.id === id) ?? EVENT_COLORS[0]
}

export const START_HOUR = 0
export const END_HOUR = 24

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return isNaN(h) ? -1 : h * 60 + m
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

export function eventPx(
  event: PlanEvent,
  hourPx: number,
  startHour = START_HOUR,
  endHour = END_HOUR,
): { top: number; height: number } | null {
  const startMin = timeToMin(event.start)
  const endMin   = timeToMin(event.end)
  if (startMin < 0 || endMin <= startMin) return null
  const baseMin  = startHour * 60
  const limitMin = endHour * 60
  if (endMin <= baseMin || startMin >= limitMin) return null
  const pxPerMin = hourPx / 60
  const visibleStart = Math.max(startMin, baseMin)
  const visibleEnd   = Math.min(endMin, limitMin)
  return {
    top:    Math.max(0, (visibleStart - baseMin) * pxPerMin),
    height: Math.max(24, (visibleEnd - visibleStart) * pxPerMin),
  }
}

export interface LayoutEvent {
  event: PlanEvent
  top: number
  height: number
  col: number
  totalCols: number
}

export function layoutEvents(
  events: PlanEvent[],
  hourPx: number,
  startHour = START_HOUR,
  endHour = END_HOUR,
): LayoutEvent[] {
  const items = events
    .map(ev => { const px = eventPx(ev, hourPx, startHour, endHour); return px ? { event: ev, ...px } : null })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.top - b.top)

  const columns: { event: PlanEvent; top: number; height: number; end: number }[][] = []
  for (const item of items) {
    let placed = false
    for (const col of columns) {
      if (col[col.length - 1].end <= item.top) {
        col.push({ ...item, end: item.top + item.height })
        placed = true
        break
      }
    }
    if (!placed) columns.push([{ ...item, end: item.top + item.height }])
  }

  const result: LayoutEvent[] = []
  columns.forEach((col, colIdx) => {
    for (const item of col) {
      const overlapping = columns.filter(c =>
        c.some(b => b.top < item.top + item.height && b.end > item.top)
      ).length
      result.push({ event: item.event, top: item.top, height: item.height, col: colIdx, totalCols: overlapping })
    }
  })
  return result
}

export function yToTime(y: number, hourPx: number, startHour = START_HOUR, endHour = END_HOUR, snapMin = 15): string {
  const startMin = startHour * 60
  const endMin   = endHour * 60
  const min = startMin + Math.round(y / (hourPx / 60) / snapMin) * snapMin
  return minToTime(Math.max(startMin, Math.min(endMin - snapMin, min)))
}

export function isScheduledEvent(event: PlanEvent): boolean {
  if (event.scheduled === false) return false
  if (event.scheduled === true) return Boolean(event.start && event.end)
  return Boolean(event.start && event.end && event.start !== '00:00')
}

export function isUnscheduledEvent(event: PlanEvent): boolean {
  return !isScheduledEvent(event)
}

interface PlannerTimelineProps {
  events: PlanEvent[]
  hourPx: number
  startHour?: number
  endHour?: number
  nowTop?: number | null
  timelineRef?: Ref<HTMLDivElement>
  onTimelineClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  onEventMouseDown?: (e: React.MouseEvent, ev: PlanEvent) => void
  onResizeMouseDown?: (e: React.MouseEvent, ev: PlanEvent) => void
  selectedEventId?: string | null
  draggingId?: string | null
  resizingId?: string | null
  editable?: boolean
  showHalfHours?: boolean
  timeLabelWidthClass?: string
  timeLabelClassName?: string
  eventTitleClassName?: string
  eventTimeClassName?: string
  gridClassName?: string
  children?: ReactNode
}

export default function PlannerTimeline({
  events,
  hourPx,
  startHour = START_HOUR,
  endHour = END_HOUR,
  nowTop = null,
  timelineRef,
  onTimelineClick,
  onEventMouseDown,
  onResizeMouseDown,
  selectedEventId = null,
  draggingId = null,
  resizingId = null,
  editable = false,
  showHalfHours = true,
  timeLabelWidthClass = 'w-12',
  timeLabelClassName = 'text-[10px] text-gray-400 pr-2',
  eventTitleClassName = 'text-[11px]',
  eventTimeClassName = 'text-[9px]',
  gridClassName = '',
  children,
}: PlannerTimelineProps) {
  const totalHours = endHour - startHour
  const totalHeight = totalHours * hourPx
  const layoutItems = useMemo(
    () => layoutEvents(events, hourPx, startHour, endHour),
    [events, hourPx, startHour, endHour],
  )

  return (
    <div className="flex">
      <div className={`${timeLabelWidthClass} shrink-0 relative`} style={{ height: totalHeight }}>
        {Array.from({ length: totalHours + 1 }, (_, i) => (
          <div
            key={i}
            className={`absolute text-right leading-none ${timeLabelClassName}`}
            style={{ top: i === 0 ? 2 : i * hourPx - 6, right: 0, width: '100%' }}
          >
            {String(startHour + i).padStart(2,'0')}:00
          </div>
        ))}
      </div>

      <div
        ref={timelineRef}
        onClick={onTimelineClick}
        className={`flex-1 relative border-l border-gray-200 ${editable ? 'cursor-cell' : ''} ${gridClassName}`}
        style={{ height: totalHeight }}
      >
        {Array.from({ length: totalHours }, (_, i) => (
          <div key={i} className="absolute left-0 right-0 border-t border-gray-100"
            style={{ top: i * hourPx }} />
        ))}
        {showHalfHours && Array.from({ length: totalHours }, (_, i) => (
          <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-dashed border-gray-50"
            style={{ top: i * hourPx + hourPx / 2 }} />
        ))}

        {nowTop !== null && (
          <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
            style={{ top: nowTop }}>
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
            <div className="flex-1 border-t-2 border-red-400" />
          </div>
        )}

        {layoutItems.map((li, idx) => {
          const c          = getColor(li.event.color)
          const widthPct   = 100 / li.totalCols
          const leftPct    = li.col * widthPct
          const isDragging = draggingId === li.event.id
          const isResizing = resizingId === li.event.id
          const style = {
            position: 'absolute' as const,
            top:    li.top + 1,
            height: li.height - 2,
            left:   `calc(${leftPct}% + 2px)`,
            width:  `calc(${widthPct}% - 4px)`,
            cursor: editable ? (isDragging ? 'grabbing' : 'grab') : undefined,
          }
          const className = [
            'rounded-lg text-left px-2 overflow-hidden flex flex-col justify-start z-10',
            editable ? 'shadow-sm transition-all' : '',
            c.bg, c.text,
            editable && (isDragging || isResizing) ? 'opacity-30' : '',
            editable && !(isDragging || isResizing) ? 'hover:brightness-110' : '',
            li.event.done ? 'opacity-50' : '',
            selectedEventId === li.event.id ? 'ring-2 ring-white ring-offset-1' : '',
          ].filter(Boolean).join(' ')
          const body = (
            <>
              <span className={[
                `${eventTitleClassName} font-semibold truncate leading-tight mt-0.5`,
                li.event.done ? 'line-through opacity-70' : '',
              ].join(' ')}>
                {!editable && li.event.done ? '✓ ' : ''}{li.event.title}
              </span>
              {li.height > (editable ? 32 : 28) && (
                <span className={`${eventTimeClassName} opacity-80 leading-tight`}>
                  {li.event.start} {editable ? '–' : '-'} {li.event.end}
                </span>
              )}
              {editable && !li.event.done && (
                <div
                  onMouseDown={e => onResizeMouseDown?.(e, li.event)}
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 's-resize' }}
                  className="rounded-b-lg bg-white/0 hover:bg-white/30 transition-colors"
                />
              )}
            </>
          )

          return editable ? (
            <button
              key={idx}
              type="button"
              onMouseDown={e => onEventMouseDown?.(e, li.event)}
              style={style}
              className={className}
            >
              {body}
            </button>
          ) : (
            <div key={idx} style={style} className={className}>
              {body}
            </div>
          )
        })}

        {children}
      </div>
    </div>
  )
}
