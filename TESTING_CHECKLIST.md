# 🧪 NightFlow MVP E2E 테스트 체크리스트

**최종 업데이트**: 2026-02-21
**테스트 환경**: Local Development → Supabase Production
**목표**: 프로덕션 배포 전 필수 검증 완료

---

## 📋 테스트 전 준비사항

### 환경변수 설정
- [ ] `.env.local` 파일 존재 확인
- [ ] Supabase 프로젝트 연결 확인
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` 설정
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` 설정
- [ ] Toss Payments 테스트 키 설정
  - [ ] `NEXT_PUBLIC_TOSS_CLIENT_KEY` 설정
  - [ ] `TOSS_SECRET_KEY` 설정
  - [ ] `TOSS_WEBHOOK_SECRET` 설정
- [ ] Kakao OAuth 설정 (선택사항)
  - [ ] `NEXT_PUBLIC_KAKAO_CLIENT_ID` 설정
- [ ] `NEXT_PUBLIC_APP_URL=http://localhost:3000` 설정

### 데이터베이스 준비
- [ ] Supabase 마이그레이션 실행 완료
- [ ] RLS 정책 활성화 확인
- [ ] 테스트용 시드 데이터 삽입
  - [ ] 클럽 1-2개
  - [ ] 활성 경매 1-2개
  - [ ] 테스트 유저 1-2개

---

## 🔐 1. 환경변수 검증 (보안)

### ✅ Task 1: 환경변수 누락 테스트
**목적**: 환경변수 누락 시 적절한 에러 발생 확인

**시나리오**:
1. `.env.local`에서 `NEXT_PUBLIC_TOSS_CLIENT_KEY` 주석 처리
2. 앱 재시작: `npm run dev`
3. 결제 페이지 접속 (예: `/checkout?auctionId=xxx`)

**기대 결과**:
- ❌ 앱이 에러 없이 실행되면 안 됨
- ✅ 콘솔 또는 화면에 명확한 에러 메시지 표시:
  ```
  Error: NEXT_PUBLIC_TOSS_CLIENT_KEY is not configured
  ```

**확인 완료**: [ ]

---

### ✅ Task 2: 환경변수 정상 동작 테스트
**목적**: 환경변수 정상 설정 시 결제 위젯 로드 확인

**시나리오**:
1. `.env.local`에서 모든 키 정상 설정
2. 앱 재시작: `npm run dev`
3. 활성 경매에 입찰 → 낙찰
4. 결제 페이지 접속

**기대 결과**:
- ✅ Toss Payments 위젯 정상 로드
- ✅ 카드사 선택 가능
- ✅ 결제 금액 표시 정확

**확인 완료**: [ ]

---

## 💳 2. 결제 플로우 검증

### ✅ Task 3: 정상 결제 플로우
**목적**: 입찰 → 낙찰 → 결제 → 확정 전체 플로우 동작 확인

**시나리오**:
1. 유저 로그인 (또는 테스트 계정)
2. 활성 경매 선택 (`status = 'active'`)
3. 입찰 (현재가 + 1만원)
4. 경매 종료 대기 (또는 수동 종료)
5. 낙찰 확인 (`status = 'won'`)
6. 결제 페이지 이동 (15분 타이머 시작)
7. Toss 테스트 카드로 결제
   - 카드번호: `4000-0000-0000-0000`
   - 유효기간: `12/30`
   - CVC: `123`
8. 결제 성공 페이지 확인

**기대 결과**:
- ✅ `auctions.status` → `paid`
- ✅ `transactions.payment_status` → `paid`
- ✅ `transactions.paid_at` → 현재 시간
- ✅ 성공 페이지에 예약 정보 표시
- ✅ "예약 내역 확인하기" 링크 동작

**확인 완료**: [ ]

---

### ✅ Task 4: 15분 결제 기한 만료 테스트
**목적**: 낙찰 후 15분 내 미결제 시 자동 취소 확인

**시나리오 A: 서버 사이드 검증 (success 페이지)**
1. 낙찰 후 결제 페이지 접속
2. **15분 대기** (또는 DB에서 `payment_deadline` 수동 변경)
3. 결제 시도

