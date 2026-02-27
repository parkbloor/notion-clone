// =============================================
// electron/main.js
// 역할: Electron 메인 프로세스
//   - Next.js standalone 서버 (utilityProcess) 시작
//   - FastAPI 백엔드 (spawn) 시작
//   - 두 서버 준비 완료 후 BrowserWindow 표시
//   - 앱 종료 시 두 프로세스 정리
//   - Electron 기본 단축키 충돌 방지
// Python으로 치면: class AppManager: start_servers(); open_window()
// =============================================

'use strict'

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  utilityProcess,
} = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const net = require('net')

// ── 개발/프로덕션 모드 판별 ────────────────────────────────
// Python으로 치면: IS_DEV = os.environ.get('NODE_ENV') == 'development'
const isDev = !app.isPackaged

// ── 고정 포트 ───────────────────────────────────────────
// 이미지/비디오 URL이 localhost:8000 으로 저장되어 있으므로 포트 고정 필수
// Python으로 치면: BACKEND_PORT = 8000; NEXT_PORT = 3000
const BACKEND_PORT = 8000
const NEXT_PORT = 3000

// ── 프로세스 핸들 ────────────────────────────────────────
let mainWindow = null
let loadingWindow = null
let backendProcess = null   // spawn() 반환값 (FastAPI)
let nextProcess = null      // utilityProcess.fork() 반환값 (Next.js)
let isQuitting = false      // 이중 종료 방지 플래그


// -----------------------------------------------
// 포트 사용 가능 여부 확인
// 실제로 서버를 열어보고 즉시 닫는 방식으로 확인
// Python으로 치면: def is_port_available(port): socket.bind(port)
// -----------------------------------------------
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}


// -----------------------------------------------
// 서버 HTTP 응답 대기 (폴링)
// 타임아웃까지 500ms 간격으로 재시도
// Python으로 치면: def wait_for_server(url, timeout): while not ready: sleep(0.5)
// -----------------------------------------------
function waitForServer(url, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    function poll() {
      const req = http.get(url, (res) => {
        res.resume() // body 소비 (메모리 누수 방지)
        resolve()
      })
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`서버 시작 타임아웃: ${url}`))
        } else {
          setTimeout(poll, 500)
        }
      })
      req.setTimeout(1000, () => {
        req.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`서버 시작 타임아웃: ${url}`))
        } else {
          setTimeout(poll, 500)
        }
      })
    }
    poll()
  })
}


// -----------------------------------------------
// 모든 자식 프로세스 종료
// Windows에서는 SIGTERM이 무시될 수 있어 kill()을 직접 호출
// Python으로 치면: def kill_all(): backend.terminate(); next_proc.terminate()
// -----------------------------------------------
function killAllProcesses() {
  if (isQuitting) return
  isQuitting = true

  if (backendProcess) {
    try {
      // Windows: process.kill() + taskkill 으로 강제 종료
      backendProcess.kill()
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], { shell: true })
      }
    } catch (_) {}
    backendProcess = null
  }

  if (nextProcess) {
    try {
      nextProcess.kill()
    } catch (_) {}
    nextProcess = null
  }
}


// -----------------------------------------------
// 로딩 창 생성 (서버 시작 대기 중 표시)
// Python으로 치면: class LoadingDialog(Dialog): show()
// -----------------------------------------------
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 개발: electron/ 폴더 직접 참조, 프로덕션: resources/ 폴더
  const loadingPath = isDev
    ? path.join(__dirname, 'loading.html')
    : path.join(process.resourcesPath, 'electron', 'loading.html')

  loadingWindow.loadFile(loadingPath)
  loadingWindow.on('closed', () => { loadingWindow = null })
}


