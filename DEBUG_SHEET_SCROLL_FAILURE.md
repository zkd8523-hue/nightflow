# 외국인 주류선택 시트 스크롤 버그 — 실패 기록 및 가이드

작성일: 2026-09-07
작성자: Claude (실패 기록) → Claude (원인 규명·수정)
상태: **해결** — 원인은 `globals.css`의 `[lang="en"] * { overscroll-behavior: none }`

---

## 0. 결론 (2026-09-07 추가)

**원인**: `lang`은 wrapper `<div>`가 아니라 **`<html>`에 붙는다**
([app/layout.tsx](src/app/layout.tsx)의 `<html lang={htmlLang}>`, `?lang=` 쿼리로도 결정).
따라서 `[lang="en"] *`는 "en 트랙 페이지 안"이 아니라 **문서 전체**에 매칭되고,
Radix가 `document.body`로 portal한 시트도 `<html>`의 자손이라 그대로 걸린다.
그 결과 시트에 `overscroll-behavior: none`이 얹혀 세로 스크롤이 죽었다.

**실측 검증**:
```
GET /flags/new?lang=en  →  <html lang="en"    ← 규칙 매칭 → 스크롤 죽음
GET /flags/new          →  <html lang="ko"    ← 규칙 미매칭 → 정상
```

**한국어가 정상이었던 진짜 이유**: 3번 표의 다섯 가지 차이 중 어느 것도 아니었다.
그냥 `<html lang="ko">`라서 규칙이 **아예 매칭되지 않았을 뿐**이다.

**수정**: [globals.css](src/app/globals.css)의 `[lang]` 규칙에서 시트 서브트리를 제외.
```css
[lang="en"] *:not([data-slot="sheet-content"], [data-slot="sheet-content"] *), ... {
  overscroll-behavior: none;
}
```
시트가 곧 스크롤 컨테이너이므로 시트 자신과 자손을 **둘 다** 빼야 한다.
시트에 필요한 오버스크롤 차단은 SheetContent에 직접 붙은 `overscroll-contain`이 담당한다.

**왜 9번을 헛짚었나 — 문서화된 전제가 틀렸다.**
`globals.css` 주석에 이렇게 적혀 있었다:
> "[lang="en"] 스코프를 걸면 안 된다 — Radix는 body로 portal되는데 lang wrapper
> (`<div lang="en">`)는 body의 자식일 뿐이라 시트는 lang 셀렉터에 애초에 안 걸린다"

이 문장 때문에 `[lang]` 규칙이 처음부터 용의선상에서 제외됐다.
`/en/*`에는 실제로 `<div lang="en">` wrapper가 있어([en/layout.tsx](src/app/en/layout.tsx))
주석이 부분적으로 맞아 보였지만, `/flags/new?lang=en`은 그 트리 밖이라
**`<html lang>`으로만 걸리고 그건 portal이 탈출할 수 없다.**
→ 주석은 정정 완료. 같은 함정을 세 번째 밟지 않기 위해 "이건 틀린 설명"이라고 명시해 남김.

**회귀 시점**: `2d45de72`(규칙 추가, 당시엔 div wrapper뿐이라 시트에 무해)
+ `e9e89957`("fix html lang leak", `?lang=` 쿼리로도 `<html lang>` 변경)의 **조합**.
각 커밋은 타당했고 한쪽만 읽어서는 보이지 않는 종류였다.

**`FORCED-FAIL` 해석 정정**: "스크롤 박스로 성립 안 함"은 과잉 해석이었다.
`scrollH 931 > clientH 685`는 **스크롤 박스로 정상 성립했다는 증거**다.
`overscroll-behavior: none` 상태에서 진행 중인 터치 제스처를 브라우저가 붙잡고 있어
같은 tick의 `scrollTop` 대입이 되돌아온 것. 이 오해가 수색 방향을
containing block·레이아웃 쪽으로 틀어놨다.

---

> 아래는 당시 실패 기록 원본이다. 수정하지 않고 그대로 남긴다.

---

## 1. 문제