**기대 결과**:
- ✅ `/checkout/fail` 페이지로 리다이렉트
- ✅ 에러 메시지: "결제 시간이 만료되었습니다. (15분 초과)"
- ✅ `auctions.status` → `won` 유지 (fail 페이지에서 처리)

**시나리오 B: Edge Function 자동 취소 (expire-payments)**
1. 낙찰 후 15분 이상 방치
2. Edge Function 실행 대기 (5분마다 자동 실행)
3. DB 확인

**기대 결과**:
- ✅ `auctions.status` → `unsold` (재경매 가능)
- ✅ `transactions.payment_status` → `failed`
- ✅ 낙찰자의 `no_show_count` +1 증가
- ✅ `no_show_count >= 3` 시 `is_blocked = true`

**Edge Function 수동 실행 방법**:
```bash
# Supabase CLI 필요
supabase functions invoke expire-payments --no-verify-jwt
```

**확인 완료**: [ ]

---

### ✅ Task 5: 3회 노쇼 차단 테스트
**목적**: 3회 이상 미결제 시 계정 차단 확인

**시나리오**:
1. 테스트 유저로 3번 낙찰 → 15분 초과 미결제
2. Edge Function 3번 실행 (각 경매마다)
3. DB 확인: `users.no_show_count` = 3
4. 4번째 경매 입찰 시도

**기대 결과**:
- ✅ `users.is_blocked = true` 자동 설정
- ✅ 입찰 시도 시 차단 메시지 (RLS 정책 또는 앱 로직)
- ✅ 로그인은 가능하나 경매 참여 불가

**확인 완료**: [ ]

---

## 🔒 3. Webhook 보안 검증

### ✅ Task 6: Webhook 서명 검증 - 정상 케이스
**목적**: 유효한 서명으로 Webhook 호출 시 정상 처리

**시나리오**:
1. Toss Payments 테스트 환경에서 결제 완료
2. Webhook 엔드포인트 호출 확인 (Toss가 자동 호출)
3. 서버 로그 확인

**기대 결과**:
- ✅ 200 응답
- ✅ `auctions.status` → `paid` 업데이트
- ✅ 로그: `[Webhook] Payment confirmed: {auctionId}, Amount: {amount}`

**확인 완료**: [ ]

---

### ✅ Task 7: Webhook 서명 검증 - 무효 서명
**목적**: 무효한 서명으로 위조 Webhook 호출 시 거부

**시나리오**:
```bash
curl -X POST http://localhost:3000/api/webhooks/toss \
  -H "Content-Type: application/json" \
  -H "x-toss-webhook-signature: fake_signature_12345" \
  -d '{
    "eventType": "PAYMENT_CONFIRMATION_DONE",
    "data": {
      "orderId": "NF_test_123",
      "paymentKey": "fake_key",
      "totalAmount": 100000
    }
  }'
```

**기대 결과**:
- ✅ **401 Unauthorized** 응답
- ✅ 응답 본문: `{ "error": "Invalid signature" }`
- ✅ 로그: `Invalid webhook signature detected`
- ✅ DB 상태 변화 없음

**확인 완료**: [ ]

---

### ✅ Task 8: Webhook 금액 검증 - 불일치 케이스 (NEW!)
**목적**: 결제 금액이 낙찰가와 다를 시 거부 (수익 모델 보호)

**시나리오**:
1. 낙찰가 23만원 경매 생성
2. 악의적 Webhook 호출 (금액 1,000원으로 변조)

```bash
# 실제 낙찰가: 230,000원
# 변조된 금액: 1,000원

curl -X POST http://localhost:3000/api/webhooks/toss \
  -H "Content-Type: application/json" \
  -H "x-toss-webhook-signature: <valid_signature>" \
  -d '{
    "eventType": "PAYMENT_CONFIRMATION_DONE",
    "data": {
      "orderId": "NF_<auction_id>_123",
      "paymentKey": "test_key",
      "totalAmount": 1000
    }
  }'
```

