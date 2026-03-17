# Gemini 교차검증 요청: Model B Pivot 코드-문서 정합성 복원

## 목표

NightFlow의 비즈니스 모델이 **Model A** (MD 수수료 10% + 토스페이먼츠 결제 중개)에서 **Model B** (결제 중개 완전 제거 + NightFlow Pass 구독)로 전환되었습니다. DB Migration 030-031에서 코드 전환은 완료되었으나, **문서와 UI 텍스트가 구 모델을 참조**하는 모순이 다수 발견되어 이를 수정했습니다.

**Claude가 수행한 작업을 Gemini가 교차검증**하여 누락/오류가 없는지 확인해주세요.

---

## 비즈니스 모델 전환 요약

| 항목 | Model A (구) | Model B (현재) |
|------|-------------|---------------|
| MD 수수료 | 10% (베타 7%) | 0% |
| 결제 중개 | 토스페이먼츠 PG | **없음** (MD-고객 직접) |
| 낙찰 후 플로우 | 15분 결제 → paid → confirmed | contact_deadline → contacted → confirmed |
| 노쇼 정책 | 3회 노쇼 = 7일 정지 | 누진 스트라이크 (1회:14일, 2회:90일, 3회:영구) |
| 수익 모델 | MD 수수료 | NightFlow Pass ₩19,900/월 |
| 핵심 DB 함수 | Migration 002 | Migration 030 |

### Model B 경매 상태 전이도
```
draft → scheduled → active → won → contacted → confirmed
                            └→ unsold
                    won → (미연락) → apply_noshow_strike() + fallback_to_next_bidder()
```

---

## Claude가 수정한 파일 목록 (총 4개 Phase, ~20개 파일)

### Phase 1-2: 핵심 문서 + 코드 (이전 세션에서 완료)

| # | 파일 | 수정 내용 |
|---|------|----------|
| 1 | `CLAUDE.md` | 전면 업데이트 — 수수료/결제/플로우/노쇼/Task 섹션 전부 Model B 기준 |
| 2 | `NightFlow_MVP_Plan.md` | 상단에 DEPRECATED 경고 추가 |
| 3 | `src/components/auctions/BidPanel.tsx` | platformFeeRate/platformFeeAmt 죽은 코드 ~15줄 제거 |
| 4 | `src/components/auctions/AuctionDetail.tsx` | `"paid"` → `"contacted"` 배지 |
| 5 | `src/app/(main)/pass/page.tsx` | "Secure Payment by Toss Payments" → "Secure Subscription Service" |
| 6 | `src/lib/supabase/middleware.ts` | PROTECTED_PREFIXES에서 `/checkout/` 제거 |

### Phase 3: 사용자 대면 페이지 (이전 세션에서 완료)

| # | 파일 | 수정 내용 |
|---|------|----------|
| 7 | `src/app/api/notifications/auction-won/route.ts` | `checkoutUrl` → `/auctions/${auctionId}`, `paymentDeadline` → "제한 시간" |
| 8 | `src/app/(main)/faq/page.tsx` | 결제 FAQ → MD 연락 플로우, 토스 → Pass, 노쇼 → 누진 스트라이크 |
| 9 | `src/components/home/HomeContent.tsx` | "예약금 결제" 스텝 → "MD 연락", CreditCard → Phone 아이콘 |
| 10 | `src/app/(main)/terms/page.tsx` | 제1~8조 전면 수정 — 결제/환불/정산 → 직접거래/Pass/분쟁 |
| 11 | `src/app/(main)/privacy/page.tsx` | 토스 결제정보 수집 제거, 제3자 제공 테이블에서 토스페이먼츠 삭제 |

### Phase 4: `"paid"` → `"contacted"` 전면 수정 (이번 세션에서 완료)

| # | 파일 | 수정 내용 | 컨텍스트 |
|---|------|----------|---------|
| 12 | `src/types/database.ts` | AuctionStatus에서 `"paid"` 제거 | AuctionStatus |
| 13 | `src/components/auctions/AuctionCard.tsx` | isCompleted, isWon 배열에서 `"paid"` → `"contacted"` | AuctionStatus |
| 14 | `src/components/auctions/AuctionList.tsx` | 정렬 우선순위 `"paid"` → `"contacted"` | AuctionStatus |
| 15 | `src/components/md/MDDashboard.tsx` | 5곳 — 필터/정렬/통계 전부 `"paid"` → `"contacted"` | AuctionStatus |
| 16 | `src/components/md/MDAuctionCard.tsx` | 3곳 — 상태배지/가격라벨 `"paid"` → `"contacted"` | AuctionStatus |
| 17 | `src/components/admin/AdminAuctionManager.tsx` | STATUS_CONFIG `paid` → `contacted`, 라벨 "결제 대기/완료" → "연락 대기/완료", 필터 교체, CreditCard import 제거 | AuctionStatus |
| 18 | `src/app/(main)/my-wins/page.tsx` | `case "paid"` 라벨: "결제 완료" → "연락 완료", 스타일 green → blue | 레거시 fallback |
| 19 | `src/app/(main)/page.tsx` | Supabase 쿼리 `"paid"` → `"contacted"` | AuctionStatus |
| 20 | `src/app/api/auctions/refresh/route.ts` | Supabase 쿼리 `"paid"` → `"contacted"` | AuctionStatus |
| 21 | `src/components/admin/AdminTransactionList.tsx` | "토스페이먼츠를 통해 고객에게 결제 금액이 반환" → "해당 거래가 취소 처리" | PaymentStatus (유지) |
| 22 | `src/app/(dashboard)/admin/page.tsx` | "총 결제액" → "총 거래액", "플랫폼 수수료" → "플랫폼 수수료 (레거시)" | PaymentStatus (유지) |
| 23 | `src/app/(dashboard)/md/transactions/page.tsx` | "플랫폼결제/현장결제" → "거래완료/직접결제" | PaymentStatus (유지) |

