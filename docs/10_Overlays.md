# 10. Overlays — 패널 / 오버레이 / 팝업 컴포넌트

> 에디터 위에 레이어로 표시되거나 사이드에 슬라이드인 되는 UI 컴포넌트들.
> 각 컴포넌트는 독립적으로 열기/닫기 가능하며 `page.tsx` 또는 `PageEditor.tsx`에서 조건부 렌더링됨.

---

## [src/components/editor/PropertyPanel.tsx](../src/components/editor/PropertyPanel.tsx)

**역할:** 페이지 속성 패널 — 태그 + date/time/status/select/text/relation 6종 속성. 제목 아래 인라인 표시.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PropertyPanel` | `default function` | 속성 패널 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pageId` | `string` | 대상 페이지 ID |
| `onNavigate?` | `(targetPageId: string) => void` | 관계 속성 클릭 → 페이지 이동 콜백 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `PROPERTY_TYPES` | 추가 가능한 속성 타입 목록 `{ type, label, icon }[]` — 6종 |
| `WMO_ICON` | WMO 날씨 코드 → 이모지 (date 속성 날씨 표시용) |
| `STATUS_COLOR` | 상태 값 → Tailwind 배지 색상 클래스 매핑 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 태그 | 칩 표시 + 자동완성 입력. 전체 페이지 태그 집계해 드롭다운 제공 |
| 속성 편집 | 인라인 편집 — status 피커, date input, select 드롭다운, text input |
| 속성 추가 | `+ 속성 추가` 드롭다운 → `setPageProperty()` |
| 관계 속성 | 쉼표 구분 다중 페이지 연결. 클릭 시 `onNavigate()` |
| 날씨 | `date` 속성 있을 때 `settingsStore.weatherLocation`으로 Open-Meteo API 호출 → 날씨 아이콘 표시 |

---

## [src/components/editor/DatabaseView.tsx](../src/components/editor/DatabaseView.tsx)

**역할:** 데이터베이스 뷰. 현재 카테고리 페이지들을 테이블 또는 캘린더로 표시. 인라인 셀 편집.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `DatabaseView` | `default function` | 데이터베이스 뷰 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 뷰 닫기 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `ViewMode` | `'table' \| 'calendar'` |
| `FilterOperator` | `'contains' \| 'equals' \| 'not_contains' \| 'before' \| 'after'` |
| `FilterCondition` | `{ id, column, operator, value }` — 필터 조건 단건 |
| `SortConfig` | `{ key, dir: 'asc' \| 'desc' }` — 정렬 설정 |
| `COL_TITLE` / `COL_UPDATED` | 내장 컬럼 키 상수 `'__title__'` / `'__updatedAt__'` |
| `PROP_TYPE_ORDER` | 컬럼 표시 순서 `['status', 'date', 'select', 'text']` |
| `STATUS_COLOR` | 상태 → Tailwind 배지 색상 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `fmtDate(val)` | `Date \| string` → `MM월 DD일` 포맷 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 테이블 뷰 | 페이지 행 × 속성 열. 인라인 셀 편집 |
| 캘린더 뷰 | `date` 속성 기반 월간 달력 |
| 정렬 | 컬럼 헤더 클릭 → asc/desc 토글 |
| 필터 | 다중 필터 조건 조합 |
| 새 페이지 | 테이블 하단 `+` 버튼 → 현재 카테고리에 페이지 생성 |

---

## [src/components/editor/GraphView.tsx](../src/components/editor/GraphView.tsx)

