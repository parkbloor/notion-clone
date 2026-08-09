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
  nativeImage,
  screen,
  shell,
  utilityProcess,
} = require('electron')
const { spawn } = require('child_process')
const { installShutdownSignalHandlers, stopChildProcess } = require('./process-manager')
const path = require('path')
const http = require('http')
const net = require('net')
const fs = require('fs')

// -----------------------------------------------
// 창 크기/위치 영속 저장 헬퍼
// Python으로 치면: def load_window_state(): json.load(open(config_path))
// -----------------------------------------------
const WIN_STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json')

/** 저장된 창 상태 읽기 (없으면 기본값 반환) */
function loadWindowState() {
  try {
    const raw = fs.readFileSync(WIN_STATE_FILE(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { width: 1400, height: 900, x: undefined, y: undefined, isMaximized: false }
  }
}

/** 현재 연결된 화면에서 보이는 위치·크기로 창 상태를 보정한다. */
function normalizeWindowState(state) {
  const primary = screen.getPrimaryDisplay().workArea
  const width = Math.min(Math.max(state.width || 1400, 800), primary.width)
  const height = Math.min(Math.max(state.height || 900, 600), primary.height)
  const hasVisibleArea = Number.isFinite(state.x) && Number.isFinite(state.y)
    && screen.getAllDisplays().some(({ workArea }) => (
      state.x < workArea.x + workArea.width - 50
      && state.x + width > workArea.x + 50
      && state.y < workArea.y + workArea.height - 50
      && state.y + height > workArea.y + 50
    ))

  return {
    width,
    height,
    x: hasVisibleArea ? state.x : undefined,
    y: hasVisibleArea ? state.y : undefined,
    isMaximized: Boolean(state.isMaximized),
  }
}

/** 창 상태 파일에 쓰기 */
function saveWindowState(win) {
  if (win.isMaximized()) {
    // 최대화 상태: 크기/위치는 저장하지 않고 isMaximized만 기록
    const prev = loadWindowState()
    const data = { ...prev, isMaximized: true }
    fs.writeFileSync(WIN_STATE_FILE(), JSON.stringify(data), 'utf-8')
  } else {
    const bounds = win.getBounds()  // { x, y, width, height }
    const data = { ...bounds, isMaximized: false }
    fs.writeFileSync(WIN_STATE_FILE(), JSON.stringify(data), 'utf-8')
  }
}

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
      // req.destroy() 호출 시 'error' 이벤트도 함께 발생하므로
      // handled 플래그로 콜백이 두 번 실행되지 않도록 보호
      // Python으로 치면: handled = False; def guard(): nonlocal handled; if handled: return; handled = True
      let handled = false
      function once(fn) {
        return (...args) => {
          if (handled) return
          handled = true
          fn(...args)
        }
      }

      const req = http.get(url, once((res) => {
        res.resume() // body 소비 (메모리 누수 방지)
        resolve()
      }))
      req.on('error', once(() => {
        if (Date.now() >= deadline) {
          reject(new Error(`서버 시작 타임아웃: ${url}`))
        } else {
          setTimeout(poll, 500)
        }
      }))
      req.setTimeout(1000, once(() => {
        req.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`서버 시작 타임아웃: ${url}`))
        } else {
          setTimeout(poll, 500)
        }
      }))
    }
    poll()
  })
}


// -----------------------------------------------
// 모든 자식 프로세스 종료
// Windows에서는 PyInstaller 자식까지 프로세스 트리 단위로 종료
// Python으로 치면: def kill_all(): backend.terminate(); next_proc.terminate()
// -----------------------------------------------
function killAllProcesses() {
  if (isQuitting) return
  isQuitting = true

  if (backendProcess) {
    stopChildProcess(backendProcess)
    backendProcess = null
  }

  if (nextProcess) {
    try {
      nextProcess.kill()
    } catch {}
    nextProcess = null
  }
}

