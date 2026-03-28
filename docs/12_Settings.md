# 12. Settings — 설정 모달 / 탭 컴포넌트

> `SettingsModal`이 컨테이너이고, 8개 탭이 각각 독립 컴포넌트로 구현됨.
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
| `TabId` | `'appearance' \| 'editor' \| 'plugins' \| 'data' \| 'storage' \| 'debug' \| 'templates' \| 'ai'` |
| `TABS` | 탭 목록 `{ id, icon, label }[]` — 8개 |
| `TAB_COMPONENTS` | 탭 ID → 컴포넌트 매핑 레코드 |

---

## [src/components/settings/tabs/AppearanceTab.tsx](../src/components/settings/tabs/AppearanceTab.tsx)

**역할:** 모양 설정 탭 — 밝기 모드(라이트/다크/시스템) + 색상 테마 프리셋 선택.

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

---

## [src/components/settings/tabs/EditorTab.tsx](../src/components/settings/tabs/EditorTab.tsx)

**역할:** 편집기 설정 탭 — 폰트 선택, 기본 크기, 줄간격, 최대 너비, 날씨 위치.

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
| `PLUGIN_LIST` | 전체 플러그인 목록 (19개) |

### 플러그인 목록

`kanban`, `calendar`, `admonition`, `excalidraw`, `recentFiles`, `quickAdd`, `wordCount`, `focusMode`, `pomodoro`, `tableOfContents`, `periodicNotes`, `canvas`, `videoAutoplay`, `videoLoop`, `layoutEnabled`, `backlinks`, `chart`, `gantt`, `mindmap`

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
| API 키 | 마스킹(`type="password"`) + 표시 토글 |
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
| JSON 백업 | `GET /api/export/json` → 파일 다운로드 |
| 마크다운 ZIP | `GET /api/export/markdown` → ZIP 파일 다운로드 |
| JSON 복구 | 파일 선택 → `POST /api/import/json` → toast 성공/실패 |

---

## [src/components/settings/tabs/StorageTab.tsx](../src/components/settings/tabs/StorageTab.tsx)

**역할:** 저장 위치 탭 — vault 경로 표시 + 사용자 지정 변경.

### exports

| 이름 | 종류 | 설명 |
|------|------|------|
| `StorageTab` | `default function` | 저장 위치 탭 |

### 내부 타입

| 타입 | 구조 | 설명 |
|------|------|------|
| `VaultInfo` | `{ vault_path, total_pages, total_size_kb, categories }` | vault 정보 응답 |
| `ChangeResult` | `{ ok, new_path, moved, requires_restart }` | 경로 변경 결과 |

### 주요 동작

| 동작 | 설명 |
|------|------|
| 정보 조회 | `GET /api/system/vault-info` → `VaultInfo` 표시 |
| 경로 변경 | 새 경로 입력 + 데이터 이동 여부 체크박스 → `POST /api/system/change-vault` |
| 재시작 필요 | `requires_restart=true` 시 안내 메시지 |

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
| 복사 | 전체 로그 클립보드 복사 → 1.5초 후 원복 |
