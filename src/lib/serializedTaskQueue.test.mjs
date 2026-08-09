import test from 'node:test'
import assert from 'node:assert/strict'
import { runSerializedTask } from './serializedTaskQueue.ts'

test('같은 페이지 작업은 앞 작업이 끝난 뒤 시작한다', async () => {
  const events = []
  let releaseFirst
  const firstGate = new Promise(resolve => { releaseFirst = resolve })

  const first = runSerializedTask('page-1', async () => {
    events.push('first:start')
    await firstGate
    events.push('first:end')
    return 1
  })
  const second = runSerializedTask('page-1', async () => {
    events.push('second:start')
    return 2
  })

  await Promise.resolve()
  assert.deepEqual(events, ['first:start'])

  releaseFirst()
  assert.deepEqual(await Promise.all([first, second]), [1, 2])
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])
})

test('다른 페이지 작업은 서로 기다리지 않는다', async () => {
  const events = []
  let releaseFirst
  const firstGate = new Promise(resolve => { releaseFirst = resolve })

  const first = runSerializedTask('page-a', async () => {
    events.push('a')
    await firstGate
  })
  const second = runSerializedTask('page-b', async () => {
    events.push('b')
  })

  await second
  assert.deepEqual(events, ['a', 'b'])
  releaseFirst()
  await first
})
