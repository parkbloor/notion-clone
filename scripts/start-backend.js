// venv Python으로 FastAPI 백엔드 실행 스크립트
// Python으로 치면: subprocess.run(['.venv/Scripts/python.exe', '-m', 'uvicorn', ...])
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
// Windows: .venv/Scripts/python.exe / macOS·Linux: .venv/bin/python
// Python으로 치면: sys.executable
const python = process.platform === 'win32'
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python')

// 로컬 데스크톱 앱의 데이터 API이므로 외부 LAN 인터페이스에 노출하지 않는다.
const proc = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'], {
  stdio: 'inherit',
  cwd: root,
})

// 시그널 종료(code === null) 시 1로 처리해 false success 방지
proc.on('exit', (code) => process.exit(code ?? 1))

// python.exe 없음(ENOENT) 등 spawn 자체 실패 처리
proc.on('error', (err) => {
  console.error('백엔드 실행 실패:', err.message)
  process.exit(1)
})

// 부모 프로세스 종료 시 자식(uvicorn)에게 시그널 전달 → 고아 프로세스 방지
// Python으로 치면: signal.signal(signal.SIGTERM, lambda *_: proc.terminate())
process.on('SIGTERM', () => proc.kill('SIGTERM'))
process.on('SIGINT', () => proc.kill('SIGTERM'))
