# 스크롤 멈춤 디버그 핸드오프

**작성일**: 2026-05-16
**작성자**: Claude Opus 4.7 (1M context) 세션
**환경**: macOS / Chrome (DevTools 148) / localhost:3000 / dev 서버
**현재 상태**: 미해결. JS 스크롤은 되는데 마우스 휠로는 화면이 안 움직임.

---

## 📌 한 줄 요약

홈(`/`) 페이지에서 마우스 휠로 스크롤이 안 됨. `window.scrollTo()` JS 호출은 정상 동작하고 `scrollY` 값도 갱신되지만 사용자 눈에는 화면이 안 내려가는 것처럼 보임. 시크릿 창에서도 재현.

---

## 🔍 증상

- URL: `http://localhost:3000/`
- 콘텐츠는 viewport 보다 길게 존재 (`scrollHeight: 2223`, `innerHeight: 873`, `hasOverflow: true`)
- 마우스 휠 굴려도 화면이 정지된 것처럼 보임
- JS로 `window.scrollTo(0, 500)` 호출 시 `scrollY: 500` 으로 갱신됨 (== 스크롤 자체는 작동)
- 시크릿 창에서도 동일 (extension/SW/storage 영향 배제)
- `localStorage` 클리어 + 재로그인 시도해도 동일
- Next.js `.next` 캐시 미삭제 상태

---

## ⏱ 타임라인 (발생 → 해결 순)

### 1. Supabase Navigator Lock 타임아웃 (✅ 해결)

```
Uncaught (in promise) NavigatorLockAcquireTimeoutError:
Acquiring an exclusive Navigator LockManager lock
"lock:sb-ihqztsakxczzsxfvdkpq-auth-token" timed out waiting 10000ms
    at SupabaseAuthClient.navigatorLock (locks.ts:193)
    at SupabaseAuthClient._acquireLock (GoTrueClient.ts:1526)
    at GoTrueClient.ts:2241
    at async PuzzleList.useEffect (PuzzleList.tsx:150)
```

- 8회 연쇄 발생 → `supabase.auth.getUser()` 전반 정체
- 해결: `src/lib/supabase/client.ts` 에 `auth.lock` no-op 주입.
- 커밋: `a0c7eea fix(supabase): Web Locks API 비활성으로 lock timeout 정체 해소`
- 적용 후 lock 에러 사라짐 ✅

### 2. useCurrentUser timeout (위와 동일 원인, ✅ 해소)

```
[useCurrentUser] auth.getUser timeout/error: Error: auth.getUser timeout after 5000ms
    at useCurrentUser.ts:43
[useCurrentUser] hard timeout — 강제 loading 해제
    at useCurrentUser.ts:92
```

- 8회 반복 → `lock` 풀린 뒤 자동 해소

### 3. Auth session missing (정상 — 로그아웃 상태)

```
[useCurrentUser] auth.getUser 실패: Auth session missing!  ← useCurrentUser.ts:38
```

- `localStorage` 클리어 후 비로그인 상태에서 정상 발생
- 재로그인하면 사라짐

### 4. DialogContent 접근성 Warning (무관)

```
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
    at sheet.tsx:60
```

- shadcn/ui Dialog/Sheet에 `Description` 누락. 스크롤과 무관.

### 5. AdSense 경고 (무관)

```
AdSense head tag doesn't support data-nscript attribute.
```

### 6. (잔존) 마우스 휠 스크롤 멈춤 ❌

위 1~3 해결 후에도 스크롤은 여전히 멈춤. 본 문서의 주제.

---

## 🧪 진단 결과 (콘솔 실행)

### A. body / html / dialog 상태

```js
console.log({
  open_dialogs: document.querySelectorAll('[data-state="open"]').length,
  body_overflow: getComputedStyle(document.body).overflow,
  body_position: getComputedStyle(document.body).position,
  html_overflow: getComputedStyle(document.documentElement).overflow,
  body_style: document.body.style.cssText,
  data_scroll_locked: document.body.getAttribute('data-scroll-locked'),
  pointer_events: getComputedStyle(document.body).pointerEvents,
})
```

결과:
```
{
  open_dialogs: 0,
  body_overflow: 'hidden auto',
  body_position: 'static',
  html_overflow: 'hidden auto',
  body_style: '',
  data_scroll_locked: null,
  pointer_events: 'auto'
}
```

- 열린 Sheet/Dialog 없음 (잠금 아님)
- `overflow: hidden auto` → overflow-x: hidden, overflow-y: auto (정상)
- pointer-events 정상

