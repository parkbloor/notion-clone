# Notion Clone

Notion에서 영감을 받은 **블록 기반 노트 앱**입니다.
Next.js 14 App Router + Tiptap v3 + FastAPI(Python) 백엔드로 구성되며,
Electron으로 패키징하여 Windows 데스크톱 앱으로 배포할 수 있습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **블록 편집기** | 단락·제목·목록·코드·이미지·비디오·토글 등 다양한 블록 지원 |
| **슬래시 커맨드** | `/` 입력으로 블록 타입 빠른 선택 |
| **@멘션 / [[링크]]** | 다른 페이지 멘션 및 페이지 간 링크 삽입 |
| **백링크 패널** | 현재 페이지를 참조하는 다른 페이지 목록 표시 |
| **드래그 앤 드롭** | dnd-kit 기반 블록 순서 변경 |
| **카테고리** | 페이지를 폴더처럼 묶어 관리 |
| **커버 이미지** | URL·그라디언트·단색 커버 지원 |
| **PDF 내보내기** | @media print 기반 인쇄 최적화 |
| **Markdown 내보내기/가져오기** | 마크다운 변환 |
| **전문 검색** | 제목·내용 키워드 검색 |
| **다크 모드** | 시스템 테마 자동 적용 |

### 플러그인

| 플러그인 | 설명 |
|---------|------|
| **칸반 보드** | 드래그 앤 드롭 칸반 블록 |
| **캘린더** | 월간 달력 보기 블록 |
| **콜아웃(Admonition)** | 팁·정보·경고·위험 강조 블록 |
| **Excalidraw** | 손그림 다이어그램 블록 |
| **무한 캔버스** | 노드·엣지 다이어그램 블록 |
| **단어 수 표시** | 에디터 하단 글자/단어 수 |
| **집중 모드** | Ctrl+Shift+F, 방해 요소 숨기기 |
| **포모도로 타이머** | 플로팅 포모도로 위젯 |
| **목차 패널** | 오른쪽 고정 TOC 패널 |
| **일간 노트** | Ctrl+Alt+D, 오늘 날짜 노트 자동 생성 |

---

## 기술 스택

- **Frontend**: Next.js 14 (App Router), Tiptap v3, Tailwind CSS v4, Zustand
- **Backend**: FastAPI (Python), 로컬 JSON 파일 기반 저장
- **Packaging**: Electron + electron-builder (NSIS 인스톨러)

---

## 실행 방법

### 개발 서버

```bash
# 의존성 설치
npm install

# 백엔드 실행 (새 터미널)
cd backend
pip install fastapi uvicorn python-multipart
python main.py

# 프론트엔드 개발 서버
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

### 빌드 (Windows 실행 파일)

```bash
# 전체 빌드 (Next.js + PyInstaller + Electron)
npm run build:all
```

출력: `dist-electron/Notion Clone Setup x.x.x.exe`

> **요구 사항**: Node.js 18+, Python 3.11+, PyInstaller (`pip install pyinstaller`)

---

## 폴더 구조

```
notion-clone/
├── src/
│   ├── app/              # Next.js App Router 진입점
│   ├── components/
│   │   ├── editor/       # 블록 에디터 컴포넌트
│   │   ├── sidebar/      # 사이드바
│   │   └── settings/     # 설정 탭
│   ├── store/            # Zustand 스토어
│   └── types/            # 타입 정의
├── backend/
│   ├── main.py           # FastAPI 앱 진입점
│   ├── core.py           # 공유 모델·헬퍼·보안 검증
│   ├── routers/          # API 라우터 (pages, categories, search 등)
│   └── backend.spec      # PyInstaller 번들 설정
├── vault/                # 노트 데이터 (로컬 JSON 파일)
│   ├── _index.json       # 페이지 목록·카테고리 인덱스
│   └── {페이지폴더}/
│       ├── content.json  # 페이지 내용
│       └── images/       # 업로드된 이미지
├── scripts/
│   ├── copy-next-static.js  # Next.js standalone 후처리
│   └── build-electron.js    # Electron 빌드 래퍼
└── public/               # 정적 파일
```

---

## 라이선스

MIT