// 개발 배치 창의 Ctrl+C 또는 concurrently의 SIGTERM도 Electron 정상 종료로 연결한다.
// Windows 콘솔 신호로 프로세스가 바로 끝나 before-quit가 누락되는 것을 방지한다.
// Python으로 치면: signal.signal(SIGINT, lambda *_: graceful_shutdown())
installShutdownSignalHandlers(process, (signal) => {
  console.log(`[electron] ${signal} 수신 — 개발 서버를 종료합니다.`)
  cleanupImageDragTemp()
  killAllProcesses()
  if (app.isReady()) {
    app.quit()
  } else {
    app.exit(0)
  }
})


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
  // 이전 창 상태 복원 (없으면 기본값 사용)
  // Python으로 치면: state = load_window_state() or defaults
  const state = normalizeWindowState(loadWindowState())

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Notion Clone',
    show: false, // ready-to-show 이벤트 후 표시 (흰 화면 깜빡임 방지)
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,       // Node.js API 렌더러에 비노출 (보안)
      contextIsolation: true,       // preload 와 페이지 컨텍스트 분리 (보안)
      // sandbox: preload에서 require('electron')만 사용하므로 기본값(true) 유지
      preload: isDev
        ? path.join(__dirname, 'preload.js')
        : path.join(process.resourcesPath, 'electron', 'preload.js'),
    },
  })

  // 최대화 상태였으면 복원
  if (state.isMaximized) mainWindow.maximize()

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

  // 창 크기/위치 변경 시 저장 (최대화 해제 후 normal 상태 캡처)
  // Python으로 치면: win.bind('<Configure>', save_state)
  mainWindow.on('resize', () => saveWindowState(mainWindow))
  mainWindow.on('move', () => saveWindowState(mainWindow))
  mainWindow.on('maximize', () => saveWindowState(mainWindow))
  mainWindow.on('unmaximize', () => saveWindowState(mainWindow))

  mainWindow.on('closed', () => {
    // app.quit()은 window-all-closed 핸들러에 위임
    // 여기서 호출하면 before-quit → window-all-closed 이벤트 체인에서
    // killAllProcesses() 와 app.quit() 이 중복 실행됨
    mainWindow = null
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
    const pythonPath = process.platform === 'win32'
      ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(projectRoot, '.venv', 'bin', 'python')
    backendProcess = spawn(
      pythonPath,
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

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'vault folder select',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('open-external-url', async (_event, rawUrl) => {
  const parsed = new URL(String(rawUrl || ''))
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('허용되지 않은 외부 링크 프로토콜입니다')
  }
  await shell.openExternal(parsed.toString())
  return true
})

// -----------------------------------------------
// 이미지 원본을 Windows 탐색기로 끌어내기
// 렌더러가 임의 경로를 지정하지 못하도록 활성 볼트 URL만 경로로 변환한다.
// Python으로 치면: def start_image_drag(url, name): validate(url); shell.start_drag(file)
// -----------------------------------------------
function resolveVaultImageUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || ''))
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error('로컬 이미지 URL이 아닙니다')
  }
  if (parsed.port && parsed.port !== String(BACKEND_PORT)) {
    throw new Error('허용되지 않은 이미지 포트입니다')
  }
  const prefix = '/static/'
  const decodedPath = decodeURIComponent(parsed.pathname)
  if (!decodedPath.startsWith(prefix)) throw new Error('정적 이미지 URL이 아닙니다')
  const parts = decodedPath.slice(prefix.length).split('/').filter(Boolean)
  if (parts.length < 3 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('허용되지 않은 이미지 경로입니다')
  }

  const configPath = isDev
    ? path.join(__dirname, '..', 'vault_config.json')
    : path.join(app.getPath('appData'), 'NotionClone', 'vault_config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const vaultRoot = path.resolve(String(config.vaults_root || ''))
  const vaultDir = path.resolve(vaultRoot, String(config.current_vault || ''))
  const vaultRelative = path.relative(vaultRoot, vaultDir)
  if (!vaultRelative || vaultRelative.startsWith('..') || path.isAbsolute(vaultRelative)) {
    throw new Error('활성 볼트 설정이 올바르지 않습니다')
  }
  const filePath = path.resolve(vaultDir, ...parts)
  const relative = path.relative(vaultDir, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('활성 볼트 밖의 파일입니다')
  }

  const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'])
  const extension = path.extname(filePath).toLowerCase()
  const uuidStem = path.basename(filePath, extension)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (path.basename(path.dirname(filePath)).toLowerCase() !== 'images'
      || !allowedExts.has(extension)
      || !uuidPattern.test(uuidStem)
      || !fs.statSync(filePath).isFile()) {
    throw new Error('검증된 원본 이미지 파일이 아닙니다')
  }
  return filePath
}

