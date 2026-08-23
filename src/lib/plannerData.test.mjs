import assert from 'node:assert/strict'
import test from 'node:test'

import { parsePlannerData } from './plannerData.ts'

const oldEvent = { id: 'old', title: 'old', start: '09:00', end: '10:00' }
const newEvent = { id: 'new', title: 'new', start: '10:00', end: '11:00' }

test('converts legacy date and events without losing them', () => {
  const parsed = parsePlannerData(JSON.stringify({ date: '2026-08-23', events: [oldEvent] }))

  assert.equal(parsed.schema, 'legacy')
  assert.equal(parsed.writable, true)
  assert.deepEqual(parsed.data.eventsByDate['2026-08-23'], [oldEvent])
})

test('merges mixed data by event id and keeps the current copy', () => {
  const parsed = parsePlannerData(JSON.stringify({
    date: '2026-08-23',
    events: [oldEvent],
    eventsByDate: { '2026-08-23': [{ ...oldEvent, title: 'updated' }, newEvent] },
  }))

  assert.equal(parsed.schema, 'mixed')
  assert.deepEqual(parsed.data.eventsByDate['2026-08-23'].map(event => event.title), ['updated', 'new'])
})

test('locks malformed data instead of treating it as an empty writable planner', () => {
  const brokenJson = parsePlannerData('{broken')
  const brokenShape = parsePlannerData(JSON.stringify({ eventsByDate: [] }))

  assert.equal(brokenJson.writable, false)
  assert.equal(brokenShape.writable, false)
  assert.equal(brokenJson.schema, 'invalid')
  assert.equal(brokenShape.schema, 'invalid')
})
