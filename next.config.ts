import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Electron 패키징을 위한 standalone 출력 모드
  // 자체 포함 Node.js 서버를 .next/standalone/ 에 생성
  output: 'standalone',
};

export default nextConfig;