### B. 콘텐츠 vs viewport

```js
console.log({
  scrollHeight: document.documentElement.scrollHeight,
  innerHeight: window.innerHeight,
  hasOverflow: document.documentElement.scrollHeight > window.innerHeight,
  scrollY: window.scrollY,
})
```

결과:
```
{ scrollHeight: 2223, innerHeight: 873, hasOverflow: true, scrollY: 0 }
```

### C. JS 스크롤 + wheel preventDefault 확인

```js
window.scrollTo(0, 500);
setTimeout(() => console.log('scrollY:', window.scrollY), 100)
// → scrollY: 500   ← JS 스크롤 동작
//   [scroll] target: undefined  defaultPrevented: false
//   [wheel]  target: DIV        defaultPrevented: false
```

- **JS scrollTo 는 정상 동작** (scrollY 갱신됨)
- wheel 이벤트도 발생하고 preventDefault 안 됨
- 그런데 사용자 눈에는 화면이 안 움직임

---

## 🧩 결론 & 가설

진단상 다음이 사실:
- body 스크롤 잠금 없음
- 열린 모달 없음
- wheel preventDefault 없음
- JS 스크롤 동작 정상

그럼에도 휠로 화면이 안 움직임 → 다음 시나리오 의심:

### 가설 1: 콘텐츠가 fixed/transform 컨테이너 안에 들어있음
window 스크롤은 진행되지만 사용자가 보는 콘텐츠 영역이 `position: fixed` 또는 `transform: translateY()` 컨테이너로 viewport 에 못박힘 → 시각적으로 안 움직임.

### 가설 2: 다른 wheel 핸들러가 화면 콘텐츠를 자체 처리
e.g. 가상 스크롤 라이브러리, Canvas 캡쳐, 또는 Header/BottomNav 같은 fixed 요소가 wheel 을 자체 처리. 휠 이벤트 자체는 dispatch 되고 preventDefault 안 되지만 별도 컨테이너 스크롤로 위임.

### 가설 3: Next.js HMR/dev 빌드 캐시 깨짐
4bda3de 커밋(가로 흔들림 방지) 적용 후 HMR 거치며 globals.css/layout 상태가 꼬임. `.next` 캐시 클리어로 풀릴 가능성.

가설 1/2 가 가장 유력 (시크릿 창에서도 재현 = 환경 문제 아님).

---

## 🛠 시도된 해결 (효과 없음)

1. `document.body.style.overflow = ''`, `document.documentElement.style.overflow = ''` → 변화 없음
2. `document.querySelectorAll('[role="dialog"]').forEach(el => el.remove())` → 변화 없음
3. `localStorage` + `sessionStorage` 클리어 + reload → 스크롤 여전
4. 시크릿 창에서 접속 → 동일 증상
5. DevTools 모바일 에뮬레이터 off 확인 필요 (사용자가 직접 확인 안 함)
6. Supabase lock 비활성 (commit a0c7eea) → lock 에러는 풀렸지만 스크롤은 별개

---

## 🚧 의심 코드 위치

### 최근 변경 (4bda3de fix(ux): 가로 흔들림 방지)

[`src/app/globals.css`](nightflow/src/app/globals.css)
```css
html {
  overflow-x: hidden;
}
body {
  overflow-x: hidden;
  overscroll-behavior-y: none;
}
```

[`src/app/(main)/layout.tsx`](nightflow/src/app/(main)/layout.tsx)
```jsx
<PullToRefresh onRefresh={handleRefresh}>
  <div className="min-h-screen bg-neutral-950 flex flex-col">
    <Header />
    <main className="flex-1 pb-16">{children}</main>
    <Footer />
    <BottomNav />
    <SelectingFlagAlertSheet />
    <CancellationSurveySheet isOtherSheetOpen={false} />
  </div>
</PullToRefresh>
```

[`src/components/auctions/PullToRefresh.tsx`](nightflow/src/components/auctions/PullToRefresh.tsx)
- `useEffect` 에서 `document.documentElement.style.overscrollBehavior = "none"` 강제 적용
- `touchstart/touchmove/touchend` 전역 리스너 (passive: false 인 touchmove 가 `preventDefault` 호출)
- 데스크탑 wheel 에는 직접 영향 없는 것으로 보이나 의심.

### 다른 채팅 작업물 (격리 중, 같이 영향 가능)

