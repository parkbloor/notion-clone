// venv Python으로 FastAPI 백엔드 실행 스크립트
// Python으로 치면: subprocess.run(['.venv/Scripts/python.exe', '-m', 'uvicorn', ...])
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const python = path.join(root, '.venv', 'Scripts', 'python.exe')

const proc = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '0.0.0.0', '--port', '8000'], {
  stdio: 'inherit',
  cwd: root,
})

proc.on('exit', (code) => process.exit(code))
