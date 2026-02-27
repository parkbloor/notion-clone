// =============================================
// scripts/build-electron.js
// 역할: electron-builder 실행 전 코드 서명 비활성화 환경변수 설정
// 개인용 빌드는 코드 서명 인증서가 없으므로 winCodeSign 다운로드 건너뜀
// Python으로 치면: os.environ['CSC_IDENTITY_AUTO_DISCOVERY'] = 'false'; run('electron-builder')
// =============================================

'use strict'

const { execSync } = require('child_process')

// 코드 서명 자동 탐색 비활성화
// → winCodeSign 다운로드 및 심볼릭 링크 생성 오류 방지
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
process.env.WIN_CSC_LINK = ''

console.log('🔧 코드 서명 비활성화 (개인용 빌드)')
console.log('📦 electron-builder 실행 중...\n')

try {
  execSync('npx electron-builder', {
    stdio: 'inherit',
    env: process.env,
  })
} catch (err) {
  process.exit(err.status ?? 1)
}