**기대 결과**:
- ✅ **400 Bad Request** 응답
- ✅ 응답 본문:
  ```json
  {
    "error": "Payment amount mismatch",
    "expected": 230000,
    "received": 1000
  }
  ```
- ✅ 로그: `[Webhook] Payment amount mismatch! Expected: 230000, Received: 1000, AuctionID: xxx`
- ✅ DB 상태 변화 없음 (paid로 업데이트되지 않음)

**확인 완료**: [ ]

---

## ⏱️ 4. 경매 자동 종료 검증

### ✅ Task 9: 경매 시간 종료 자동 처리
**목적**: `auction_end_at` 도래 시 자동 종료 및 낙찰 처리

**시나리오**:
1. 테스트 경매 생성 (`auction_end_at` = 현재 + 2분)
2. 2분 대기 (또는 DB에서 `auction_end_at` 수동 변경)
3. Edge Function 실행 대기 (5분마다 자동)

**기대 결과**:
- ✅ 입찰 있음: `status` → `won`, `winner_id` 설정
- ✅ 입찰 없음: `status` → `unsold`
- ✅ `payment_deadline` = 현재 + 15분 (낙찰 시)
- ✅ `transaction` 레코드 생성 (낙찰 시)

**Edge Function 수동 실행**:
```bash
supabase functions invoke close-expired-auctions --no-verify-jwt
```

**확인 완료**: [ ]

---

### ✅ Task 10: 경매 자동 연장 (마감 5분 전 입찰)
**목적**: 마감 5분 전 입찰 시 +5분 자동 연장

**시나리오**:
1. 경매 생성 (`auction_end_at` = 현재 + 6분)
2. 5분 대기
3. 입찰 (남은 시간 1분)
4. `extended_end_at` 확인

**기대 결과**:
- ✅ `extended_end_at` = 기존 `auction_end_at` + 5분
- ✅ UI 타이머가 연장된 시간 반영
- ✅ 연장 후 5분 전 재입찰 시 재연장

**확인 완료**: [ ]

---

## 🎨 5. UX/UI 검증 (모바일 최적화)

### ✅ Task 11: 경매 카드 디자인 검증
**목적**: 정가 취소선 제거 및 중립적 표현 확인 (전략적 정합성)

**시나리오**:
1. 메인 페이지 접속 (`/`)
2. 경매 카드 하단 확인

**기대 결과**:
- ✅ 정가 표시: `참고가 ₩230,000` (취소선 없음)
- ✅ 현재가: `250,000원` (굵게 표시)
- ✅ 입찰 횟수: `입찰 12회`
- ❌ 할인율 표시 없음 (예: `-13%` 등)

**확인 완료**: [ ]

---

### ✅ Task 12: 15분 결제 타이머 UI
**목적**: 결제 페이지에서 15분 카운트다운 정확도 확인

**시나리오**:
1. 낙찰 후 결제 페이지 접속
2. 타이머 관찰 (1-2분)

**기대 결과**:
- ✅ 타이머 형식: `14:59`, `14:58`, ...
- ✅ 5분 미만: 빨간색 경고 (animate-pulse)
- ✅ 0초 도달: "결제 시간 만료" 버튼 비활성화
- ✅ dayjs 기반 정밀 계산 (초 단위 정확)

**확인 완료**: [ ]

---

### ✅ Task 13: 실시간 업데이트 (Realtime)
**목적**: 다른 유저 입찰 시 즉시 반영

**시나리오**:
1. 브라우저 A: 경매 상세 페이지 열기
2. 브라우저 B: 동일 경매에 입찰
3. 브라우저 A 확인

**기대 결과**:
- ✅ 현재가 즉시 업데이트 (새로고침 없이)
- ✅ 입찰 히스토리 실시간 추가
- ✅ 타이머 연장 반영 (5분 전 입찰 시)

**확인 완료**: [ ]

---

## 👨‍💼 6. MD 대시보드 검증

### ✅ Task 14: MD 매출/정산 정보
**목적**: MD 대시보드에서 매출 통계 정확도 확인

