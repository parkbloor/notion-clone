import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === 'development'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http://127.0.0.1:8000 https:",
  "media-src 'self' blob: http://127.0.0.1:8000",
  "connect-src 'self' http://127.0.0.1:8000 ws://localhost:3000 ws://127.0.0.1:3000",
  "font-src 'self' data:",
  "frame-src https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Turbopack이 src/app을 별도 프로젝트로 오인하지 않도록 패키지 루트를 명시한다.
  turbopack: {
    root: process.cwd(),
  },
  // localhost로 실행한 개발 서버에 127.0.0.1에서 접속할 때 HMR 자원을 허용한다.
  allowedDevOrigins: ['127.0.0.1'],
  // Electron 패키징을 위한 standalone 출력 모드
  // 자체 포함 Node.js 서버를 .next/standalone/ 에 생성
  output: 'standalone',
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
};

export default nextConfig;