### 부수 수정

| # | 파일 | 수정 내용 |
|---|------|----------|
| 24 | `src/components/admin/MDActivityTimeline.tsx` | 기존 TS 빌드 에러 수정 (`as AuctionActivity[]` → `as unknown as AuctionActivity[]`) |

---

## 검증 Task

### Task 1: AuctionStatus `"paid"` 완전 제거 확인

**목표**: AuctionStatus 컨텍스트에서 `"paid"` 참조가 0개인지 확인

**방법**:
```bash
grep -rn '"paid"' src/ --include="*.tsx" --include="*.ts"
```

**기대 결과**: 남은 `"paid"` 참조는 모두 **PaymentStatus (transactions 테이블)** 컨텍스트여야 합니다.

허용 파일 (PaymentStatus 컨텍스트):
- `types/database.ts` — PaymentStatus 타입 정의
- `AdminTransactionList.tsx` — `payment_status === "paid"` (5곳)
- `admin/page.tsx` — `payment_status === "paid"` (1곳)
- `md/transactions/page.tsx` — `payment_status === "paid"` (1곳)
- `my-wins/page.tsx` — `case "paid"` 레거시 fallback (1곳)

불허: 위 외 다른 파일에서 `"paid"`가 AuctionStatus 컨텍스트로 사용되는 경우

---

### Task 2: `"contacted"` 상태가 모든 화면에서 올바르게 처리되는지 확인

**목표**: `"contacted"` 상태가 UI 전반에서 누락 없이 처리되는지 검증

**검증 포인트**:

| 화면 | 파일 | 확인 사항 |
|------|------|----------|
| 홈 | `page.tsx` | Supabase 쿼리에 `"contacted"` 포함 |
| 홈 (새로고침) | `refresh/route.ts` | Supabase 쿼리에 `"contacted"` 포함 |
| 경매 카드 | `AuctionCard.tsx` | isCompleted, isWon에 `"contacted"` 포함 |
| 경매 목록 | `AuctionList.tsx` | 정렬 우선순위에 `"contacted"` 포함 |
| 경매 상세 | `AuctionDetail.tsx` | 상태 배지에 `"contacted"` → "연락 완료" |
| 내 낙찰 | `my-wins/page.tsx` | `case "contacted"` 처리 존재 |
| MD 대시보드 | `MDDashboard.tsx` | 5곳 모두 `"contacted"` 사용 |
| MD 경매카드 | `MDAuctionCard.tsx` | 상태배지 "⚠️ 확인필요", 가격라벨 "낙찰가" |
| Admin 경매관리 | `AdminAuctionManager.tsx` | STATUS_CONFIG에 `contacted`, 필터 드롭다운 |

---

### Task 3: 토스페이먼츠/결제 관련 잔여 참조 확인

**목표**: 사용자에게 노출되는 UI에서 "토스", "결제 중개", "15분 결제" 등 구 모델 문구가 남아있지 않은지 확인

**방법**:
```bash
grep -rn '토스\|toss\|Toss' src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
grep -rn '15분.*결제\|결제.*15분' src/ --include="*.tsx" --include="*.ts"
grep -rn 'checkout' src/ --include="*.tsx" --include="*.ts"
grep -rn 'platformFeeRate\|platformFeeAmt\|totalPayAmount' src/ --include="*.tsx" --include="*.ts"
```

**기대 결과**:
- `토스/toss/Toss`: 0건 (사용자 대면) — 또는 alimtalk 템플릿 변수명만 허용
- `15분.*결제`: 0건
- `checkout`: 0건 (checkout 페이지 삭제됨)
- `platformFeeRate/platformFeeAmt/totalPayAmount`: 0건 (죽은 코드 제거됨)

---

### Task 4: 법적 문서 정합성 확인

**목표**: 이용약관/개인정보처리방침이 Model B를 정확히 반영하는지 확인

**파일**: `src/app/(main)/terms/page.tsx`, `src/app/(main)/privacy/page.tsx`

