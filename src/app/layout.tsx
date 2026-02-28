// =============================================
// src/app/layout.tsx
// 역할: Next.js 루트 레이아웃 — 전역 폰트 로딩 및 메타데이터 설정
// next/font/google: 빌드 타임에 폰트 다운로드 → CSS 변수로 주입
// 한국어 폰트(Noto KR, Gowun): globals.css의 @import로 로딩
// Python으로 치면: Flask app.before_request에서 전역 설정하는 느낌
// =============================================

import type { Metadata } from "next"
import {
  Geist,
  Geist_Mono,
  Inter,
  Playfair_Display,
  JetBrains_Mono,
} from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"
// KaTeX 수식 렌더링 CSS — MathBlock 전역 스타일
// Python으로 치면: app.add_css('katex/dist/katex.min.css')
import "katex/dist/katex.min.css"

// -----------------------------------------------
// UI 기본 폰트 — 기존 Geist 유지 (앱 UI 전반)
// Python으로 치면: GEIST_FONT = load_font('Geist', variable='--font-geist-sans')
// -----------------------------------------------
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// -----------------------------------------------
// 에디터 폰트 — next/font/google로 CSS 변수 등록
// variable: CSS 변수 이름 → globals.css에서 font-family에 사용
// Python으로 치면: INTER_FONT = load_font('Inter', variable='--font-inter')
// -----------------------------------------------
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",  // 폰트 로딩 전 시스템 폰트로 임시 표시 (레이아웃 시프트 방지)
})

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Notion Clone",
  description: "로컬 마크다운 기반 노션 클론",
}

// -----------------------------------------------
// RootLayout: 모든 페이지를 감싸는 최상위 레이아웃
// className에 폰트 변수들을 모두 등록 → :root에서 CSS 변수로 사용 가능
// Python으로 치면: def render_layout(children): return f'<html class="{fonts}">{children}</html>'
// -----------------------------------------------
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          inter.variable,
          playfairDisplay.variable,
          jetbrainsMono.variable,
          "antialiased",
        ].join(" ")}
      >
        {children}
        {/* API 실패·성공 알림 — 화면 우측 하단에 표시 */}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  )
}
