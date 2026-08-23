import assert from 'node:assert/strict'
import test from 'node:test'

import { findDiaryByDate, getDiaryTitle, isValidDiaryDate } from './diaryIdentity.ts'

test('finds diary pages by role and date instead of title', () => {
  const diary = { id: 'diary', title: '제목을 바꾼 일기', pageRole: 'diary-day', periodKey: '2026-08-23' }
  const sameTitle = { id: 'memo', title: '일기 2026-08-23' }

  assert.equal(findDiaryByDate([sameTitle, diary], '2026-08-23')?.id, 'diary')
})

test('validates real local calendar dates', () => {
  assert.equal(isValidDiaryDate('2026-08-23'), true)
  assert.equal(isValidDiaryDate('2026-02-30'), false)
  assert.equal(isValidDiaryDate('2026-8-23'), false)
  assert.equal(getDiaryTitle('2026-08-23'), '일기 2026-08-23')
})