- `src/components/puzzles/CancellationSurveySheet.tsx` — `usePendingCancellationSurvey` 훅이 survey 반환하면 닫을 방법이 없는 Sheet 가 영원히 열림. 다만 진단 시점에 `open_dialogs: 0` 이므로 현재 케이스에는 무관.
- `src/components/puzzles/PuzzleCard.tsx` — MusicPref 추가, role 분기 — 스크롤 무관.
- 새 마이그레이션 5개(172/173/175/176/177) — DB 관련, 스크롤 무관.

---

## 🔬 다음 진단 추천 (재개 시 이걸 먼저)

콘솔에서 차례대로 실행 후 결과 캡쳐:

### 1) 모바일 에뮬레이터 on/off 확인
```js
console.log('maxTouchPoints:', navigator.maxTouchPoints,
            'userAgent:', navigator.userAgent.includes('Mobile'))
```
- maxTouchPoints > 0 이고 userAgent 에 Mobile 이 있으면 에뮬레이터 켜진 상태 → wheel 이벤트가 터치로 변환되어 PullToRefresh 에서 가로채는 중일 수 있음

### 2) 스크롤 후 실제 viewport 표시 영역 변화 확인
```js
const before = document.elementFromPoint(100, 400)?.outerHTML?.slice(0, 100)
window.scrollTo(0, 500)
await new Promise(r => setTimeout(r, 150))
const after = document.elementFromPoint(100, 400)?.outerHTML?.slice(0, 100)
console.log({ before, after, same: before === after })
```
- same: true → 같은 요소가 그대로 → fixed 컨테이너가 viewport 점유 (가설 1 확정)
- same: false → 화면은 실제로 움직임 → 사용자 체감 vs 실제 차이 점검 필요

### 3) 화면을 덮는 fixed/sticky 큰 요소 찾기
```js
Array.from(document.querySelectorAll('*'))
  .filter(el => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return (cs.position === 'fixed' || cs.position === 'sticky')
           && r.height > 300 && r.width > 300
  })
  .map(el => ({
    tag: el.tagName,
    cls: String(el.className).slice(0, 80),
    pos: getComputedStyle(el).position,
    z: getComputedStyle(el).zIndex,
    h: el.getBoundingClientRect().height,
    w: el.getBoundingClientRect().width,
  }))
```
- 결과에 root 가까운 큰 fixed 컨테이너 있으면 그것이 콘텐츠 점유 중

### 4) PullToRefresh 비활성 테스트
[`src/app/(main)/layout.tsx`](nightflow/src/app/(main)/layout.tsx) 에서 `<PullToRefresh>` wrapper 잠깐 제거 후 dev 서버 재시작 → 동작 확인. 풀리면 PullToRefresh 가 범인.

### 5) Next.js 캐시 + dev 서버 리셋
```bash
cd "/Users/gimmingi/project 1/nightflow"
rm -rf .next
npm run dev
```

---

## 📦 관련 커밋 / 파일

**최근 푸시된 commit** (Phase 3 club_partners 작업)
- `a0c7eea` fix(supabase): Web Locks API 비활성으로 lock timeout 정체 해소
- `bfdc7c4` refactor(api): MD 권한 검증/조회 → club_partners 기반
- `e502d00` refactor(admin): admin 페이지 club_partners 조인
- `c47a84a` refactor(md): MD 페이지 club_partners 조인
- `c7e4b89` feat(db): club_partners Phase 3 (Migration 178)

**이전 의심 commit** (가로 흔들림 방지 — 스크롤 영향 가능)
- `4bda3de` fix(ux): 가로 흔들림 방지 + 퍼즐·클럽·경매 UI 개선

**의심 파일 (수정 순위)**
1. [`src/components/auctions/PullToRefresh.tsx`](nightflow/src/components/auctions/PullToRefresh.tsx)
2. [`src/app/globals.css`](nightflow/src/app/globals.css) — html/body overflow-x: hidden
3. [`src/app/(main)/layout.tsx`](nightflow/src/app/(main)/layout.tsx) — wrapper 구조
4. [`src/app/(main)/page.tsx`](nightflow/src/app/(main)/page.tsx) — 홈페이지 본문 (4bda3de 에서 변경됨)

---

## 💡 빠른 우회 옵션 (미시도)

- `.next` 캐시 삭제 + dev 서버 재기동
- `PullToRefresh` wrapper 한 번 빼고 동작 검증
- production build (`npm run build && npm start`) 로 dev/HMR 영향 배제
