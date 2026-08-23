import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDailyCaptureContent } from './block.ts'

test('normalizes a daily capture with missing content', () => {
  assert.deepEqual(parseDailyCaptureContent(undefined), {
    version: 1,
    date: '',
    body: '',
    entries: [{ id: 'legacy-0', text: '' }],
  })
})

test('retains legacy daily capture text', () => {
  const content = '오늘 있었던 일\n내일은 조금 천천히 시작하자'
  const parsed = parseDailyCaptureContent(content)

  assert.equal(parsed.body, content)
  assert.equal(parsed.entries.length, 2)
})
