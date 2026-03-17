# 🔍 NightFlow 모니터링 설정 가이드

모니터링 시스템을 활성화하기 위한 설정 가이드입니다.

---

## 📊 설치된 모니터링 도구

### 1. Sentry (에러 추적)
- **목적**: 프로덕션 에러 실시간 추적 및 알림
- **비용**: 무료 플랜 (월 5,000 에러/1개 프로젝트)
- **필수 여부**: 🔴 필수

### 2. Google Analytics 4 (유저 분석)
- **목적**: 사용자 행동 분석, 전환율 추적
- **비용**: 무료
- **필수 여부**: 🔴 필수

### 3. 커스텀 Logger (비즈니스 이벤트)
- **목적**: 입찰, 낙찰, 결제 등 핵심 이벤트 추적
- **비용**: 무료
- **필수 여부**: 🟡 권장

---

## 🚀 Step 1: Sentry 설정

### 1-1. Sentry 계정 생성

1. https://sentry.io 접속
2. "Start Free" 클릭
3. GitHub/Google 계정으로 가입

### 1-2. 프로젝트 생성

1. 대시보드에서 "Create Project" 클릭
2. Platform: **Next.js** 선택
3. Alert frequency: **On every new issue** (권장)
4. Project name: `nightflow` 입력
5. Team: Personal 또는 신규 생성
6. "Create Project" 클릭

### 1-3. DSN 복사

프로젝트 생성 후 표시되는 DSN을 복사합니다:

```
https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### 1-4. 환경변수 설정

`.env.local` 파일에 추가:

```bash
# Sentry DSN
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# Sentry 조직/프로젝트 (소스맵 업로드용, 선택사항)
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=nightflow
SENTRY_AUTH_TOKEN=your-auth-token
```

**Auth Token 발급 방법**:
1. Sentry → Settings → Account → API Tokens
2. "Create New Token" 클릭
3. Scopes: `project:releases`, `org:read` 선택
4. "Create Token" → 토큰 복사

### 1-5. 테스트

개발 서버 재시작 후 브라우저 콘솔에서:

```javascript
throw new Error("Sentry 테스트 에러");
```

Sentry 대시보드에서 에러가 표시되면 성공!

---

## 📈 Step 2: Google Analytics 4 설정

### 2-1. GA4 계정 생성

1. https://analytics.google.com 접속
2. "측정 시작" 클릭
3. 계정 이름: `NightFlow` 입력
4. 속성 이름: `NightFlow Production` 입력
5. 시간대: **대한민국**, 통화: **대한민국 원(₩)**
6. 비즈니스 정보 입력 (업종: 인터넷/전자상거래)

### 2-2. 데이터 스트림 생성

1. 속성 생성 후 "데이터 스트림" 클릭
2. 플랫폼: **웹** 선택
3. 웹사이트 URL: `https://nightflow.co` (프로덕션 도메인)
4. 스트림 이름: `웹` 입력
5. "스트림 만들기" 클릭

### 2-3. 측정 ID 복사

생성된 스트림에서 **측정 ID** 복사:

```
G-XXXXXXXXXX
```

### 2-4. 환경변수 설정

`.env.local` 파일에 추가:

```bash
# Google Analytics 4
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

### 2-5. 향상된 측정 활성화 (권장)

1. 데이터 스트림 → "향상된 측정" 클릭
2. 다음 항목 활성화:
   - ✅ 페이지 조회수
   - ✅ 스크롤
   - ✅ 이탈 클릭
   - ✅ 사이트 검색
   - ✅ 동영상 참여
   - ✅ 파일 다운로드

### 2-6. 전환 이벤트 설정

1. 관리 → 이벤트 → "전환 이벤트 만들기"
2. 다음 이벤트를 전환으로 표시:
   - `purchase` (결제 완료)
   - `bid_placed` (입찰)
   - `auction_won` (낙찰)

### 2-7. 테스트

1. 개발 서버 재시작
2. 브라우저에서 사이트 접속
3. GA4 → 보고서 → 실시간 → 현재 사용자 확인

---

## 🛠 Step 3: 커스텀 Logger 사용법

### 3-1. 기본 사용법

```typescript
import { logger } from '@/lib/monitoring/logger';

// 일반 로그
logger.info('User logged in', { userId: '123' });
logger.warn('Slow query detected', { duration: 5000 });
logger.error('Payment failed', { error: 'Card declined' });

