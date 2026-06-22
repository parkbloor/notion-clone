# 12. Settings — 설정 모달 / 탭 컴포넌트

> `SettingsModal`이 컨테이너이고, 9개 탭이 각각 독립 컴포넌트로 구현됨.
> 각 탭은 `useSettingsStore` 또는 백엔드 API와 직접 통신.

---

## [src/components/settings/SettingsModal.tsx](../src/components/settings/SettingsModal.tsx)

**역할:** 설정 모달 — 좌측 탭 메뉴 + 우측 탭 콘텐츠. Escape 키로 닫기.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `SettingsModal` | `default function` | 설정 모달 컨테이너 |

### Props

| prop | 타입 | 설명 |
|------|------|------|
| `onClose` | `() => void` | 모달 닫기 콜백 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `TabId` | `'appearance' \| 'editor' \| 'plugins' \| 'templates' \| 'ai' \| 'data' \| 'storage' \| 'cloud' \| 'debug'` |
| `TAB_IDS` / `TAB_ICONS` | 탭 순서·아이콘 정의 — 9개 |
| `TAB_COMPONENTS` | 탭 ID → 컴포넌트 매핑 레코드 |

---

## [src/components/settings/tabs/AppearanceTab.tsx](../src/components/settings/tabs/AppearanceTab.tsx)

**역할:** 모양 설정 탭 — 밝기 모드, 색상 테마 프리셋, 강조색, 배경 톤, 언어 선택.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `AppearanceTab` | `default function` | 모양 설정 탭 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `THEME_OPTIONS` | 밝기 모드 3종 `{ value: 'light'\|'dark'\|'auto', label, icon, desc }` |
| `THEME_PRESETS` | 색상 테마 프리셋 5종. 각각 `{ id, label, desc, swatches, darkSwatches }` — 스와치 미리보기용 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 밝기 모드 | `applyTheme(theme)` 호출 → `html.classList` 토글 + 인라인 CSS 변수 재주입 |
| 테마 프리셋 | `applyThemePreset(preset)` 호출 → `data-theme` 속성 + 인라인 CSS 변수 동시 적용 |
| 강조색 / 배경 톤 | `setAccentColor()` / `setBgTone()`으로 CSS 변수 즉시 적용 |
| 언어 | `setLocale('ko' \| 'en')`으로 UI 로케일 변경 |

---

## [src/components/settings/tabs/EditorTab.tsx](../src/components/settings/tabs/EditorTab.tsx)

**역할:** 편집기 설정 탭 — 폰트 선택, 기본 크기, 줄간격, 최대 너비, 날씨 위치, Day Planner 표시·알림 설정.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `EditorTab` | `default function` | 편집기 설정 탭 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `SIZE_OPTIONS` | 기본 크기 옵션 `[14, 16, 18, 20]` px |
| `CATEGORY_ORDER` | 폰트 카테고리 표시 순서 `['sans', 'korean', 'serif', 'mono']` |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 폰트 변경 | `setFontFamily()` + `applyEditorStyle()` 즉시 반영 (항상 `editorMaxWidth` 함께 전달) |
| 크기 변경 | `setFontSize()` + `applyEditorStyle()` |
| 줄간격 | 슬라이더 1.0~2.5, 소수점 1자리 반올림 |
| 날씨 위치 | 도시명 입력 → 저장 버튼 → `setWeatherLocation()` (Open-Meteo API에서 지오코딩) |
| Day Planner | 시작/종료 시각, 스냅 간격, 줌, 주 시작 요일, 알림 시간을 `useSettingsStore`에 저장 |

---

## [src/components/settings/tabs/PluginsTab.tsx](../src/components/settings/tabs/PluginsTab.tsx)

**역할:** 플러그인 관리 탭. 옵시디언 스타일 마스터-디테일 레이아웃. 좌측: 검색+목록 / 우측: 선택된 플러그인 상세.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `PluginsTab` | `default function` | 플러그인 관리 탭 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `PluginMeta` | `{ id, icon, name, author, version, tags, desc, fullDesc, available }` |
| `PLUGIN_LIST` | 전체 플러그인 목록 (21개) |

### 플러그인 목록

`kanban`, `calendar`, `admonition`, `recentFiles`, `quickAdd`, `wordCount`, `focusMode`, `tableOfContents`, `pomodoro`, `periodicNotes`, `canvas`, `excalidraw`, `videoAutoplay`, `layoutEnabled`, `backlinks`, `chart`, `gantt`, `mindmap`, `globalAiChat`, `math`, `arrowConnect` (`videoLoop`는 videoAutoplay의 보조 설정)

### 주요 동작

| 동작 | 설명 |
|------|------|
| 검색 | 이름/태그 필터링 |
| 토글 | `setPlugin(id, enabled)` → `useSettingsStore` |
| 커스텀 레이아웃 | `layoutEnabled` 선택 시 `CustomLayoutTemplate` CRUD UI 표시 |

---

