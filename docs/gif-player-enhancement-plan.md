# GIF 플레이어 고도화 계획서

> 파일: `src/components/editor/ImageBlock.tsx`
> 현황: 재생/정지, 이전/다음 프레임, 프레임 카운터까지 구현 완료
> 목표: 프레임 스크러버·속도 조절·루프 토글·첫/끝 프레임 점프 추가

---

## 1. 현재 컨트롤 바 구조

```
[ |< ]  [ ▶/⏸ ]  [ >| ]   3 / 24
 이전       재생      다음   카운터
```

**한계:**
- 프레임 수가 100장 이상이면 일일이 버튼으로 이동 불가
- 재생 속도 고정 (GIF 원본 delay 준수, 최소 50ms)
- 루프 여부 선택 불가 (현재 무한 루프 고정)
- 첫 프레임/마지막 프레임으로 한 번에 이동 불가

---

## 2. 목표 컨트롤 바 구조

```
[ ⏮ ]  [ |< ]  [ ▶/⏸ ]  [ >| ]  [ ⏭ ]   🔁  0.5× 1× 2×
 처음    이전       재생      다음   끝      루프  속도 선택

[━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━]   12 / 48  (320ms)
             ↑ 프레임 스크러버 (range input)
```

---

## 3. 변경사항 상세

### 3-1. 새 상태 (useState / useRef)

| 변수 | 타입 | 초기값 | 역할 |
|------|------|--------|------|
| `speedMultiplier` | `number` | `1` | 재생 속도 배수 (0.5 / 1 / 2) |
| `isLooping` | `boolean` | `true` | 루프 여부 |

`speedMultiplier`는 ref도 함께 유지 (RAF 클로저에서 최신값 접근)

### 3-2. `animationLoop` 수정

현재:
```ts
const delay = Math.max(frame.delay || 100, 50)
if (timestamp - lastFrameTimeRef.current >= delay) { ... }
```

변경:
```ts
const rawDelay = frame.delay || 100
const delay = Math.max(rawDelay / speedMultiplierRef.current, 10)
if (timestamp - lastFrameTimeRef.current >= delay) {
  const nextIdx = frameIdxRef.current + 1
  if (nextIdx >= frames.length) {
    if (!isLoopingRef.current) { stopAnimation(); return }
    nextIdx = 0
  }
  ...
}
```

### 3-3. 첫/끝 프레임 점프 핸들러

```ts
function handleJumpToFirst() {
  stopAnimation()
  frameIdxRef.current = 0
  setCurrentFrameIdx(0)
  renderFrame(gifFrames, 0, null)
}

function handleJumpToLast() {
  stopAnimation()
  const lastIdx = gifFrames.length - 1
  frameIdxRef.current = lastIdx
  setCurrentFrameIdx(lastIdx)
  renderFrame(gifFrames, lastIdx, null)
}
```

### 3-4. 스크러버 (range input)

```tsx
<input
  type="range"
  min={0}
  max={gifFrames.length - 1}
  value={currentFrameIdx}
  onChange={(e) => {
    const idx = Number(e.target.value)
    stopAnimation()
    frameIdxRef.current = idx
    setCurrentFrameIdx(idx)
    renderFrame(gifFrames, idx, null)
  }}
  className="relative z-10 flex-1 h-1 accent-white cursor-pointer"
/>
```

### 3-5. 속도 토글 버튼 (0.5× / 1× / 2×)

```tsx
{([0.5, 1, 2] as const).map((s) => (
  <button
    key={s}
    onClick={() => { speedMultiplierRef.current = s; setSpeedMultiplier(s) }}
    className={`relative z-10 text-xs px-1.5 py-0.5 rounded transition-colors select-none
      ${speedMultiplier === s ? 'bg-white/40 text-white' : 'text-white/60 hover:bg-white/20'}`}
  >
    {s}×
  </button>
))}
```

### 3-6. 루프 토글 버튼

```tsx
<button
  onClick={() => { isLoopingRef.current = !isLooping; setIsLooping(v => !v) }}
  className={`relative z-10 w-7 h-7 flex items-center justify-center rounded transition-colors select-none
    ${isLooping ? 'text-white bg-white/20' : 'text-white/40 hover:bg-white/10'}`}
  title={isLooping ? '루프 끄기' : '루프 켜기'}
>
  {/* 🔁 루프 아이콘 SVG */}
</button>
```

### 3-7. 프레임 딜레이 표시

프레임 카운터 옆에 현재 프레임 원본 딜레이 표시:
```tsx
<span className="relative z-10 text-xs text-white/60 ml-1 tabular-nums">
  ({gifFrames[currentFrameIdx]?.delay ?? 0}ms)
</span>
```

---

## 4. UI 레이아웃 변경

### 현재 (1줄)
```
[ |< ]  [ ▶/⏸ ]  [ >| ]   3 / 24
```

### 변경 후 (2줄)
```
줄 1: [━━━━━━━━━━━●━━━━━━━━━━]   12 / 48  (320ms)
줄 2: [ ⏮ ] [ |< ] [ ▶/⏸ ] [ >| ] [ ⏭ ]   🔁   0.5× 1× 2×
```

컨트롤 바 래퍼:
```tsx
<div className="absolute bottom-0 left-0 right-0 flex flex-col px-2 py-1.5 ...">
  {/* 줄 1: 스크러버 + 카운터 */}
  <div className="flex items-center gap-2 mb-1">
    <input type="range" ... />
    <span>12 / 48</span>
    <span>(320ms)</span>
  </div>
  {/* 줄 2: 버튼들 */}
  <div className="flex items-center justify-center gap-1">
    ...
  </div>
</div>
```

---

## 5. i18n 추가 키

`src/locales/ko.ts` + `src/locales/en.ts`에 추가:

| 키 | 한국어 | English |
|----|--------|---------|
| `gifJumpFirst` | `처음으로` | `Jump to first` |
| `gifJumpLast` | `끝으로` | `Jump to last` |
| `gifLoopOn` | `루프 끄기` | `Disable loop` |
| `gifLoopOff` | `루프 켜기` | `Enable loop` |
| `gifScrubber` | `프레임 이동` | `Seek frame` |

---

## 6. 작업 순서

1. **상태 추가** — `speedMultiplier`, `isLooping`, 각각의 ref 추가
2. **`animationLoop` 수정** — 속도 배수 적용 + 루프 종료 처리
3. **핸들러 추가** — `handleJumpToFirst`, `handleJumpToLast`
4. **i18n 키 추가** — ko.ts / en.ts 동시 추가
5. **JSX 재구성** — 2줄 레이아웃 + 스크러버 + 속도 버튼 + 루프 버튼

---

## 7. 변경 없는 항목

- `renderFrame` 로직 — 변경 없음
- `loadParsedFrames` — 변경 없음
- `fetchArrayBuffer` — 변경 없음
- 리사이즈 핸들 — 변경 없음
- 업로드/캡션 — 변경 없음