// 비즈니스 이벤트
logger.business.bidPlaced('auction-123', 'user-456', 150000);
logger.business.auctionWon('auction-123', 'user-456', 180000);
logger.business.paymentCompleted('tx-789', 180000, 'toss-key-xxx');
```

### 3-2. 이벤트 종류

| 이벤트 | 설명 | 파라미터 |
|--------|------|---------|
| `auctionCreated` | 경매 생성 | auctionId, mdId, clubName |
| `bidPlaced` | 입찰 | auctionId, bidderId, amount |
| `auctionWon` | 낙찰 | auctionId, winnerId, finalPrice |
| `paymentCompleted` | 결제 완료 | transactionId, amount, paymentKey |
| `paymentFailed` | 결제 실패 | transactionId, error |
| `noShow` | 노쇼 | transactionId, userId |
| `userBlocked` | 유저 차단 | userId, reason |
| `mdApproved` | MD 승인 | mdId, approvedBy |
| `settlementProcessed` | 정산 처리 | mdId, amount, transactionCount |

### 3-3. 예시: 입찰 API에 로깅 추가

```typescript
// src/app/api/bids/route.ts
import { logger } from '@/lib/monitoring/logger';

export async function POST(request: Request) {
  try {
    const { auctionId, amount } = await request.json();

    // 입찰 처리
    const result = await placeBid(auctionId, amount);

    // 로그 기록
    logger.business.bidPlaced(auctionId, userId, amount);

    return Response.json(result);
  } catch (error) {
    logger.error('Bid placement failed', { auctionId, error });
    throw error;
  }
}
```

---

## 📊 Step 4: 대시보드 확인

### Sentry 대시보드

**URL**: https://sentry.io/organizations/your-org/issues/

**주요 지표**:
- ⚠️ 에러 발생 횟수
- 📈 에러 증가/감소 트렌드
- 👥 영향받은 유저 수
- 🔍 스택 트레이스 및 브레드크럼

**알림 설정**:
1. Alerts → "Create Alert Rule"
2. Condition: "When an event is seen"
3. Filter: "level:error"
4. Action: Email 또는 Slack
5. "Save Rule"

### Google Analytics 대시보드

**URL**: https://analytics.google.com

**주요 보고서**:
- **실시간**: 현재 접속자 수
- **획득**: 유입 경로 (검색, 직접 방문, 소셜)
- **참여도**: 페이지 조회, 세션 시간
- **수익 창출**: 구매 이벤트 (`purchase`)

**맞춤 보고서 생성**:
1. 탐색 → "빈 탐색"
2. 측정기준: 이벤트 이름
3. 측정항목: 이벤트 수
4. 필터: `bid_placed`, `auction_won`
5. "저장" → "입찰 분석"

---

## 🔧 문제 해결

### Sentry 에러가 기록되지 않음

1. DSN이 올바른지 확인: `.env.local`
2. 프로덕션 빌드 확인: `npm run build`
3. 브라우저 콘솔에서 Sentry 초기화 확인:
   ```javascript
   console.log(window.__SENTRY__);
   ```

### Google Analytics 데이터가 표시되지 않음

1. 측정 ID 확인: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
2. 브라우저 애드블로커 비활성화
3. 24-48시간 대기 (데이터 처리 지연)
4. 실시간 보고서에서 현재 접속 확인

### 개발 환경에서 에러가 Sentry로 전송됨

`sentry.client.config.ts`의 `beforeSend`가 제대로 동작하는지 확인:

```typescript
beforeSend(event, hint) {
  if (process.env.NODE_ENV === "development") {
    console.error(hint.originalException);
    return null; // Sentry로 전송하지 않음
  }
  return event;
}
```

---

## 📋 체크리스트

### 필수 작업
- [ ] Sentry 계정 생성 및 프로젝트 추가
- [ ] Sentry DSN을 `.env.local`에 추가
- [ ] Google Analytics 4 계정 생성
- [ ] GA4 측정 ID를 `.env.local`에 추가
- [ ] 프로덕션 빌드 및 배포
- [ ] Sentry 대시보드에서 에러 확인
- [ ] GA4 실시간 보고서에서 트래픽 확인

### 권장 작업
- [ ] Sentry 알림 설정 (Slack/Email)
- [ ] GA4 전환 이벤트 설정 (`purchase`, `bid_placed`)
- [ ] Sentry Source Maps 업로드 (Auth Token 설정)
- [ ] GA4 맞춤 보고서 생성 (입찰 분석, 결제 퍼널)
- [ ] 주간 모니터링 리뷰 일정 설정

---

## 📞 지원

모니터링 설정 관련 문의:
- Sentry 공식 문서: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- GA4 공식 문서: https://support.google.com/analytics/answer/9304153
- 고객센터: nightflow1@naver.com

---

**마지막 업데이트**: 2026-03-02