## [src/components/settings/tabs/AITab.tsx](../src/components/settings/tabs/AITab.tsx)

**역할:** AI 설정 탭 — 제공자 선택, API 키 입력, 모델 선택, 연결 테스트.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `AITab` | `default function` | AI 설정 탭 |

### 내부 상수

| 상수 | 설명 |
|------|------|
| `OPENAI_MODELS` | OpenAI 모델 4종 (`gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`) |
| `CLAUDE_MODELS` | Claude 모델 5종 (`claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`, 등) |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 제공자 변경 | `openai` / `claude` / `ollama` 선택 → 모델 기본값 자동 전환 |
| API 키 | OpenAI/Anthropic 키를 각각 마스킹 저장. AI 호출 시 현재 제공자 키를 선택하고, 기존 `aiApiKey`는 하위호환 fallback으로만 사용 |
| Ollama URL | `ollama` 선택 시 URL 입력 필드 표시 (기본: `http://localhost:11434`) |
| 연결 테스트 | 간단한 `"안녕하세요"` 요청 → 응답 성공/실패 상태 표시 |

---

## [src/components/settings/tabs/DataTab.tsx](../src/components/settings/tabs/DataTab.tsx)

**역할:** 데이터 내보내기/백업/복구 탭.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `DataTab` | `default function` | 데이터 탭 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| JSON 백업 | `GET /api/export/json` 결과에 API 키를 제외한 로컬 설정을 합쳐 `.nct` 다운로드 |
| 마크다운 ZIP | `GET /api/export/markdown` → ZIP 파일 다운로드 |
| 전체 복구 | `.nct` 선택 → `POST /api/import` → 설정 복원 후 새로고침 |
| 병합 가져오기 | `.nct` 또는 vault 폴더를 `POST /api/import/merge`로 병합 |

---

## [src/components/settings/tabs/StorageTab.tsx](../src/components/settings/tabs/StorageTab.tsx)

**역할:** 멀티 vault 관리 탭 — vault 목록·전환·루트 변경·스캔·고급 경로 변경.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `StorageTab` | `default function` | 저장 위치 탭 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `VaultInfo` | `{ vaults_root, current_vault, current_vault_path, total_pages, categories, total_size_kb, vaults }` | 현재 vault와 탐지된 vault 목록 |
| `VaultEntry` | `{ name, path, page_count, initialized, is_current }` | vault 목록 항목 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 정보 조회 | `GET /api/settings/vault-info` → 현재 vault·목록 표시 |
| 전환 / 루트 변경 | `POST /api/settings/switch-vault`, `POST /api/settings/vaults-root` 후 페이지 스토어 재로딩 |
| 스캔 / 고급 변경 | `scan-vault`, `vault-path`, 폴더 선택 API로 외부에서 추가한 메모와 경로 변경을 처리 |

---

## [src/components/settings/tabs/CloudSyncTab.tsx](../src/components/settings/tabs/CloudSyncTab.tsx)

**역할:** Google Drive·OneDrive OAuth 연동 설정. 제공자별 연결 상태, OAuth 클라이언트 설정, 업로드·다운로드·연결 해제를 관리한다.

### 주요 동작

| 동작 | 설명 |
|------|------|
| 상태 조회 | `GET /api/cloud/status`로 연결·설정·최근 업로드 상태 표시 |
| 인증 | 제공자별 auth URL을 열고 콜백 완료 동안 상태 폴링 |
| 동기화 | 제공자별 upload/download/disconnect API 호출 |

---

## [src/components/settings/tabs/TemplatesTab.tsx](../src/components/settings/tabs/TemplatesTab.tsx)

**역할:** 사용자 정의 템플릿 CRUD 탭. 마크다운 직접 입력 + 비주얼 그리드 에디터 연동.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `TemplatesTab` | `default function` | 템플릿 관리 탭 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 목록 | `templateApi.getAll()` |
| 생성/수정 | 이름/아이콘/설명/content 폼 → `templateApi.create()` / `update()` |
| 그리드 템플릿 | `isGridTemplate(content)` → `TemplateEditorModal` 열기 |
| 삭제 | `templateApi.delete()` + 확인 |

---

## [src/components/settings/tabs/DebugTab.tsx](../src/components/settings/tabs/DebugTab.tsx)

**역할:** 백엔드 디버그 로그 조회 및 복사.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `DebugTab` | `default function` | 디버그 로그 탭 |

### 내부 타입/상수

| 이름 | 설명 |
|------|------|
| `LogEntry` | `{ level: 'INFO'\|'WARNING'\|'ERROR'\|'DEBUG', time, message, logger }` |
| `levelStyle` | 로그 레벨 → Tailwind 텍스트 색상 클래스 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 로그 조회 | `GET /api/debug/logs` → `LogEntry[]` |
| 새로고침 | 수동 갱신 버튼 |
| 복사 | 전체 로그 클립보드 복사 → 2초 후 상태 원복 |