**역할:** `Ctrl+G`로 여는 페이지 간 링크 관계 그래프 뷰. 외부 라이브러리 없이 자체 물리 시뮬레이션 SVG 구현.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `GraphView` | `default function` | 그래프 뷰 오버레이 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 오버레이 닫기 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `SimNode` | `GraphNode & { x, y, vx, vy, pinned }` — 물리 시뮬레이션 노드 |
| `PALETTE` | 카테고리 색상 팔레트 8종 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `categoryColor(catId)` | 카테고리 ID → 해시 기반 팔레트 색상 |
| `nodeRadius(degree)` | 연결 수 → 노드 반지름 (degree 0 = 6px, 최대 18px) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 그래프 데이터 | `buildGraphData(pages, categoryMap)` → `GraphData` |
| 물리 시뮬 | 반발력(쿨롱) + 스프링(훅) + 중심력 → requestAnimationFrame 루프 |
| 팬/줌 | 드래그 팬, wheel 줌 |
| 노드 드래그 | `pinned=true` 설정 → 시뮬레이션에서 고정 |
| 노드 클릭 | `setCurrentPage()` → 해당 페이지 이동 + 오버레이 닫기 |
| 현재 페이지 | 강조 링 표시 |

---

## [src/components/editor/TocPanel.tsx](../src/components/editor/TocPanel.tsx)