`/flags/new?lang=en` → "Choose drinks" → 올라오는 술 목록 바텀시트에서
**세로 스크롤이 전혀 안 됨**. 손가락으로 밀어도 1px도 안 움직임.

- 탭(카테고리 전환, 드롭다운 펼치기)은 정상 동작
- 드래그 스크롤만 죽음
- 한국어 예약 폼(`/clubs/[id]` → 예약하기 → 주류 선택)의 **같은 컴포넌트는 정상**

관련 파일:
- 시트: `src/components/foreign/ForeignRequestForm.tsx` (술 메뉴 시트)
- 내용: `src/components/foreign/MenuPicker.tsx` (한국어와 공용)
- 한국어 쪽: `src/components/clubs/KoreanBookingForm.tsx`

---

## 2. 실측 데이터 (진단 배지로 확보 — 이게 유일하게 신뢰할 수 있는 근거)

시트에 임시 배지를 띄워 `getComputedStyle` + `scrollTop` 실측:

```
scrollH 931 / clientH 685 / top 1
overflowY auto   touch pan-x pan-y
body pos relative   overflow hidden   pointer-events none
MOVE top 1  (손가락 움직이는 동안에도 scrollTop 안 변함)
강제 scrollTop 대입 → FORCED-FAIL (대입해도 되돌아옴)
```

해석:
- `scrollH > clientH` → **스크롤할 내용은 존재함** (레이아웃으로 내용이 없는 게 아님)
- `overflowY: auto` → 스크롤 속성은 정상
- `touch-action: pan-x pan-y` → **세로 팬은 허용된 값** (그런데도 안 움직임)
- `body pointer-events: none` → Radix 모달 열린 정상 상태
- **`FORCED-FAIL`** → JS로 `scrollTop`을 강제 대입해도 되돌아옴
  = 터치 차단(preventDefault) 문제가 아니라 **그 요소가 스크롤 박스로 성립하지 않는 상태**

> ⚠️ 다음 사람에게: 여기서부터 시작하세요. 이 5줄이 오늘 2시간 중 유일한 성과입니다.
> 추측하지 말고 배지부터 다시 띄우세요. (배지 코드는 아래 6번 참고)

---

## 3. 한국어(정상) vs 외국인(버그) 차이

| | 한국어 (정상) | 외국인 (버그) |
|---|---|---|
| 폼 위치 | `ClubDetailContent` → `/clubs/[id]` | `ForeignRequestForm` → `/flags/new` |
| 폼 자체 | **바텀 시트 안** | 일반 페이지 |
| 술 메뉴 시트 | 시트 위에 시트 (중첩) | 페이지 위 단일 시트 |
| MenuPicker props | 환율/통화/최소금액 **없음** | `rates`·`fxAsOf`·`defaultCurrency`·`minAmount` **있음** |
| SheetContent className | (동일) | (동일) |
| PullToRefresh | `allowsPullToRefresh=false` → 리스너 미부착 | `/flags/new`가 `/^\/flags\/[^/]+$/`에 오매칭 → **부착됨** |

**아직 검증 안 된 유력 후보**: "폼이 시트 안이냐 페이지냐"의 차이.
한국어는 바깥 시트가 이미 스크롤 락을 잡은 상태에서 안쪽 시트가 열리고,
외국인은 페이지 위에 시트가 처음 열림. Radix/react-remove-scroll의
스크롤 락 동작이 이 두 경우에 다를 수 있음. **여기를 다음에 파야 함.**

---

## 4. 시도한 것들 — 전부 실패

