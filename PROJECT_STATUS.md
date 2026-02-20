# 노션 클론 프로젝트 현황 (2026-02-20 기준)

---

## 1. 프로젝트 목표

> **웹 기반 노션 클론** — Obsidian처럼 메모를 **실제 폴더/파일**로 저장하고,
> 나중에는 **PySide6(Python 데스크톱 앱)**으로 감싸 브라우저 없이 실행하는 것이 최종 목표

### 핵심 차별점
- 메모 1개 = `vault/{페이지ID}/` 폴더 1개 (탐색기에서 바로 열람 가능)
- 이미지도 `vault/{페이지ID}/images/` 에 실제 파일로 저장
- Python FastAPI 백엔드가 파일 입출력 담당
- 향후 PySide6 + QWebEngineView로 데스크톱 앱화

---

## 2. 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | Next.js 14 App Router (`'use client'`) |
| 에디터 | Tiptap v3.20 (StarterKit + 개별 확장) |
| 스타일 | Tailwind CSS v4 (`@apply` 금지, `@theme` 사용) |
| 상태관리 | Zustand + immer |
| 드래그앤드롭 | dnd-kit |
| 백엔드 | Python FastAPI + uvicorn |
| 저장소 | `vault/` 디렉토리 (로컬 파일시스템) |

---

## 3. 개발 규칙 (반드시 준수)

1. 모든 컴포넌트/함수/CSS에 **한국어 주석 필수**
2. 각 함수 옆에 **Python 비교 주석** 추가 (`// Python으로 치면: def foo(): ...`)
3. `className`에 **멀티라인 템플릿 리터럴 금지** (hydration 에러 발생) → 삼항 연산자 사용
4. Tailwind v4: **`@apply` 금지**
5. 모든 훅(useState, useEffect 등) 호출은 조건 분기 **이전**에 수행 (React 훅 규칙)

---

## 4. 프로젝트 구조

```
notion-clone/
├── src/
│   ├── app/
│   │   ├── page.tsx           ← 진입점 (Sidebar + PageEditor 레이아웃)
│   │   └── globals.css        ← Tiptap 전용 스타일
│   ├── store/
│   │   └── pageStore.ts       ← Zustand 스토어 (모든 상태 + API 동기화)
│   ├── types/
│   │   └── block.ts           ← Block, Page 타입 + 생성 헬퍼
│   ├── lib/
│   │   └── api.ts             ← FastAPI 클라이언트 함수 모음
│   └── components/editor/
│       ├── Editor.tsx         ← 블록 단위 Tiptap 에디터 + dnd-kit
│       ├── PageEditor.tsx     ← 전체 페이지 렌더러 (커버, 제목, 블록 목록)
│       ├── Sidebar.tsx        ← 왼쪽 사이드바 (페이지 목록, 검색, 삭제)
│       ├── BubbleMenuBar.tsx  ← 텍스트 선택 시 인라인 툴바
│       ├── SlashCommand.tsx   ← `/` 입력 시 블록 타입 선택 메뉴
│       ├── BlockMenu.tsx      ← 블록 좌측 `+` 버튼 (위/아래 추가, 복제, 삭제)
│       ├── ImageBlock.tsx     ← 이미지 블록 (업로드 + 미리보기)
│       ├── TableToolbar.tsx   ← 테이블 편집 툴바
│       ├── CodeBlockView.tsx  ← 코드 블록 (언어 선택 드롭다운 포함)
│       └── EmojiPicker.tsx    ← 페이지 아이콘 이모지 선택기
├── backend/
│   ├── main.py                ← FastAPI 서버 (CRUD + 이미지 업로드)
│   └── requirements.txt       ← fastapi, uvicorn, python-multipart
└── vault/                     ← 실제 데이터 저장 폴더 (자동 생성됨)
    ├── _index.json            ← 페이지 순서, 현재 페이지 ID
    └── {page-uuid}/
        ├── content.json       ← 페이지 메타 + 블록 전체
        └── images/
            └── {uuid}.jpg     ← 업로드된 이미지
```

---

## 5. 완성된 기능 목록

### 5-1. 에디터 핵심
- [x] **블록 기반 에디터** — Tiptap으로 블록마다 독립 에디터 인스턴스
- [x] **블록 타입**: paragraph, heading1/2/3, bulletList, orderedList, taskList, code, image, table, divider
- [x] **슬래시 커맨드** (`/`) — 블록 타입 검색·선택 메뉴 (키보드 방향키+Enter 지원)
- [x] **인라인 툴바** (BubbleMenuBar) — 텍스트 선택 시 Bold/Italic/Underline/Strike/Code/Link/글자색/배경색 적용
- [x] **드래그앤드롭** — dnd-kit으로 블록 순서 변경 (8px 이상 이동 시 활성화)