**시나리오**:
1. MD 계정 로그인
2. `/md/earnings` 접속
3. 테스트 결제 완료 후 새로고침

**기대 결과**:
- ✅ 낙찰가: 230,000원 → 수수료 (7%): 16,100원
- ✅ MD 정산액: 213,900원
- ✅ 총 매출 누적 정확
- ✅ 미정산/정산완료 분리 표시

**확인 완료**: [ ]

---

### ✅ Task 15: MD 예약 관리 및 현장 확인
**목적**: MD가 현장 확인 버튼으로 예약 완료 처리

**시나리오**:
1. MD 대시보드 → `/md/transactions`
2. `status = 'paid'` 예약 선택
3. "현장 확인 완료" 버튼 클릭

**기대 결과**:
- ✅ `auctions.status` → `confirmed`
- ✅ `transactions.confirmed_at` → 현재 시간
- ✅ 정산 가능 상태로 전환

**확인 완료**: [ ]

---

## 🚨 7. 프로덕션 배포 전 최종 체크

### 환경변수 교체
- [ ] Toss Payments 테스트 키 → **프로덕션 키**
- [ ] Supabase 로컬 → **프로덕션 프로젝트**
- [ ] Kakao OAuth 테스트 앱 → **프로덕션 앱**
- [ ] `NEXT_PUBLIC_APP_URL` → 실제 도메인

### Edge Functions 배포
- [ ] `close-expired-auctions` 배포 완료
- [ ] `expire-payments` 배포 완료
- [ ] Cron 스케줄 활성화 확인

### 보안 체크리스트 최종 확인
- [x] Webhook 서명 검증 (HMAC-SHA256) ✅
- [x] Webhook 결제 금액 검증 ✅ (NEW!)
- [x] 서버 사이드 결제 기한 검증 ✅
- [x] 환경변수 fallback 제거 ✅
- [x] RLS 정책 활성화 ✅

### 법적 문서 (외부 의뢰)
- [ ] 이용약관 작성 및 게시
- [ ] 개인정보처리방침 작성 및 게시
- [ ] 사업자 정보 표시

---

## 📊 테스트 결과 요약

**테스트 일자**: ___________
**테스트 환경**: Local / Staging / Production
**전체 항목**: 15개
**통과**: ___개
**실패**: ___개
**비고**:

---

## 🎯 런칭 가능 여부 판단 기준

### 필수 통과 항목 (7개)
- [ ] Task 2: 환경변수 정상 동작
- [ ] Task 3: 정상 결제 플로우
- [ ] Task 6: Webhook 서명 검증
- [ ] Task 8: Webhook 금액 검증 (NEW!)
- [ ] Task 9: 경매 자동 종료
- [ ] Task 11: 정가 취소선 제거
- [ ] Task 14: MD 매출 정확도

**런칭 가능**: 필수 7개 + 환경변수 프로덕션 교체 + 법적 문서 게시

---

## 🔧 트러블슈팅

### 자주 발생하는 오류

**1. Webhook 서명 검증 실패**
- 원인: `TOSS_WEBHOOK_SECRET` 불일치
- 해결: Toss Payments 개발자센터에서 재확인

**2. 결제 기한 만료 감지 안 됨**
- 원인: Edge Function 미배포 또는 Cron 미설정
- 해결: `supabase/config.toml` 확인 및 재배포

**3. 실시간 업데이트 안 됨**
- 원인: Supabase Realtime 미활성화
- 해결: `supabase/migrations/001_initial_schema.sql` 확인
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
  ALTER PUBLICATION supabase_realtime ADD TABLE bids;
  ```

**4. MD 정산 금액 불일치**
- 원인: 수수료율 변경 (7% vs 10%)
- 해결: `transactions.platform_fee_rate` 확인

---

## 📞 긴급 연락처

**백엔드 이슈**: Supabase Support
**결제 이슈**: Toss Payments 고객센터
**인증 이슈**: Kakao Developers

---

**테스트 완료 시**: 이 체크리스트를 CLAUDE.md에 업데이트하고, 배포 가이드로 전환하세요!
