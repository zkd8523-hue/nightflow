# 퍼널 개편 시 주의: Google Ads 전환 추적이 걸려 있음

**작성일**: 2026-09-06
**대상**: 퍼널/화면 개편 작업자
**한 줄 요약**: `foreign_request_submitted` 라는 **이벤트 이름**과 `foreign_requests` 테이블의 **UTM 컬럼**을 깨뜨리면 광고비가 측정 불가 상태로 새어나갑니다.

---

## 왜 이 문서가 필요한가

2026-09-06에 Google Ads 전환 태그를 심었습니다 (커밋 `b27193dc`).

문제는 **이게 깨져도 아무 에러가 안 난다**는 점입니다. 빌드도 통과하고, 화면도 정상이고, GA4도 잘 돕니다. 그냥 **전환만 조용히 0건**이 됩니다. 그 상태로 광고를 켜면 돈은 나가는데 어떤 클릭이 성과인지 알 수 없습니다.

그래서 개편 중에 아래 두 가지만 확인해 주시면 됩니다.

---

## 🔴 절대 깨뜨리면 안 되는 것 1 — 이벤트 이름

`foreign_request_submitted` 라는 **문자열이 세 곳에서 정확히 일치**해야 합니다.

| # | 위치 | 역할 |
|---|---|---|
| 1 | `src/components/foreign/ForeignRequestForm.tsx:616` | 발사 (`trackForeignEvent("foreign_request_submitted", ...)`) |
| 2 | `src/lib/analytics/events.ts:34` | 매핑 (`ADS_CONVERSION_LABELS`) |
| 3 | Google Ads 콘솔 | 전환 액션 이름 (코드 밖) |

셋 중 하나라도 달라지면 전환이 끊깁니다.

### 개편 중 흔한 사고 패턴

```
❌ 폼을 새 컴포넌트로 교체하면서 trackForeignEvent 호출을 빠뜨림
❌ 이벤트 이름을 "request_submitted" / "flag_submitted" 등으로 바꿈
❌ 폼 제출 로직을 서버 액션으로 옮기면서 클라이언트 이벤트가 사라짐
   (gtag는 브라우저에서만 동작 — 서버에서는 못 쏨)
```

### ✅ 해도 되는 것

- 폼의 UI/디자인/필드 구성 변경 — 이벤트만 그대로면 무관
- 폼 파일 경로 이동, 컴포넌트 분리
- `trackForeignEvent` 의 두 번째 인자(params) 자유롭게 변경

### 이름을 꼭 바꿔야 한다면

`events.ts:34` 의 매핑 키만 새 이름으로 고치면 됩니다. **Google Ads 콘솔 쪽 전환 액션 이름은 안 바꿔도 됩니다** (콘솔 이름은 표시용이고, 실제 연결은 전환 라벨로 이뤄집니다).

```ts
// src/lib/analytics/events.ts
const ADS_CONVERSION_LABELS: Record<string, string | undefined> = {
  새_이벤트_이름: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL,
};
```

⚠️ 여기에 **아무 이벤트나 추가하지 마세요.** 모든 이벤트를 전환으로 쏘면 전환 개념이 오염되고 구글 입찰 최적화가 망가집니다. 실제 비즈니스 목표(= 요청 제출)만 등록합니다.

---

## 🔴 절대 깨뜨리면 안 되는 것 2 — UTM 배선

광고 유입이 `foreign_requests` 테이블에 기록되어야 "어느 채널이 실제 요청을 만들었나"를 볼 수 있습니다.

```
src/lib/analytics/userEvents.ts:211   getCurrentUtm()      ← UTM 읽기 (SSOT)
                ↓
src/components/foreign/ForeignRequestForm.tsx:590   const utm = getCurrentUtm();
                ↓
                :607   INSERT 시 utm_source/medium/campaign/landing_path 저장
```

새 폼에서도 **제출 시 `getCurrentUtm()` 을 호출해 4개 컬럼을 같이 INSERT** 해야 합니다.

- UTM 캡처 자체는 `localStorage` 기반이라 폼과 무관하게 동작합니다 — **새로 파싱 로직을 만들지 마세요.** `getCurrentUtm()` 을 그대로 재사용하면 됩니다.
- 컬럼은 이미 존재합니다 (Migration 643, 프로덕션 적용 완료).

---

## 개편 후 확인 방법 (2분)

**1. 이벤트가 실제로 나가는지**

배포 후 새 폼에서 요청을 한 번 제출하고, devtools Network 탭에서:

```
googleadservices.com/pagead/conversion   또는
google.com/pagead/1p-conversion
```

이 요청이 보이면 정상입니다.

**2. UTM이 저장되는지**

```sql
select created_at, lang, utm_source, landing_path
from foreign_requests
order by created_at desc limit 5;
```

`utm_source` 가 `null` 이 아니라 `direct` 또는 `google` 등으로 찍히면 정상입니다.

**3. 콘솔에서 (몇 시간~1일 뒤)**

Google Ads → 목표 → 전환 → `foreign_request_submitted` 상태가 **"전환 기록 중"** 이면 완료.

---

## 참고: 현재 설정값

```
전환 ID:    AW-18391139115
전환 라벨:   njbmCPeWme8cEKuGysFE
GA4:        G-Y7ET7RT5W0
```

환경변수는 Vercel(production/preview/development) 등록 완료. 값이 없으면 GA4만 동작하고 Ads 전환만 조용히 빠지도록 되어 있습니다.

**관련 파일** (개편 시 건드릴 일 없음, 참고용):
- `src/lib/analytics/google-analytics.tsx` — gtag.js 로드 + config 2개(GA4/Ads)
- `src/lib/analytics/events.ts` — `trackEvent` 에서 GA4·Mixpanel·user_events·Ads 전환 발사

---

## 배경: 왜 전환율이 중요한가

광고 집행 여부가 **전환율**에 달려 있어서, 개편의 성패가 그대로 광고 성립 여부가 됩니다.

**실측 (2026-09-06 기준, 개편 전)**
```
/en 30일 고유 방문자   909명
30일 요청              5건
전환율                 0.55%
```

**손익 계산** (수수료 5%, CPC 2,900원 가정)

| 지역 | 객단가 | 수수료 수익 | 본전 전환율 |
|---|---|---|---|
| 강남 | 100만원 | 50,000원 | **5.8%** |
| 홍대·이태원 | 50만원 | 25,000원 | 11.6% |

→ **목표 전환율 5%**. 현재의 9배입니다.
→ 홍대·이태원은 객단가가 낮아 검색광고로는 구조적 적자. 광고는 **강남 위주**로 갈 예정입니다.

개편 시 이 점을 감안해 주시면 좋겠습니다:
- 광고로 강남 유입을 사놓고 랜딩에서 홍대를 고르면, 광고비는 강남 단가로 쓰고 수익은 절반이 됩니다.

⚠️ CPC 2,900원은 **웹 조사값이지 실측이 아닙니다.** 실제 값은 캠페인 생성 시 키워드 플래너에서 확인 예정입니다.

---

## 요약 체크리스트

개편 완료 후 이것만 확인해 주세요:

- [ ] 새 요청 제출 지점에서 `trackForeignEvent("foreign_request_submitted", ...)` 가 호출되는가
  (이름을 바꿨다면 `events.ts:34` 매핑 키도 같이 수정)
- [ ] 제출 시 `getCurrentUtm()` 으로 UTM 4개 컬럼을 INSERT 하는가
- [ ] 이벤트 발사가 **클라이언트**에서 일어나는가 (서버 액션으로 옮기면 gtag 못 씀)
