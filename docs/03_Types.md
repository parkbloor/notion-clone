# 03. Types — 타입 정의

> 프로젝트 전체에서 사용하는 도메인 타입을 단일 파일로 관리한다.
> 타입을 변경하면 백엔드 JSON 스키마와의 호환성도 함께 검토해야 한다.

---

## [src/types/block.ts](../src/types/block.ts)

**역할:** 노션 클론의 모든 도메인 타입 정의. 블록, 페이지, 카테고리, 속성, 휴지통 아이템.

### exports — 타입

| 이름 | 종류 | 설명 |
|------|------|------|
| `BlockType` | `type (union)` | 블록 종류 문자열 리터럴 (30개). 새 블록 추가 시 여기에 먼저 등록 |
| `PropertyType` | `type (union)` | 페이지 속성 종류 — `'date' \| 'status' \| 'select' \| 'text' \| 'relation' \| 'time'` |
| `STATUS_OPTIONS` | `const` | 상태 속성 고정 선택지 `['미시작', '진행 중', '완료', '보류']` |
| `PageProperty` | `interface` | 페이지 속성 하나 `{ id, name, type, value, options?, reminder?, weatherData? }` |
| `Block` | `interface` | 블록 하나 `{ id, type, content, children, createdAt, updatedAt, canvasX?, canvasY?, canvasW?, canvasH?, backgroundColor? }` |
| `Page` | `interface` | 페이지 하나 `{ id, title, icon, cover?, blocks, properties?, canvasMode?, isLocked?, lockPin?, ... }` |
| `Category` | `interface` | 카테고리(폴더) `{ id, name, folderName, parentId?, color?, isTrashed?, ... }` |
| `TrashItem` | `interface` | 휴지통 항목 — 페이지 또는 카테고리 통합 타입 |

### exports — 함수

| 이름 | 설명 |
|------|------|
| `createBlock(type?)` | 기본값으로 새 `Block` 생성. `crypto.randomUUID()`로 ID 생성 |
| `createPage(title?)` | 기본값으로 새 `Page` 생성. 빈 paragraph 블록 하나를 포함 |

### BlockType 전체 목록

| 값 | 설명 |
|----|------|
| `paragraph` | 일반 텍스트 |
| `heading1` ~ `heading6` | 제목 1~6 |
| `bulletList` | 글머리 기호 목록 |
| `orderedList` | 번호 목록 |
| `taskList` | 체크박스 목록 |
| `toggle` | 접기/펼치기 토글 |
| `code` | 코드 블록 |
| `image` | 이미지 |
| `table` | 테이블 |
| `divider` | 구분선 |
| `kanban` | 칸반 보드 |
| `admonition` | 콜아웃 (팁/정보/경고/위험) |
| `canvas` | 무한 캔버스 |
| `excalidraw` | 손그림 다이어그램 |
| `video` | 로컬 동영상 |
| `layout` | 다단 레이아웃 |
| `math` | LaTeX 수식 (KaTeX) |
| `embed` | URL 임베드 (YouTube / iframe) |
| `mermaid` | Mermaid 다이어그램 |
| `chart` | Bar/Line/Pie 차트 |
| `gantt` | 갠트 차트 |
| `mindmap` | AI 마인드맵 |
| `ai` | AI 글쓰기 패널 트리거 (실제 블록 없음) |
| `toc` | 인라인 목차 |
| `file` | 파일 첨부 |
| `dayplanner` | Day Planner |
| `weeklyplanner` | 주간 플래너 |
| `routinematrix` | 루틴 달성 매트릭스 |
| `monthlycalendar` | 월간 달력 |
| `quarterlyplanner` | 분기 플래너 |
| `yearlyplanner` | 연간 플래너 |

### Block 인터페이스 핵심 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | `string` | UUID |
| `type` | `BlockType` | 블록 종류 |
| `content` | `string` | HTML 문자열로 저장 (Tiptap 직렬화) |
| `children` | `Block[]` | 자식 블록 (토글 내부 등) |
| `canvasX/Y` | `number?` | 캔버스 모드 절대 좌표 |
| `canvasW/H` | `number?` | 캔버스 모드 크기 |
| `backgroundColor` | `string?` | 블록 배경색 (hex) |

### Page 인터페이스 핵심 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `cover` | `string?` | URL / `"gradient:..."` / `"color:..."` |
| `coverPosition` | `number?` | 커버 Y 위치 0~100 |
| `tags` | `string[]?` | 태그 목록 |
| `starred` | `boolean?` | 즐겨찾기 여부 |
| `canvasMode` | `boolean?` | 캔버스 모드 여부 |
| `isLocked` | `boolean?` | 편집 잠금 여부 |
| `lockPin` | `string?` | SHA-256 PIN 해시 |