function getImageDragRoot() {
  return path.join(app.getPath('temp'), 'NotionCloneImageDrag')
}

function cleanupImageDragTemp() {
  const dragRoot = getImageDragRoot()
  try {
    fs.rmSync(dragRoot, { recursive: true, force: true })
  } catch (error) {
    // 임시파일 정리 실패가 앱 시작·종료를 막아서는 안 된다.
    console.error('[image-drag-cleanup]', error instanceof Error ? error.message : error)
  }
}

function createNamedDragCopy(sourcePath, requestedName) {
  const extension = path.extname(sourcePath).toLowerCase()
  let safeName = path.basename(String(requestedName || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  safeName = safeName.replace(/[. ]+$/g, '').slice(0, 160)
  if (!safeName || path.extname(safeName).toLowerCase() !== extension) {
    safeName = `${path.basename(safeName, path.extname(safeName)) || 'image'}${extension}`
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`

  const dragRoot = getImageDragRoot()
  const dragDir = path.join(dragRoot, path.basename(sourcePath, extension))
  const dragPath = path.join(dragDir, safeName)
  // 같은 원본의 표시 이름이 바뀌어도 이전 이름의 복사본이 누적되지 않게 한다.
  fs.rmSync(dragDir, { recursive: true, force: true })
  fs.mkdirSync(dragDir, { recursive: true })
  fs.copyFileSync(sourcePath, dragPath)
  return dragPath
}

ipcMain.on('start-image-drag', (event, payload) => {
  try {
    const sourcePath = resolveVaultImageUrl(payload?.url)
    const dragPath = createNamedDragCopy(sourcePath, payload?.name)
    let icon = nativeImage.createFromPath(sourcePath)
    if (!icon.isEmpty()) icon = icon.resize({ width: 32, height: 32 })
    event.sender.startDrag({ file: dragPath, icon: icon.isEmpty() ? sourcePath : icon })
  } catch (error) {
    console.error('[image-drag]', error instanceof Error ? error.message : error)
  }
})


// -----------------------------------------------
// 앱 시작 진입점
// Python으로 치면: if __name__ == '__main__': main()
// -----------------------------------------------
app.whenReady().then(async () => {
  // 이전 비정상 종료에서 남은 원본 드래그 임시 복사본을 먼저 정리한다.
  cleanupImageDragTemp()
  // ── 1단계: 포트 사용 가능 여부 확인 ─────────────────────
  // 개발 모드에서 Next.js는 이미 외부에서 실행 중이므로 체크 제외
  const portsToCheck = isDev
    ? [isPortAvailable(BACKEND_PORT)]
    : [isPortAvailable(BACKEND_PORT), isPortAvailable(NEXT_PORT)]
  const portResults = await Promise.all(portsToCheck)
  const backendPortOk = portResults[0]
  const nextPortOk    = isDev ? true : portResults[1]

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
app.on('before-quit', () => {
  cleanupImageDragTemp()
  killAllProcesses()
})

// force-kill(SIGKILL 등) 대비 동기 최후 정리
// before-quit가 발화하지 않는 비정상 종료 경로에서 자식 프로세스 고아 방지
// Python으로 치면: atexit.register(sync_kill_all)
process.on('exit', () => {
  cleanupImageDragTemp()
  if (backendProcess) stopChildProcess(backendProcess)
  if (nextProcess) { try { nextProcess.kill() } catch {} }
})

app.on('window-all-closed', () => {
  // macOS는 모든 창이 닫혀도 앱이 살아있는 관례 → 여기서는 무시
  // Windows/Linux: 모든 창 닫히면 앱 종료
  if (process.platform !== 'darwin') {
    killAllProcesses()
    app.quit()
  }
})

// macOS: Dock 아이콘 클릭 시 창 재생성
// 서버가 살아있을 때만 창을 여는지 확인 후 생성
// Python으로 치면: if servers_alive(): open_window()
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
    try {
      await Promise.all([
        waitForServer(`http://127.0.0.1:${BACKEND_PORT}/api/pages`, 2000),
        waitForServer(`http://127.0.0.1:${NEXT_PORT}`, 2000),
      ])
      createMainWindow()
    } catch {
      dialog.showErrorBox(
        '서버가 응답하지 않습니다',
        '앱 서버가 실행 중이 아닙니다. 앱을 다시 시작해주세요.'
      )
      app.quit()
    }
  }
})