### 5-2. 블록 메뉴
- [x] **BlockMenu** (`+` 버튼) — hover 시 표시, 클릭 시 위/아래 추가·복제·삭제 드롭다운

### 5-3. 키보드 단축키
- [x] `Enter` → 새 블록 추가 (테이블 셀 내에서는 셀 내 줄바꿈)
- [x] `Backspace` → 빈 블록 삭제
- [x] `Tab` / `Shift+Tab` → 목록 들여쓰기/내어쓰기
- [x] 코드 블록에서 `Tab` → 스페이스 2개 삽입

### 5-4. 페이지 기능
- [x] **페이지 아이콘** — 클릭 시 이모지 피커 팝업
- [x] **커버 이미지** — 추가/변경/삭제 (hover 시 버튼 표시)
- [x] **사이드바** — 페이지 목록, 제목 검색, 삭제 버튼 (hover 시 표시)
- [x] **새 페이지 생성** — 사이드바 하단 `+` 버튼

### 5-5. 특수 블록
- [x] **이미지 블록** — 파일 업로드 UI + base64 미리보기
- [x] **테이블 블록** — 3×3 기본, TableToolbar로 행/열 추가·삭제
- [x] **코드 블록** — lowlight 문법 하이라이팅 + 언어 선택 드롭다운 (40+ 언어)
- [x] **구분선** — divider 타입 (Tiptap HorizontalRule)

### 5-6. 백엔드 (FastAPI)
- [x] **vault/ 구조** — 페이지 1개 = 폴더 1개, content.json + images/ 폴더
- [x] **REST API** — GET/POST/PUT/DELETE /api/pages, PATCH /api/current
- [x] **이미지 업로드** — POST /api/pages/{id}/images → 실제 파일로 저장
- [x] **자동 서빙** — /static/ 경로로 이미지 URL 제공
- [x] **CORS** — localhost:3000 허용
- [x] **Graceful degradation** — 서버 꺼져도 로컬 상태로 동작

### 5-7. 데이터 동기화
- [x] **디바운스 저장** — 500ms 후 자동 저장 (타이핑 중 요청 폭주 방지)
- [x] **앱 시작 시 서버 로드** — `loadFromServer()` → vault에서 페이지 복원
- [x] **페이지 생성/삭제/전환** — 즉시 API 호출

---

## 6. 미완성 기능 (앞으로 개발할 것)

### 6-1. 이미지 실제 파일 저장 ← **다음 단계로 추천**
**현황**: 이미지 블록의 이미지가 현재 **base64 문자열**로 content.json에 저장됨
→ content.json 용량이 커지고, 탐색기에서 이미지 파일로 볼 수 없음

**목표**: 이미지 업로드 시 `api.uploadImage()` 호출 → `vault/{id}/images/{uuid}.jpg`로 저장 → URL만 저장

**필요 작업**:
- `ImageBlock.tsx`: base64 저장 대신 `api.uploadImage(pageId, file)` 호출로 변경
- 커버 이미지도 동일하게 처리 (`PageEditor.tsx`의 `handleCoverChange`)
- 현재 base64 커버는 `page.cover`에 그대로 저장됨

### 6-2. PySide6 데스크톱 앱 래핑
**목표**: `python pyside_app.py` 하나로 FastAPI 서버 + Next.js 앱을 내장 Chromium으로 실행

**필요 작업**:
- `pyside_app.py` 작성 (QMainWindow + QWebEngineView)
- FastAPI 서버를 별도 스레드로 시작
- Next.js 빌드(`next build && next start`) 를 subprocess로 실행
- 창 닫으면 두 서버 모두 종료

**참고**:
```python
# 대략적인 구조
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import QUrl
import threading, uvicorn

def start_backend():
    uvicorn.run("backend.main:app", port=8000)

threading.Thread(target=start_backend, daemon=True).start()

app = QApplication([])
window = QMainWindow()
view = QWebEngineView()
view.load(QUrl("http://localhost:3000"))
window.setCentralWidget(view)
window.show()
app.exec()
```

### 6-3. 토글 블록
**현황**: `BlockType`에 `toggle` 타입은 정의되어 있지만 구현 안 됨
**필요 작업**:
- Tiptap Details/Summary 확장 추가 or 커스텀 Node 구현
- 슬래시 커맨드에 토글 항목 추가

