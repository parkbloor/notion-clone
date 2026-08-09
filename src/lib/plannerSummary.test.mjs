import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectPlannerCalendarEntries,
  summarizePlannerPeriod,
} from './plannerSummary.ts'

const event = (id, done, start = '09:00', end = '10:00', extra = {}) => ({
  id,
  title: id,
  start,
  end,
  color: 'blue',
  done,
  ...extra,
})

test('collects recent and archived planner events without duplicate identities', () => {
  const pages = [{
    id: 'page-1', title: '계획', icon: '📄', createdAt: '', updatedAt: '',
    blocks: [{ id: 'block-1', type: 'dayplanner', content: JSON.stringify({
      eventsByDate: { '2026-08-08': [event('same', true), event('recent', false)] },
    }) }],
  }]
  const entries = collectPlannerCalendarEntries(pages, {
    '2026-08-08': [event('same', false), event('archive', true)],
  })

  assert.deepEqual(entries.map(entry => entry.event.id), ['same', 'recent', 'archive'])
  assert.equal(entries[0].event.done, true)
})

test('summarizes completion, scheduled time, and only identified routines', () => {
  const entries = [
    { date: '2026-08-01', event: event('manual-done', true, '09:00', '10:30') },
    { date: '2026-08-02', event: event('manual-open', false, '10:00', '11:00') },
    { date: '2026-08-03', event: event('routine-done', true, '07:00', '07:30', { source: 'routine', routineId: 'r1' }) },
    { date: '2026-08-04', event: event('routine-open', false, '07:00', '07:30', { source: 'routine', routineId: 'r1' }) },
    { date: '2026-09-01', event: event('outside', true) },
  ]
  const summary = summarizePlannerPeriod(entries, '2026-08-01', '2026-08-31')

  assert.equal(summary.totalEvents, 4)
  assert.equal(summary.completedEvents, 2)
  assert.equal(summary.completionRate, 50)
  assert.equal(summary.plannedMinutes, 210)
  assert.equal(summary.completedMinutes, 120)
  assert.equal(summary.routineEvents, 2)
  assert.equal(summary.completedRoutineEvents, 1)
  assert.equal(summary.routineCompletionRate, 50)
})
