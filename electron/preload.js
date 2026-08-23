// =============================================
// electron/preload.js
// 역할: Renderer 프로세스와 Main 프로세스 사이의 보안 브릿지
// contextIsolation=true 환경에서 필요한 API만 선택적으로 노출
// Python으로 치면: class SecureBridge: 허용된 메서드만 외부에 공개
// =============================================

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// -----------------------------------------------
// window.electronAPI 로 안전하게 노출
// 현재는 앱이 HTTP localhost 통신만 사용하므로 최소 노출
// Python으로 치면: electronAPI = {'getVersion': lambda: version}
// -----------------------------------------------
contextBridge.exposeInMainWorld('electronAPI', {
  // 앱 버전 (설정 화면 등에서 사용 가능)
  // Python으로 치면: def get_version(): return pkg_version
  getVersion: () => ipcRenderer.invoke('get-version'),
  getSecret: (key) => ipcRenderer.invoke('secret:get', key),
  setSecret: (key, value) => ipcRenderer.invoke('secret:set', key, value),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  // 검증은 메인 프로세스에서 다시 수행하고 렌더러에는 로컬 경로를 노출하지 않는다.
  startImageDrag: (payload) => ipcRenderer.send('start-image-drag', payload),
})
