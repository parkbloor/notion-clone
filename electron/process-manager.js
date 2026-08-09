'use strict'

const { spawnSync } = require('child_process')

// Windows에서는 부모를 먼저 종료하면 PyInstaller 자식이 고아로 남을 수 있으므로
// taskkill /T가 끝날 때까지 기다린 뒤, 실패한 경우에만 직접 종료한다.
// Python으로 치면: def stop_child_process(child): taskkill_tree(child.pid) or child.kill()
function stopChildProcess(child, options = {}) {
  if (!child) return

  const platform = options.platform || process.platform
  const runTaskkill = options.runTaskkill || spawnSync
  const pid = child.pid

  if (platform === 'win32' && Number.isInteger(pid) && pid > 0) {
    const result = runTaskkill(
      'taskkill.exe',
      ['/pid', String(pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' }
    )
    if (!result.error && result.status === 0) return
  }

  try {
    child.kill()
  } catch {}
}

// Ctrl+C와 상위 프로세스 종료 신호를 앱의 정상 종료 경로로 한 번만 전달한다.
// Python으로 치면: signal.signal(SIGINT, lambda signum, frame: shutdown_once(signum))
function installShutdownSignalHandlers(processTarget, shutdown) {
  let shutdownStarted = false
  for (const signal of ['SIGINT', 'SIGTERM']) {
    processTarget.on(signal, () => {
      if (shutdownStarted) return
      shutdownStarted = true
      shutdown(signal)
    })
  }
}

module.exports = { installShutdownSignalHandlers, stopChildProcess }