### 6-4. 내보내기
- PDF 내보내기 (`window.print()` + CSS `@media print`)
- Markdown 내보내기 (HTML → Markdown 변환, `turndown` 라이브러리)
- 전체 vault ZIP 다운로드

### 6-5. 단축키 강화
- `Ctrl+Z` / `Ctrl+Y` — 실행취소/다시실행 (Tiptap 기본 제공, 확인 필요)
- `Ctrl+/` — 슬래시 커맨드 강제 열기
- `Ctrl+B/I/U` — 이미 작동하는지 확인 필요

### 6-6. 기타
- 페이지 아이콘 없음 → "아이콘 추가" 버튼 (현재는 항상 📝로 생성)
- 페이지 재정렬 (사이드바 드래그앤드롭)
- 블록 내 링크 클릭 → 새 탭 열기 옵션

---

## 7. 서버 실행 방법

### 백엔드 (FastAPI)
```bash
cd c:\Users\parkb\Downloads\dist\notion-clone\backend
python -m uvicorn main:app --reload --port 8000
```
> ⚠️ Windows에서 `uvicorn` 명령어 직접 안 됨 → 반드시 `python -m uvicorn` 사용

### 프론트엔드 (Next.js)
```bash
cd c:\Users\parkb\Downloads\dist\notion-clone
npm run dev
```

### 접속
- 프론트엔드: http://localhost:3000
- 백엔드 API 문서: http://localhost:8000/docs

---

## 8. 핵심 코드 패턴 / 주의사항

### Tiptap v3 패턴
```typescript
// StarterKit에 이미 포함된 확장: link
// 별도 import 금지 → configure로만 설정
StarterKit.configure({
  codeBlock: false,           // CustomCodeBlock이 대체
  heading: { levels: [1,2,3] },
  link: { openOnClick: false }
})
```

### 디바운스 저장 패턴
```typescript
// 페이지별 독립 타이머 (Map으로 관리)
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleSave(pageId: string, getState: () => PageStore) {
  const existing = saveTimers.get(pageId)
  if (existing) clearTimeout(existing)
  saveTimers.set(pageId, setTimeout(async () => {
    saveTimers.delete(pageId)
    const page = getState().pages.find(p => p.id === pageId)
    if (page) {
      try { await api.savePage(pageId, page) } catch { /* 서버 꺼져도 무시 */ }
    }
  }, 500))
}
```

### BubbleMenuBar 다중 인스턴스 버그 방지
```typescript
// 각 블록마다 BubbleMenuBar가 있으므로 반드시 이 체크 필요
// 없으면 다른 블록의 에디터 커맨드가 실행됨
const range = selection.getRangeAt(0)
if (!editor.view.dom.contains(range.commonAncestorContainer)) return
```

### Date 직렬화 (JSON 전송 시)
```typescript
// Date 객체 → ISO 문자열 (serializePage 헬퍼로 처리)
// 서버 응답 시 → new Date(str) 로 복원
createdAt: page.createdAt instanceof Date
  ? page.createdAt.toISOString()
  : page.createdAt,
```

### Tailwind v4 주의
```css
/* @apply 금지 */
/* 올바른 방법: @theme으로 커스텀 변수 정의 */
@theme {
  --color-brand: #3b82f6;
}
```

### className 멀티라인 금지
```tsx
// ❌ 금지 (hydration 에러)
className={`
  text-sm
  font-bold
`}

// ✅ 올바른 방법
className={isActive ? "text-sm font-bold text-blue-600" : "text-sm text-gray-600"}
```

---

## 9. vault/ 폴더 구조 예시

```
vault/
├── _index.json
│   → { "pageOrder": ["uuid1", "uuid2"], "currentPageId": "uuid1" }
│
└── f6e50297-47bc-408a-9cec-ba7b83d371ad/
    ├── content.json
    │   → { id, title, icon, cover, blocks: [...], createdAt, updatedAt }
    └── images/
        └── 3a7b9f12-....jpg
```

---

## 10. 새 채팅에서 개발 시작 시 컨텍스트 제공 방법

새 채팅을 열면 Claude에게 이렇게 말하세요:

> "노션 클론 프로젝트 개발을 이어서 하고 싶어.
> 프로젝트 현황 파일이 `c:\Users\parkb\Downloads\dist\notion-clone\PROJECT_STATUS.md` 에 있어.
> 읽어보고 [다음에 할 기능]부터 시작해줘."
