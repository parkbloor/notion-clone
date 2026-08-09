'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const net = require('node:net')
const { EventEmitter } = require('node:events')
const { installShutdownSignalHandlers, stopChildProcess } = require('./process-manager')

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(300, () => { socket.destroy(); resolve(false) })
  })
}

async function waitForPort(port, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await canConnect(port) === expected) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`포트 ${port} 상태가 ${expected ? '열림' : '닫힘'}으로 바뀌지 않았습니다`)
}

test('Windows에서는 부모 kill보다 taskkill 프로세스 트리를 먼저 종료한다', () => {
  const calls = []
  const child = {
    pid: 4321,
    kill: () => calls.push('kill'),
  }

  stopChildProcess(child, {
    platform: 'win32',
    runTaskkill: (command, args, options) => {
      calls.push({ command, args, options })
      return { status: 0 }
    },
  })

  assert.deepEqual(calls, [{
    command: 'taskkill.exe',
    args: ['/pid', '4321', '/t', '/f'],
    options: { windowsHide: true, stdio: 'ignore' },
  }])
})

test('taskkill 실패 시 직접 kill로 정리한다', () => {
  let killed = false
  const child = { pid: 4321, kill: () => { killed = true } }

  stopChildProcess(child, {
    platform: 'win32',
    runTaskkill: () => ({ status: 1 }),
  })

  assert.equal(killed, true)
})

test('Windows taskkill은 자식 서버까지 종료해 포트를 반환한다', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const port = await findFreePort()
  const serverCode = `require('net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000)`
  const parentCode = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(serverCode)}], { stdio: 'ignore' }); setInterval(() => {}, 1000)`
  const parent = spawn(process.execPath, ['-e', parentCode], { stdio: 'ignore' })
  t.after(() => {
    if (parent.exitCode === null) stopChildProcess(parent)
  })

  await waitForPort(port, true)
  stopChildProcess(parent)
  await waitForPort(port, false)
})

test('Ctrl+C와 종료 신호가 겹쳐도 정리는 한 번만 실행한다', () => {
  const processTarget = new EventEmitter()
  const received = []
  installShutdownSignalHandlers(processTarget, (signal) => received.push(signal))

  processTarget.emit('SIGINT')
  processTarget.emit('SIGTERM')

  assert.deepEqual(received, ['SIGINT'])
})
