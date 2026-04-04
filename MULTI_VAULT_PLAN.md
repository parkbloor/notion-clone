# 멀티 볼트 기획서 (Multi-Vault Architecture)

> 작성일: 2026-03-29
> 확정 방향: vaults_root 하위 폴더 자동 스캔 방식

---

## 1. 핵심 원칙

| 원칙 | 설명 |
|------|------|
| Vault = 서브폴더 | vaults_root 안의 각 폴더가 독립 볼트 |
| 생성 = 탐색기 | 앱 밖에서 폴더 만들면 자동 인식 |
| 스캔 타이밍 | 설정 탭 열 때마다 vaults_root 스캔 |
| 재시작 불필요 | 런타임 vault 전환 (앱 재시작 없음) |
| 기존 데이터 보존 | 현재 vault → "기본" 볼트로 유지 |

---

## 2. 폴더 구조

```
E:\MyNotes\                  ← vaults_root (한 번만 지정)
  ├── 기본\                  ← 기존 데이터 그대로 마이그레이션
  │     ├── _index.nct
  │     └── {pageId}/content.nct
  ├── 업무\                  ← 탐색기에서 만든 빈 폴더 → 앱이 자동 인식
  └── 개인\                  ← 탐색기에서 만든 빈 폴더 → 앱이 자동 인식
```

---

## 3. vault_config.json 구조 변경

**변경 전:**
```json
{
  "vault_path": "C:\\Users\\user\\AppData\\Roaming\\NotionClone\\vault",
  "recent_vaults": [...]
}
```

**변경 후:**
```json
{
  "vaults_root": "E:\\MyNotes",
  "current_vault": "기본",
  "recent_vaults": ["기본", "업무"]
}
```

- `vaults_root`: 모든 볼트의 상위 폴더 (한 번만 지정)
- `current_vault`: 현재 활성 볼트 폴더명
- `recent_vaults`: 최근 사용 볼트 이름 목록

---

## 4. 볼트 스캔 로직

### 4.1 스캔 타이밍
- 설정 탭(StorageTab) 열 때마다 `/api/settings/vault-info` 호출
- 백엔드가 `vaults_root` 하위 폴더 목록 반환

### 4.2 스캔 결과 판단
```
vaults_root 하위 폴더 순회:
  _index.nct 있음 → 기존 볼트 (페이지 수 표시 가능)
  _index.nct 없음 → 새 볼트 (첫 진입 시 자동 초기화)
  파일만 있고 폴더 없음 → 무시
```

### 4.3 백엔드 응답 구조
```json
{
  "vaults_root": "E:\\MyNotes",
  "current_vault": "기본",
  "current_vault_path": "E:\\MyNotes\\기본",
  "vaults": [
    { "name": "기본",  "path": "E:\\MyNotes\\기본",  "page_count": 374, "initialized": true },
    { "name": "업무",  "path": "E:\\MyNotes\\업무",  "page_count": 0,   "initialized": false },
    { "name": "개인",  "path": "E:\\MyNotes\\개인",  "page_count": 12,  "initialized": true }
  ],
  "recent_vaults": ["기본", "업무"]
}
```

---

## 5. 볼트 전환 흐름

```
[설정 탭 열기]
  → GET /api/settings/vault-info
  → vaults_root 스캔 → 볼트 목록 표시

[볼트 선택 → "열기" 클릭]
  → POST /api/settings/switch-vault { vault_name: "업무" }
  → 백엔드: set_vault_dir(vaults_root / "업무")
            _index.nct 없으면 빈 구조로 자동 생성
            vault_config.json 즉시 저장
  → 프론트: pageStore.resetStore()
            fetchPages() + fetchCategories()
            사이드바/에디터 갱신
  → 토스트: "업무 볼트로 전환됐습니다"
```

---

## 6. 병합(Import) 동작 변경

### 기존
```
병합 → 전체 vault에 무조건 합쳐짐
```

### 변경 후
```
병합 옵션 2가지:

[현재 볼트에 병합]
  → 현재 활성 볼트에만 흡수 (볼트 내로 격리)

[새 볼트로 가져오기] ← 신규 추가
  → vaults_root/{폴더명}/ 생성
  → 가져온 데이터를 새 볼트에 배치
  → 현재 볼트 데이터 완전 무관
```

---

## 7. 마이그레이션 전략 (기존 데이터 보존)

```
앱 최초 업데이트 시:
  1. vaults_root 미설정 상태 감지
  2. 기존 vault_path → vaults_root = 부모 폴더
                        current_vault = "기본"
  3. 기존 vault 폴더명을 "기본"으로 rename (또는 그대로 유지)
  4. vault_config.json 새 구조로 저장
  → 데이터 손실 없음, 사용자 체감 변화 없음
```

---

## 8. UI 설계 (StorageTab)

```
┌────────────────────────────────────────────┐
│ Vault 관리                                  │
│                                             │
│ Vault 루트 폴더                             │
│ [E:\MyNotes          ] [📂 변경]            │
│                                             │
│ 볼트 목록 (탐색기에서 폴더 추가 가능)        │
│ ┌──────────────────────────────────────┐   │
│ │ 🟢 기본     374페이지    (현재)       │   │
│ │ ○  업무      0페이지    [열기]        │   │
│ │ ○  개인     12페이지    [열기]        │   │
│ └──────────────────────────────────────┘   │
│ 💡 탐색기에서 루트 폴더 안에 새 폴더를      │
│    만들면 자동으로 볼트로 인식됩니다         │
│                      [🔄 목록 새로고침]     │
└────────────────────────────────────────────┘
```

---

## 9. 구현 순서

| 순서 | 파일 | 작업 |
|------|------|------|
| 1 | `backend/core.py` | `get_vault_dir()` / `set_vault_dir()` 추가, `_current_vault_dir` 전역 변수화 |
| 2 | `backend/routers/*.py` (9개) | `VAULT_DIR` → `get_vault_dir()` 전수 치환 |
| 3 | `backend/routers/system.py` | `vault-info` 엔드포인트 (스캔), `switch-vault` 수정 |
| 4 | `src/store/pageStore.ts` | `resetStore()` 액션 추가 |
| 5 | `src/components/settings/tabs/StorageTab.tsx` | 새 UI + 전환 로직 |
| 6 | `backend/routers/export_import.py` | "새 볼트로 가져오기" 엔드포인트 추가 |
| 7 | `src/components/settings/tabs/DataTab.tsx` | 병합 옵션 2가지 UI |
| 8 | `src/locales/ko.ts` / `en.ts` | 신규 문자열 추가 |

---

## 10. 영향 없는 것들

- 페이지 편집, 카테고리, 블록 등 모든 콘텐츠 로직
- AI, 검색, 히스토리, 휴지통 등 기능별 라우터 (경로만 동적화)
- Electron 패키징 방식
- Cloud Sync (별도 기획)