| # | 가설 | 한 일 | 결과 |
|---|---|---|---|
| 1 | `overscroll-contain`이 약함 | `overscroll-none`으로 강화 (양쪽 시트) | ❌ |
| 2 | Android는 scrollTop=0일 때만 PTR 발동 | `onTouchStart`에서 scrollTop 1px 넛지 | ❌ (오히려 제스처 인식 방해 의심) |
| 3 | 클럽 선택 시트들에 `overscroll-contain` 누락 | 6곳 추가 | ❌ (이 건과 무관, 다만 그 자체는 타당) |
| 4 | `/flags/new`가 PTR 정규식에 오매칭 | `pathname !== "/flags/new"` 제외 추가 | ❌ (오매칭은 실재하나 원인 아님) |
| 5 | `data-no-pull-refresh` 매칭 실패 | "시트 열려있으면 PTR 전면 차단" 가드 추가 | ❌ |
| 6 | 세로 flex에서 `flex-1`이 높이를 죽임 | 목록 div `flex-1` → `lg:flex-1` | ❌ |
| 7 | `vh`가 실제 화면과 어긋남 | `h-[92vh]` → `h-[92dvh]` | ❌ |
| 8 | flex 컨테이너에 스크롤 겹침 | `SheetContent`는 `overflow-hidden`, 안쪽 래퍼가 스크롤 | ❌ |
| 9 | 전역 `.overflow-x-auto` touch-action이 시트 안까지 먹음 | 시트 안 예외 처리 (`:not([data-slot="sheet-content"] *)`) | ❌ |

### 실패에서 배운 것 (다시 하지 말 것)
- **`overscroll-behavior` 계열은 이 버그와 무관하다.** 1·2번으로 확인됨.
- **PullToRefresh(커스텀 JS)도 원인이 아니다.** 4·5번으로 확인됨.
  (단 `/flags/new` 정규식 오매칭은 실재하는 별개 버그 — 폼 입력 날아감 위험)
- **`FORCED-FAIL`이므로 "누가 preventDefault 한다"는 방향은 틀렸다.**
  9번은 이 사실을 알고도 다시 touch-action을 의심한 실수.
- **`scrollH > clientH`이므로 "내용이 안 넘쳐서 스크롤할 게 없다"도 틀렸다.**
  6번은 이 사실을 알고도 레이아웃을 의심한 실수.

---

## 5. 과거 동일 사고 (중요)

`c3f42ac1` — "MenuPicker 루트 touch-action 되돌림 — 목록 스크롤이 막혔다"

> 앞 커밋에서 루트에 touchAction: pan-y + overscrollBehaviorY를 걸었더니
> 목록이 위아래로 안 움직이고 배경만 스크롤됐다.
> 루트는 스크롤 컨테이너가 아니라서 touch-action을 걸면 안쪽 스크롤까지 같이 죽는다.

**교훈: 스크롤 컨테이너가 아닌 요소에 `touch-action`을 걸면 안쪽 스크롤이 죽는다.**
이 버그는 이번이 처음이 아니며, 같은 함정을 반복해서 밟고 있음.

---

## 6. 진단 배지 코드 (다음에 재사용)

`ForeignRequestForm.tsx`의 술 메뉴 `SheetContent`에 임시로 붙였던 코드:

```tsx
const [scrollDebug, setScrollDebug] = useState<string | null>(null);

<SheetContent
  onTouchStart={(e) => {
    const el = e.currentTarget;
    const elCs = getComputedStyle(el);
    const bodyCs = getComputedStyle(document.body);
    setScrollDebug(
      `START top ${el.scrollTop} scrollH ${el.scrollHeight} clientH ${el.clientHeight}` +
      ` | touch ${elCs.touchAction} of ${elCs.overflowY}` +
      ` | body ${bodyCs.position}/${bodyCs.overflow}`
    );
  }}
  onTouchMove={(e) => {
    const el = e.currentTarget;
    const before = el.scrollTop;
    el.scrollTop = before + 20;              // 강제 스크롤 시도
    const after = el.scrollTop;
    setScrollDebug(
      `native ${before} -> forced ${after} ${after !== before ? "FORCED-OK" : "FORCED-FAIL"}`
    );
  }}
>
  {scrollDebug && (
    <div className="fixed top-0 left-0 right-0 z-[999] bg-red-600 text-white text-[10px] p-1 pointer-events-none break-all">
      {scrollDebug}
    </div>
  )}
```

**판정 기준**
- `FORCED-OK` + 네이티브 안 움직임 → 누가 `touchmove`를 `preventDefault` 중
- `FORCED-FAIL` → 그 요소가 스크롤 박스로 성립 안 함 (← **이번 케이스**)
- `scrollH <= clientH` → 넘칠 내용 자체가 없음

