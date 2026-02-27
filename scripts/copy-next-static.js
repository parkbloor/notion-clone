// =============================================
// scripts/copy-next-static.js
// 역할: Next.js 빌드 후처리 — standalone에 정적 파일 복사
// next build 후 자동 실행 (package.json build:next 스크립트에서 호출)
//
// Next.js standalone 모드는 정적 파일을 자동으로 복사하지 않음:
//   .next/static/       → .next/standalone/.next/static/  (필수)
//   public/             → .next/standalone/public/         (있는 경우)
// =============================================

'use strict'

const fs = require('fs')
const path = require('path')

// 프로젝트 루트 (scripts/ 의 상위)
const ROOT = path.join(__dirname, '..')

// ── 재귀 복사 헬퍼 ────────────────────────────────────────
// Python으로 치면: shutil.copytree(src, dst, dirs_exist_ok=True)
function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.log(`  [스킵] 없음: ${path.relative(ROOT, src)}`)
    return
  }
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

// ── 1. .next/static → .next/standalone/.next/static ─────
const staticSrc = path.join(ROOT, '.next', 'static')
const staticDst = path.join(ROOT, '.next', 'standalone', '.next', 'static')
console.log('📦 .next/static 복사 중...')
copyDir(staticSrc, staticDst)
console.log('  ✅ 완료:', path.relative(ROOT, staticDst))

// ── 2. public/ → .next/standalone/public/ ───────────────
const publicSrc = path.join(ROOT, 'public')
const publicDst = path.join(ROOT, '.next', 'standalone', 'public')
if (fs.existsSync(publicSrc)) {
  console.log('📦 public/ 복사 중...')
  copyDir(publicSrc, publicDst)
  console.log('  ✅ 완료:', path.relative(ROOT, publicDst))
} else {
  console.log('  [스킵] public/ 폴더 없음')
}

console.log('\n✅ Next.js standalone 빌드 후처리 완료')