// -----------------------------------------------
// 메인 창 생성 (앱 본체)
// Python으로 치면: class MainWindow(QMainWindow): setup()
// -----------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Notion Clone',
    show: false, // ready-to-show 이벤트 후 표시 (흰 화면 깜빡임 방지)
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,       // Node.js API 렌더러에 비노출 (보안)
      contextIsolation: true,       // preload 와 페이지 컨텍스트 분리 (보안)
      sandbox: false,               // preload에서 require 사용을 위해 false
      preload: isDev
        ? path.join(__dirname, 'preload.js')
        : path.join(process.resourcesPath, 'electron', 'preload.js'),
    },
  })

  // 메뉴바 완전 제거 (앱 자체 UI 사용, Alt 키 메뉴 불필요)
  Menu.setApplicationMenu(null)

  // Next.js 서버로 이동
  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`)

  // ── Electron 기본 단축키 충돌 방지 ──────────────────────
  // before-input-event: 키 입력이 웹 페이지로 전달되기 전에 가로챔
  // Python으로 치면: def on_key_press(e): if e.ctrl and e.key == 'w': e.ignore()
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const ctrl = input.control || input.meta  // Mac 호환 (Cmd 키)

    // ── Ctrl+W: Electron 기본 = 창 닫기 ──────────────────
    // 앱에서 Ctrl+W 사용 가능성 있음 + 실수 종료 방지
    // preventDefault → 창이 닫히지 않고 웹 앱에서 처리
    if (ctrl && input.key.toLowerCase() === 'w') {
      event.preventDefault()
    }

    if (!isDev) {
      // ── 프로덕션 전용 차단 ─────────────────────────────

      // Ctrl+R / F5: 페이지 새로고침
      // → Next.js standalone 서버 재연결이 아닌 강제 새로고침 = 작업 데이터 손실 위험
      if ((ctrl && input.key.toLowerCase() === 'r') || input.key === 'F5') {
        event.preventDefault()
      }

      // F12: Chromium DevTools 열기 → 프로덕션에서 차단
      if (input.key === 'F12') {
        event.preventDefault()
      }

      // Ctrl+Shift+I: DevTools → 프로덕션에서 차단
      if (ctrl && input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault()
      }

      // Ctrl+Shift+J: DevTools 콘솔 → 프로덕션에서 차단
      if (ctrl && input.shift && input.key.toLowerCase() === 'j') {
        event.preventDefault()
      }

    } else {
      // ── 개발 모드: F12 DevTools 토글 ──────────────────
      if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools()
        event.preventDefault()
      }
    }
  })

  // 준비 완료 시 로딩 창 닫고 메인 창 표시
  mainWindow.once('ready-to-show', () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close()
    }
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    killAllProcesses()
    app.quit()
  })
}


// -----------------------------------------------
// FastAPI 백엔드 프로세스 시작
// 개발: python uvicorn, 프로덕션: PyInstaller backend.exe
// Python으로 치면: def start_backend(): subprocess.Popen(['backend.exe'])
// -----------------------------------------------
function startBackend() {
  if (isDev) {
    // 개발 모드: Python uvicorn 직접 실행
    const projectRoot = path.join(__dirname, '..')
    backendProcess = spawn(
      process.platform === 'win32' ? 'python' : 'python3',
      ['-m', 'uvicorn', 'backend.main:app',
       '--port', String(BACKEND_PORT),
       '--host', '127.0.0.1'],
      { cwd: projectRoot, stdio: 'pipe', shell: true }
    )
  } else {
    // 프로덕션: PyInstaller 번들 backend.exe
    const backendExe = path.join(process.resourcesPath, 'backend', 'backend.exe')
    backendProcess = spawn(backendExe, [], {
      cwd: path.dirname(backendExe),
      stdio: 'pipe',
    })
  }

  // 로그 파이프 (개발 시 터미널에서 확인)
  backendProcess.stdout?.on('data', (d) => {
    console.log('[backend]', d.toString().trimEnd())
  })
  backendProcess.stderr?.on('data', (d) => {
    console.error('[backend]', d.toString().trimEnd())
  })
  backendProcess.on('exit', (code) => {
    if (!isQuitting) {
      console.error(`[backend] 예기치 않게 종료됨 (code: ${code})`)
    }
  })
}


// -----------------------------------------------
// Next.js standalone 서버 시작
// utilityProcess.fork: Electron 내장 Node.js로 실행 (별도 node.exe 불필요)
// Python으로 치면: def start_nextjs(): fork_process('server.js')
// -----------------------------------------------
function startNextJs() {
  if (isDev) {
    // 개발 모드: npm run dev:next 로 이미 실행 중 → 여기서는 스킵
    return
  }

  const serverJs = path.join(process.resourcesPath, 'next', 'server.js')

  // utilityProcess.fork: Electron 21+ 내장 기능
  // 별도 node.exe 없이 Electron의 Node.js 런타임으로 server.js 실행
  // Python으로 치면: multiprocessing.Process(target=run_server)
  nextProcess = utilityProcess.fork(serverJs, [], {
    cwd: path.join(process.resourcesPath, 'next'),
    env: {
      ...process.env,
      PORT: String(NEXT_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  })

  nextProcess.stdout?.on('data', (d) => {
    console.log('[next]', d.toString().trimEnd())
  })
  nextProcess.stderr?.on('data', (d) => {
    console.error('[next]', d.toString().trimEnd())
  })
  nextProcess.on('exit', (code) => {
    if (!isQuitting) {
      console.error(`[next] 예기치 않게 종료됨 (code: ${code})`)
    }
  })
}


// -----------------------------------------------
// IPC 핸들러 등록
// Python으로 치면: @app.on('ipc_message') def handle(msg): ...
// -----------------------------------------------
ipcMain.handle('get-version', () => app.getVersion())


// -----------------------------------------------
// 앱 시작 진입점
// Python으로 치면: if __name__ == '__main__': main()
// -----------------------------------------------
app.whenReady().then(async () => {
  // ── 1단계: 포트 사용 가능 여부 확인 ─────────────────────
  const [backendPortOk, nextPortOk] = await Promise.all([
    isPortAvailable(BACKEND_PORT),
    isPortAvailable(NEXT_PORT),
  ])

  if (!backendPortOk || !nextPortOk) {
    const taken = []
    if (!backendPortOk) taken.push(`  · 포트 ${BACKEND_PORT} — 백엔드 서버`)
    if (!nextPortOk)    taken.push(`  · 포트 ${NEXT_PORT} — 앱 서버`)

    dialog.showErrorBox(
      '포트 충돌 — Notion Clone을 시작할 수 없습니다',
      `다음 포트가 이미 다른 프로그램에 의해 사용 중입니다:\n\n`
      + taken.join('\n')
      + `\n\n해당 포트를 사용 중인 프로그램을 종료한 후 다시 실행해주세요.`
    )
    app.quit()
    return
  }

  // ── 2단계: 로딩 화면 표시 ───────────────────────────────
  createLoadingWindow()

  // ── 3단계: 두 서버 프로세스 시작 ────────────────────────
  startBackend()
  startNextJs()

  // ── 4단계: 두 서버가 HTTP 응답할 때까지 대기 ────────────
  try {
    // 개발: Next.js는 이미 실행 중이므로 백엔드만 대기
    // 프로덕션: 둘 다 대기
    const waitBackend = waitForServer(
      `http://127.0.0.1:${BACKEND_PORT}/api/pages`, 40000
    )
    const waitNext = isDev
      ? Promise.resolve()
      : waitForServer(`http://127.0.0.1:${NEXT_PORT}`, 40000)

    await Promise.all([waitBackend, waitNext])

    // ── 5단계: 메인 창 표시 ───────────────────────────────
    createMainWindow()

  } catch (err) {
    killAllProcesses()
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close()
    }
    dialog.showErrorBox(
      '서버 시작 실패',
      `앱을 시작하는 데 실패했습니다.\n\n${err.message}\n\n`
      + `앱을 다시 실행해 주세요. 문제가 계속되면 PC를 재시작해보세요.`
    )
    app.quit()
  }
})


// ── 앱 종료 이벤트 처리 ──────────────────────────────────
// Python으로 치면: atexit.register(kill_all)
app.on('before-quit', killAllProcesses)

app.on('window-all-closed', () => {
  // macOS는 모든 창이 닫혀도 앱이 살아있는 관례 → 여기서는 무시
  // Windows/Linux: 모든 창 닫히면 앱 종료
  if (process.platform !== 'darwin') {
    killAllProcesses()
    app.quit()
  }
})

// macOS: Dock 아이콘 클릭 시 창 재생성
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
    createMainWindow()
  }
})