**확인 포인트**:

| 항목 | 기대값 |
|------|--------|
| 결제 중개 언급 | 없음 — "결제를 중개하지 않음" 명시 |
| 거래 방식 | "낙찰자와 MD 간의 직접 거래" |
| 수수료 | "베타 기간 MD 수수료 0%" |
| 노쇼 정의 | "제한 시간 내에 MD에게 연락하지 않거나 방문하지 않은 경우" |
| 스트라이크 | 누진: 14일/90일/영구 |
| Pass 환불 | "7일 이내 미이용 시 전액 환불" |
| 제3자 제공 | 토스페이먼츠 행 삭제, SOLAPI + MD만 남음 |

---

### Task 5: FAQ 정합성 확인

**파일**: `src/app/(main)/faq/page.tsx`

**확인 포인트**:

| FAQ 항목 | 기대 내용 |
|---------|----------|
| item-3 "낙찰 후 어떻게 하나요?" | MD에게 연락, 직접 결제 안내 |
| item-4 "금액은 어떻게 결제하나요?" | "결제를 중개하지 않음", MD에게 직접 |
| item-5 "노쇼 시 불이익" | 누진 스트라이크 + Pass 면제 |
| md-4 "정산은 언제 되나요?" | "별도 정산 과정 없음" |
| tech-2 | "NightFlow Pass란 무엇인가요?" (토스 결제수단 X) |
| 고객센터 아이콘 | Phone (CreditCard X) |

---

### Task 6: 빌드 검증

```bash
cd nightflow && npm run build
```

**기대 결과**: TypeScript 에러 0건, 정상 빌드 완료

---

### Task 7: CLAUDE.md 정합성 확인

**파일**: `/Users/gimmingi/project 1/CLAUDE.md`

**확인 포인트**:

| 섹션 | 기대 내용 |
|------|----------|
| 프로젝트 개요 | "Model B", "결제 중개 없음", "NightFlow Pass" |
| 기술 스택 | "Subscription: NightFlow Pass" (토스 X) |
| 구현 상태 | "~90% 완료" |
| 경매 플로우 | contact_deadline → contacted → confirmed |
| 노쇼 방지 | 누진 스트라이크, Pass 연장/면제 |
| Gemini Task 4 (BIN) | "contact_deadline 설정, transaction 미생성" |
| Task 5 (VIP CRM) | user_trust_scores 뷰가 auctions 기반 (transactions X) |
| 결제 연동 Phase 이력 | 취소선 처리 + "Model B 전환으로 폐기" |

---

### Task 8 (Optional): 누락된 모순 탐색

위 검증 외에, **아직 발견되지 않은 구 모델 참조**가 있는지 전체 codebase를 스캔해주세요.

**검색 키워드**:
```bash
grep -rn '결제.*완료\|결제.*대기\|payment_deadline\|15분\|수수료.*10%\|수수료.*7%' src/ --include="*.tsx" --include="*.ts"
grep -rn 'transaction.*생성\|transaction.*INSERT' src/ --include="*.tsx" --include="*.ts" --include="*.sql"
```

---

## 의사결정 기준 (왜 이렇게 수정했는가)

### `"paid"` 이중 컨텍스트 처리 방침

`"paid"`는 두 가지 컨텍스트에서 사용됨:

1. **AuctionStatus** (경매 상태): Model B에서 `paid` 상태에 도달할 수 없음 → **`"contacted"`로 교체**
2. **PaymentStatus** (거래 결제 상태): transactions 테이블의 레거시 기록 조회용 → **유지**

이 구분이 올바르게 적용되었는지가 가장 중요한 검증 포인트입니다.

### `my-wins/page.tsx`의 `case "paid"` 유지 이유

DB에 이미 `status = 'paid'`인 레거시 auction 레코드가 존재할 수 있으므로, fallback으로 유지하되 라벨을 "연락 완료"로 변경했습니다.

### `alimtalk.ts`의 변수명 유지 이유

`paymentDeadline`, `checkoutUrl` 등의 변수명은 **카카오 알림톡 템플릿에 등록된 변수명**이므로, 템플릿 재등록 없이는 변경할 수 없습니다. 값만 변경했습니다.

---

## 검증 완료 후 보고 양식

```
## Gemini 교차검증 결과

### Task 1: AuctionStatus "paid" 제거 — ✅/❌
- 발견된 문제: (있으면 기술)

### Task 2: "contacted" 처리 — ✅/❌
- 누락 화면: (있으면 기술)

### Task 3: 토스/결제 잔여 참조 — ✅/❌
- 발견된 잔여 참조: (있으면 기술)

### Task 4: 법적 문서 — ✅/❌
### Task 5: FAQ — ✅/❌
### Task 6: 빌드 — ✅/❌
### Task 7: CLAUDE.md — ✅/❌
### Task 8: 추가 발견 — (있으면 기술)

### 종합 판정: PASS / FAIL
```
