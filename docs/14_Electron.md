# 14. Electron — 데스크톱 앱 패키징

> Next.js standalone + FastAPI 백엔드를 하나의 Electron 앱으로 묶어 Windows NSIS 인스톨러 생성.
> 출력: `dist-electron/Notion Clone Setup 0.1.0.exe` (현재 빌드 약 119MB)
> 앱 데이터: `%APPDATA%\NotionClone\vault\기본\` (기본 활성 vault)

---

## [electron/main.js](../electron/main.js)

**역할:** Electron 메인 프로세스. Next.js 서버 + FastAPI 백엔드 실행 후 BrowserWindow 표시.

### 주요 상수

| 상수 | 값 | 설명 |
|------|-----|------|
| `isDev` | `!app.isPackaged` | 개발/프로덕션 모드 판별 |
| `BACKEND_PORT` | `8000` | FastAPI 고정 포트 (이미지 URL 저장값과 일치해야 함) |
| `NEXT_PORT` | `3000` | Next.js 고정 포트 |

### 프로세스 핸들

| 변수 | 설명 |
|------|------|
| `mainWindow` | 앱 본체 BrowserWindow |
| `loadingWindow` | 서버 시작 대기 중 표시하는 스플래시 창 |
| `backendProcess` | `spawn()` FastAPI 프로세스 핸들 |
| `nextProcess` | `utilityProcess.fork()` Next.js 프로세스 핸들 |
| `isQuitting` | 이중 종료 방지 플래그 |

### 주요 함수

| 함수 | 설명 |
|------|------|
| `isPortAvailable(port)` | 포트 가용 여부 확인 (`net.createServer()` 즉시 열고 닫음) |
| `waitForServer(url, timeoutMs=40000)` | 500ms 간격 HTTP 폴링. 타임아웃 시 reject |
| `killAllProcesses()` | 모든 자식 프로세스 종료. Windows는 `taskkill /f /t`로 강제 종료 |
| `createLoadingWindow()` | 로딩 스플래시 창 (380×260, frameless, alwaysOnTop) |
| `createMainWindow()` | 메인 앱 창 (1400×900, min 800×600, menubar 제거) |
| `normalizeWindowState(state)` | 분리된 모니터의 화면 밖 좌표를 기본 위치로 보정 |

### 앱 시작 순서

1. `createLoadingWindow()` — 스플래시 표시
2. `backendProcess` — `backend.exe` (프로덕션) 또는 프로젝트 `.venv`의 `uvicorn` (개발) `spawn()`
3. `nextProcess` — 프로덕션에서만 `server.js`를 `utilityProcess.fork()`; 개발 Next 서버는 npm 스크립트가 시작
4. `waitForServer(:8000)` + `waitForServer(:3000)` 병렬 대기
5. `createMainWindow()` → `loadURL('http://localhost:3000')`
6. `loadingWindow.close()`

### Electron 기본 단축키 차단

| 단축키 | 이유 |
|--------|------|
| `Ctrl+W` | Electron 기본 = 창 닫기 → 앱 탭 닫기로 대체 |
| `Ctrl+R` / `F5` | 프로덕션에서 강제 새로고침 = 데이터 손실 위험 |
| `Ctrl+Shift+I` / `F12` | 프로덕션에서 개발자 도구 차단 |
| `Ctrl+Shift+J` | 프로덕션에서 콘솔 차단 |

### IPC 핸들러

| 채널 | 설명 |
|------|------|
| `get-version` | `app.getVersion()` 반환 |
| `select-folder` | 네이티브 폴더 선택 다이얼로그 → 선택 경로 또는 `null` 반환 |

---

## [electron/preload.js](../electron/preload.js)

**역할:** Renderer와 Main 프로세스 사이의 보안 브릿지. `contextIsolation=true` 환경에서 필요한 API만 선택 노출.

### 노출 API

```javascript
window.electronAPI = {
  getVersion: () => ipcRenderer.invoke('get-version'),
  selectFolder: () => ipcRenderer.invoke('select-folder')
}
```

현재는 앱이 HTTP localhost 통신만 사용하므로 최소 노출. 추가 기능 필요 시 이 파일에서 확장.

### 개발 실행

`npm run electron:dev`는 Next 개발 서버만 외부에서 시작한다. Electron 메인 프로세스가 8000 포트가 비어 있는지 확인한 뒤 프로젝트 `.venv`로 FastAPI를 시작하므로, 별도로 `dev:api`를 함께 실행하면 안 된다.

---

## [electron/loading.html](../electron/loading.html)

**역할:** 서버 시작 대기 중 표시하는 스플래시 화면. 정적 HTML/CSS 단독 파일.

---

## 빌드 스크립트 (package.json)

| 스크립트 | 설명 |
|----------|------|
| `npm run build:next` | Next.js standalone 빌드 + 정적 파일 복사 |
| `npm run build:backend` | PyInstaller로 `backend.exe` 생성 |
| `npm run build:electron` | `electron-builder` NSIS 인스톨러 생성 |
| `npm run build:all` | 위 3단계 순서대로 실행 |

### 빌드 검증 기록 (2026-07-17)

- `npm run build:all` 전체 단계 완료
- 설치 파일: `dist-electron/Notion Clone Setup 0.1.0.exe`
- 파일 크기: 124,766,756 bytes (약 118.99MB)
- SHA-256: `4334743EDB49047BCEB0C3ABDE00D61354B9DA131D1F691B6D013413A5BFBECF`
- `win-unpacked/Notion Clone.exe` 실행 후 백엔드 `:8000`과 프론트엔드 `:3000` 응답이 모두 HTTP 200인지 확인
- 개인용 서명되지 않은 빌드이므로 다른 PC에서는 Windows SmartScreen 경고가 표시될 수 있음

### PyInstaller 핵심 규칙

- `backend/main.py` 하단에 `if __name__ == '__main__': uvicorn.run(...)` 필수
- `backend.spec` `hiddenimports`: `backend.core`, `backend.routers.X` 형태 (접두사 `backend.` 필수)
- 새 라우터 추가 시 `backend.spec` hiddenimports에 반드시 추가
- Windows Developer Mode ON 필요 (심볼릭 링크 생성)
