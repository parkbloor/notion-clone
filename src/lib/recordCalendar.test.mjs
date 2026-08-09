import test from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeRecordCalendarMonth,
  summarizeRecordCalendarPeriod,
} from './recordCalendar.ts'

const entry = (date, kind, title, blockId) => ({
  date,
  kind,
  title,
  blockId,
  pageId: `page-${blockId}`,
  pageTitle: `page ${blockId}`,
  pageIcon: '📄',
})

test('summarizes only the selected month by day, kind, and newest date first', () => {
  const summary = summarizeRecordCalendarMonth([
    entry('2026-08-02', '스톡', '두 번째', '2'),
    entry('2026-07-31', '스톡', '지난달', 'old'),
    entry('2026-08-01', '습관', '첫 번째', '1'),
    entry('2026-08-02', '스톡', '세 번째', '3'),
    entry('2026-08-03', '', '종류 없음', '4'),
  ], '2026-08')

  assert.equal(summary.totalRecords, 4)
  assert.equal(summary.activeDays, 3)
  assert.deepEqual(summary.kindCounts, [
    { kind: '스톡', count: 2 },
    { kind: '', count: 1 },
    { kind: '습관', count: 1 },
  ])
  assert.deepEqual(summary.dateGroups.map(group => group.date), [
    '2026-08-03',
    '2026-08-02',
    '2026-08-01',
  ])
})

test('returns an empty summary for an invalid month key', () => {
  const summary = summarizeRecordCalendarMonth([
    entry('2026-08-02', '스톡', '기록', '1'),
  ], '2026-8')

  assert.equal(summary.totalRecords, 0)
  assert.equal(summary.activeDays, 0)
  assert.deepEqual(summary.kindCounts, [])
  assert.deepEqual(summary.dateGroups, [])
})

test('summarizes the quarter containing the anchor month', () => {
  const summary = summarizeRecordCalendarPeriod([
    entry('2026-06-30', '작업', '이전 분기', 'old'),
    entry('2026-07-01', '작업', '분기 시작', '1'),
    entry('2026-08-08', '생활', '분기 중간', '2'),
    entry('2026-09-30', '작업', '분기 끝', '3'),
    entry('2026-10-01', '작업', '다음 분기', 'next'),
  ], 2026, 8, 'quarter')

  assert.equal(summary.label, '2026 Q3')
  assert.equal(summary.startDate, '2026-07-01')
  assert.equal(summary.endDate, '2026-09-30')
  assert.equal(summary.totalRecords, 3)
  assert.equal(summary.activeDays, 3)
})

test('summarizes a calendar year and excludes adjacent years', () => {
  const summary = summarizeRecordCalendarPeriod([
    entry('2025-12-31', '작업', '지난해', 'old'),
    entry('2026-01-01', '작업', '연초', '1'),
    entry('2026-12-31', '생활', '연말', '2'),
    entry('2027-01-01', '작업', '내년', 'next'),
  ], 2026, 8, 'year')

  assert.equal(summary.label, '2026')
  assert.equal(summary.startDate, '2026-01-01')
  assert.equal(summary.endDate, '2026-12-31')
  assert.equal(summary.totalRecords, 2)
})