**역할:** 현재 페이지 목차 사이드 패널. `heading1~6` 블록 계층 목록. 접힌 헤딩과 동기화.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TocPanel` | `default function` | 목차 패널 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `blocks` | `Block[]` | 현재 페이지 블록 목록 |
| `collapsedIds` | `Set<string>` | 접힌 헤딩 ID 집합 (PageEditor와 공유) |
| `onToggleCollapse` | `(blockId: string) => void` | 헤딩 접기/펼치기 토글 콜백 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `HEADING_LEVEL` | `{ heading1:1, ..., heading6:6 }` |
| `INDENT_CLASSES` | `['', 'pl-3', 'pl-5', 'pl-7', 'pl-9', 'pl-11']` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 헤딩 추출 | `useMemo`로 heading 블록만 필터링 |
| H1 접힘 | 접힌 헤딩 하위 항목 모두 숨김 (레벨 기반 추론) |
| 클릭 | `document.getElementById(blockId)?.scrollIntoView()` → 2초 후 active 초기화 |
| 위치 | `hidden xl:block sticky top-20` — 넓은 화면에서만 표시 |

---

## [src/components/editor/BacklinkPanel.tsx](../src/components/editor/BacklinkPanel.tsx)

**역할:** 현재 페이지를 `@멘션`/`[[링크`로 참조하는 다른 페이지 목록 (백링크). 참조 없으면 숨김.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `BacklinkPanel` | `default function` | 백링크 패널 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pageId` | `string` | 백링크 대상 페이지 ID |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `stripHtml(html)` | HTML → 순수 텍스트 (스니펫 표시용) |
| `flattenBlocks(blocks)` | 재귀 블록 트리 평탄화 (toggle 자식 포함) |
| `blockLinksToPage(block, pageId)` | `#page-{id}` 또는 `#block-{id}:` 패턴 감지 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 백링크 계산 | `useMemo` — 전체 페이지 블록 스캔 → 링크 패턴 감지 |
| 표시 | 참조 페이지별로 링크 블록 스니펫 표시 |
| 클릭 | `setCurrentPage()` → 해당 페이지 이동 |

---

## [src/components/editor/VersionHistoryPanel.tsx](../src/components/editor/VersionHistoryPanel.tsx)

**역할:** 페이지 버전 히스토리 슬라이드-인 패널. 3분 간격 스냅샷, 최대 50개. 미리보기·복원.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `VersionHistoryPanel` | `default function` | 버전 히스토리 패널 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `pageId` | `string` | 대상 페이지 ID |
| `onClose` | `() => void` | 패널 닫기 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `formatTimestamp(snapshotAt)` | ISO → `YYYY-MM-DD HH:MM` 포맷 |
| `timeAgo(snapshotAt)` | 경과 시간 → `방금 전 / N분 전 / N시간 전 / N일 전` |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `BLOCK_LABELS` | 블록 타입 → 레이블 (`paragraph → '텍스트'`, 등) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 목록 | `historyApi.list(pageId)` — 최신순 버전 목록 |
| 미리보기 | 버전 클릭 → 블록 타입·텍스트 나열 (읽기전용) |
| 복원 | "이 버전으로 복원" 확인 → `historyApi.restore()` → 페이지 리로드 |
| 파일명 | 하이픈 구분 타임스탬프 (Windows 호환): `2026-03-17T11-17-22.nct` |

---

## [src/components/editor/TrashPanel.tsx](../src/components/editor/TrashPanel.tsx)

**역할:** 휴지통 오버레이 패널. 소프트 삭제된 페이지/폴더 목록. 복원/영구삭제/전체비우기.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TrashPanel` | `default function` | 휴지통 패널 컴포넌트 |

### 내부 컴포넌트

| 이름 | 설명 |
|------|------|
| `OriginLabel` | 삭제 항목의 원래 위치 표시 (`📁 폴더명` 또는 `📋 미분류`) |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `formatDate(iso)` | ISO → `방금 전 / N분 전 / ...` 경과 시간 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 목록 | `pageStore.trashItems` 구독 |
| 복원 | `pageStore.restoreFromTrash()` |
| 영구삭제 | `pageStore.permanentlyDelete()` |
| 전체 비우기 | 확인 후 전체 영구삭제 |

---

## [src/components/editor/PeriodicNotesPanel.tsx](../src/components/editor/PeriodicNotesPanel.tsx)

**역할:** 사이드바 내 일간·주간·월간 노트 목록 패널. 노트 자동 생성 + 템플릿 적용.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PeriodicNotesPanel` | `default function` | 주기적 노트 패널 컴포넌트 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `getISOWeek(date)` | ISO 8601 주차 계산 (1월 첫째 목요일이 속한 주 = 1주) |
| `makeDailyTemplate(title, dateStr)` | 일간 노트 기본 템플릿 블록 생성 (집중목표 + DayPlannerBlock + 할 일 + 메모 + 하루 돌아보기) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 탭 | 일간 / 주간 / 월간 3탭 |
| 날짜 포맷 | 일간: `YYYY-MM-DD`, 주간: `YYYY-WXX`, 월간: `YYYY-MM` |
| 노트 탐색 | 제목 패턴으로 기존 페이지 검색 |
| 노트 생성 | 없으면 `addPage()` + 템플릿 블록 적용 |

---

## [src/components/editor/ShortcutModal.tsx](../src/components/editor/ShortcutModal.tsx)

**역할:** 도움말 모달 — 단축키 / 슬래시 커맨드 / 플러그인 3탭. `?` 버튼으로 열기.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ShortcutModal` | `default function` | 단축키/도움말 모달 컴포넌트 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `SHORTCUT_GROUPS` | 단축키 그룹별 목록 (텍스트 서식 / 블록 변환 / 편집 / 탐색 링크 / 뷰 기타) |

### 탭 구성

| 탭 | 내용 |
|----|------|
| 단축키 | `SHORTCUT_GROUPS` 기반 그룹별 키 조합 표 |
| 슬래시 커맨드 | `SlashCommand.tsx`의 `COMMANDS` 기반 카드 목록 |
| 플러그인 | 활성화된 플러그인 목록 + 설명 |

---

## [src/components/editor/LockModal.tsx](../src/components/editor/LockModal.tsx)

**역할:** 페이지 잠금 설정/해제 PIN 모달. SHA-256 해시로 PIN 저장 (Web Crypto API).

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `LockModal` | `default function` | PIN 잠금 모달 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `mode` | `'lock' \| 'unlock'` | 잠금 설정(PIN 2회 입력) vs 잠금 해제(PIN 1회 검증) |
| `onLock?` | `(pinHash: string) => void` | 잠금 설정 완료 콜백 |
| `onUnlock?` | `() => void` | 잠금 해제 완료 콜백 |
| `onCancel` | `() => void` | 취소 콜백 |
| `storedPinHash?` | `string` | 저장된 PIN 해시 (unlock 모드 검증용) |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `sha256(text)` | Web Crypto API `SubtleCrypto.digest('SHA-256', ...)` → hex 문자열 |

---

## [src/components/editor/NewPageDialog.tsx](../src/components/editor/NewPageDialog.tsx)

**역할:** 새 페이지 생성 다이얼로그. 갤러리 카드 그리드 UI. 빈 페이지 / 마크다운 템플릿 / 그리드 템플릿 선택.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `NewPageDialog` | `default function` | 새 페이지 다이얼로그 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `categoryId` | `string \| null` | 생성할 카테고리 (null = 미분류) |
| `onClose` | `() => void` | 다이얼로그 닫기 |

### 내부 함수

| 함수 | 설명 |
|------|------|
| `iconToColor(icon)` | 이모지 아이콘 → 카드 상단 그라디언트 클래스 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 템플릿 목록 | `templateApi.getAll()` — 서버에서 로딩 |
| 빈 페이지 | `addPage()` 직접 생성 |
| 마크다운 템플릿 | `parseTemplateContent(template.content)` → `setPageBlocks()` |
| 그리드 템플릿 | `isGridTemplate()` 감지 → `gridCellsToBlocks()` 변환 후 적용 |

---

## [src/components/editor/TemplatePanel.tsx](../src/components/editor/TemplatePanel.tsx)

**역할:** 빈 페이지에 인라인 표시되는 템플릿 선택 패널. 내용 생기면 자동 숨김.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TemplatePanel` | `default function` | 인라인 템플릿 선택 패널 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onSelect` | `(content: string) => void` | 템플릿 선택 콜백 (content = 마크다운 텍스트) |

---

## [src/components/editor/MentionPopup.tsx](../src/components/editor/MentionPopup.tsx)

**역할:** `@` 멘션 / `[[` 페이지 링크 팝업. 페이지 + 블록 통합 검색.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `MentionPopup` | `default function` | 멘션 팝업 컴포넌트 |
| `MentionItem` | `type` | `{ kind: 'page', page } \| { kind: 'block', page, block, plainText }` |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `query` | `string` | `@` 또는 `[[` 뒤 검색어 |
| `pages` | `Page[]` | 전체 페이지 목록 |
| `position` | `{ x, y }` | 화면 좌표 (커서 아래) |
| `onSelect` | `(item: MentionItem) => void` | 항목 선택 콜백 |
| `onClose` | `() => void` | Escape: 팝업 닫기 (트리거 텍스트 유지) |
| `onClickOutside` | `() => void` | 외부 클릭: 팝업 + 트리거 텍스트 제거 |
| `trigger?` | `'@' \| '[['` | 트리거 종류 (헤더 문구용) |

### 검색 결과 구성

| 섹션 | 설명 |
|------|------|
| 검색어 없음 | 페이지 목록 최대 6개 |
| 📄 페이지 | 제목 매치 최대 3개 |
| 🧱 블록 | heading 우선, 부모 페이지 브레드크럼 표시, 최대 6개 |

---

## [src/components/editor/QuickAddModal.tsx](../src/components/editor/QuickAddModal.tsx)

**역할:** 빠른 노트 캡처 팝업 (`Ctrl+Alt+N`). 제목 + 내용 2필드 미니 입력창.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `QuickAddModal` | `default function` | 빠른 노트 캡처 팝업 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 팝업 닫기 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 저장 | `addPage()` → `setPageBlocks()` → 새 페이지로 이동 |
| Esc | 팝업 닫기 |
| 마운트 | 제목 input 자동 포커스 |

---

## [src/components/editor/TableToolbar.tsx](../src/components/editor/TableToolbar.tsx)

**역할:** 테이블 블록 전용 툴바. 커서가 테이블 안에 있을 때만 표시. 행/열 추가·삭제.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TableToolbar` | `default function` | 테이블 툴바 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `editor` | `TiptapEditor` | 현재 에디터 인스턴스 |
| `pageId` | `string` | 소속 페이지 ID |
| `blockId` | `string` | 소속 블록 ID |

### 내부 컴포넌트

| 이름 | 설명 |
|------|------|
| `ToolbarBtn` | 버튼 하나 `{ label, onClick, danger? }` — danger=true 시 빨간색 |

### 버튼 목록

행 위/아래 추가, 행 삭제, 열 앞/뒤 추가, 열 삭제, 헤더 행 토글, 테이블 삭제

---

## [src/components/editor/CoverPicker.tsx](../src/components/editor/CoverPicker.tsx)

**역할:** 페이지 커버 이미지/색상 선택 팝업. 그라디언트 / 단색 / URL / 업로드 4가지 방법.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `CoverPicker` | `default function` | 커버 선택 팝업 컴포넌트 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `GRADIENT_PRESETS` | 그라디언트 프리셋 12종 — `{ name, value: 'linear-gradient(...)' }` |
| `SOLID_PRESETS` | 단색 프리셋 목록 |

### cover 값 포맷

| 방식 | 저장 값 |
|------|---------|
| 그라디언트 | `gradient:linear-gradient(...)` |
| 단색 | `color:#hex` |
| URL | `url:https://...` |
| 업로드 | 서버 업로드 후 URL |

---

## [src/components/editor/EmojiPicker.tsx](../src/components/editor/EmojiPicker.tsx)

**역할:** 페이지 아이콘 선택용 이모지 그리드 팝업. 약 100개 이모지 표시.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `EmojiPicker` | `default function` | 이모지 선택 팝업 컴포넌트 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onSelect` | `(emoji: string) => void` | 이모지 선택 콜백 |
| `onClose` | `() => void` | 팝업 닫기 |

---

## [src/components/editor/ArrowLayer.tsx](../src/components/editor/ArrowLayer.tsx)

**역할:** 페이지 전역 SVG 오버레이. `[data-arrow-id]` DOM 속성 스캔 → 베지에 화살표 곡선 렌더링. 연결 대기 모드 고무줄 선.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ArrowLayer` | `default function` | SVG 화살표 레이어 컴포넌트 |

### 내부 타입

| 타입 | 설명 |
|------|------|
| `ArrowSegment` | 화살표 한 줄 렌더링 데이터 `{ key, sx, sy, ex, ey, color, opacity, arrowType, xPosition, startHead, endHead }` |
| `MarkerInfo` | DOM에서 읽은 마커 데이터 |

### 화살표 타입

| 타입 | 설명 |
|------|------|
| `margin` | 텍스트 왼쪽 여백을 통과하는 S자 삼차 베지에. `xPosition`으로 위치 조절 |
| `diagonal` | 시작→끝 직접 연결 이차 베지에 (약한 곡률) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| DOM 스캔 | `document.querySelectorAll('[data-arrow-id]')` → arrowId별 1:N 쌍 구성 |
| 분기 1:N | 같은 arrowId에 start 1개 + end 여러 개 → 각 end마다 path 1개 |
| 연결 모드 | `connectingState` → 마우스 따라 고무줄 선 + 시작 원 |
| 텍스트 클릭 | `caretRangeFromPoint()` → 단어 위치 탐색 → end 마크 적용 |
| 화살촉 | `endHead=true` → 채워진 삼각형, `startHead=true` → 양방향 |

---

## [src/components/editor/ArrowContextMenu.tsx](../src/components/editor/ArrowContextMenu.tsx)

**역할:** 화살표 마커 원 우클릭 시 표시되는 설정 메뉴. arrowId로 모든 관련 마크 일괄 업데이트/삭제.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `ArrowContextMenu` | `default function` | 화살표 컨텍스트 메뉴 컴포넌트 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 열기 | `arrowStore.contextMenu` 구독 |
| 설정 변경 | 색상/투명도/타입/xPosition/화살촉 로컬 편집 → `querySelectorAll('[data-arrow-id=X]')` 순회 → `setMark` 일괄 갱신 |
| 끝점 추가 | 같은 arrowId로 연결 대기 모드 재진입 |
| 삭제 | 해당 arrowId의 모든 마크 제거 |

---

## [src/components/editor/FootnoteView.tsx](../src/components/editor/FootnoteView.tsx)

**역할:** `FootnoteInline` 노드의 React NodeView. `[n]` 파란색 superscript + hover 툴팁.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `FootnoteView` | `default function` | 각주 NodeView 컴포넌트 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 번호 계산 | `editor.state.doc.descendants()` 순회 → `footnoteInline` 노드 등장 순서 → `n` 결정 |
| 표시 | `[n]` superscript (파란색) |
| 툴팁 | hover → 각주 텍스트 표시 |
