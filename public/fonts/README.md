# 커스텀 폰트 폴더

이 폴더에 로컬 폰트 파일(.woff2, .woff, .ttf)을 추가할 수 있습니다.

## 폰트 추가 방법

1. 이 폴더에 폰트 파일 복사 (예: `MyFont.woff2`)
2. `src/lib/fonts.ts`의 `FONT_PRESETS` 배열에 항목 추가:
   ```ts
   {
     id: 'my-font',
     label: '내 폰트',
     family: "'MyFont', sans-serif",
     category: 'sans',
   }
   ```
3. `src/app/globals.css` 상단에 @font-face 추가:
   ```css
   @font-face {
     font-family: 'MyFont';
     src: url('/fonts/MyFont.woff2') format('woff2');
     font-weight: 400;
     font-style: normal;
     font-display: swap;
   }
   ```

## 현재 등록된 폰트 (src/lib/fonts.ts 참고)

| ID | 이름 | 출처 |
|----|------|------|
| system | 시스템 기본 | OS 내장 |
| inter | Inter | Google Fonts |
| noto-sans | Noto Sans KR | Google Fonts |
| noto-serif | Noto Serif KR | Google Fonts |
| gowun | Gowun Dodum | Google Fonts |
| playfair | Playfair Display | Google Fonts |
| mono | JetBrains Mono | Google Fonts |