---

## 7. 다음에 볼 것 (우선순위)

1. **`FORCED-FAIL`의 의미를 정면으로 파기.**
   `scrollHeight > clientHeight`인데 `scrollTop` 대입이 되돌아오는 조건이 뭔지.
   의심: 조상 중 `position: fixed` + `transform`/`filter`/`backdrop-filter`가
   만드는 containing block, 또는 `contain` 속성, 또는 Radix가 붙이는 인라인 스타일.
   → `SheetContent`의 **인라인 style 속성 전체를 덤프**해서 확인할 것.

2. **한국어에서 같은 배지를 띄워 수치를 비교.**
   정상 케이스의 `scrollH/clientH/FORCED` 값을 반드시 확보할 것.
   (오늘 이걸 안 해서 "한국어는 된다"는 말만 믿고 추측만 반복함)

3. **Radix 스택 상태 확인.**
   시트 열린 순간 `document.querySelectorAll('[data-slot="sheet-content"]').length`와
   각각의 `data-state`를 찍어볼 것. 외국인 쪽에 닫히다 만 시트가 남아있는지.

4. **최소 재현 페이지 만들기.**
   `/flags/new`에서 MenuPicker만 단독으로 띄우는 임시 라우트를 만들어
   환율 props / 페이지 구조 / PullToRefresh를 하나씩 빼며 이분 탐색.

---

## 8. 작업 방식에 대한 반성 (다음 사람에게)

이번에 2시간을 태운 이유:

1. **실측 없이 가설부터 고쳤다.** 9개 중 8개가 코드만 읽고 세운 추측이었고,
   진단 배지를 띄운 건 마지막이었다. **배지를 처음에 띄웠어야 했다.**
2. **"찾았다"고 9번 말했다.** 확신 없는 가설을 확신처럼 보고했다.
   근거가 실측이 아니면 "가설"이라고 말해야 한다.
3. **사용자에게 확인을 너무 많이 요청했다.** 매번 새로고침/테스트를 부탁하며
   책임을 넘겼다. 검증 수단을 스스로 확보했어야 한다.
4. **되돌리지 않고 쌓았다.** 실패한 수정을 그대로 둔 채 다음 수정을 얹어서
   나중엔 무엇이 원인이고 무엇이 내가 만든 부작용인지 구분이 안 됐다.
   **가설 하나 = 수정 하나 = 검증 하나, 실패하면 즉시 되돌릴 것.**

---

## 9. 현재 코드 상태

### 커밋되어 푸시된 것 (`424329d0`)
- 클럽 선택/상세 시트 6곳에 `overscroll-contain` 추가 — 이 버그와는 무관하나 그 자체로는 타당
- `sheet.tsx`에 `data-no-pull-refresh="strict"` (Gemini 작업)
- `globals.css` html/body overscroll + `.overflow-x-auto` 규칙 (Gemini 작업)
- `MenuPicker` 모바일 가로 칩 레이아웃 전환 (Gemini 작업)

### 미커밋 (내가 남긴 것)
- `(main)/layout.tsx` — `/flags/new`를 PTR 정규식에서 제외
  → **이건 실제 버그 수정이므로 살릴 가치 있음** (폼 입력 중 새로고침 방지)
- `PullToRefresh.tsx` — 시트 열려있으면 PTR 전면 차단 가드
  → 방어로는 타당하나 이 버그와는 무관
- `globals.css` — `.overflow-x-auto`에 시트 예외
  → 실패한 9번 시도. 되돌릴지 판단 필요
- `MenuPicker.tsx` — 목록 div `flex-1` → `lg:flex-1`
  → 실패한 6번 시도. 되돌릴지 판단 필요
- 술 메뉴 시트 두 곳(`ForeignRequestForm`/`KoreanBookingForm`)은
  **한국어 원래 상태로 복원 완료** (`overflow-y-auto overscroll-contain`, 진단 코드 제거)

> 그 외 다수 파일의 미커밋 변경은 Gemini 병렬 작업분이므로 건드리지 말 것.
