'use strict'

// 개발 배치의 최상위 종료 감시자: Ctrl+C 때 npm/Electron/서버 트리를 함께 정리한다.
// Python으로 치면: child = subprocess.Popen(...); signal.signal(SIGINT, shutdown_tree)
const { spawn } = require('child_process')
const path = require('path')
const { installShutdownSignalHandlers, stopChildProcess } = require('../electron/process-manager')

const root = path.join(__dirname, '..')
const reuseNext = process.env.REUSE_NEXT === '1'
const command = reuseNext
  ? path.join(root, 'node_modules', '.bin', 'electron.cmd')
  : 'npm.cmd'
const args = reuseNext ? ['.'] : ['run', 'electron:dev']

const child = spawn(command, args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

installShutdownSignalHandlers(process, (signal) => {
  console.log(`\n[dev-launcher] ${signal} 수신 — 개발 프로세스 트리를 종료합니다.`)
  stopChildProcess(child)
  process.exit(signal === 'SIGINT' ? 130 : 143)
})

child.on('error', (error) => {
  console.error('[dev-launcher] 개발 모드 실행 실패:', error.message)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})

process.on('exit', () => {
  if (child.exitCode === null) stopChildProcess(child)
})
