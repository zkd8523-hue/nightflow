/**
 * 보증금 공통 헬퍼 함수
 * - 주문번호 생성
 * - 금액 상수
 * - 보증금 상태 전이 헬퍼
 */

/** 보증금 고정 금액 (MVP) */
export const DEPOSIT_AMOUNT = 30000;

/** PG 수수료율 (카드 ~3.5%) */
export const PG_FEE_RATE = 0.035;

/** 보증금 주문번호 생성 */
export function generateDepositOrderId(auctionId: string, userId: string): string {
  const timestamp = Date.now().toString(36);
  const auctionShort = auctionId.slice(0, 8);
  const userShort = userId.slice(0, 8);
  return `DEP_${auctionShort}_${userShort}_${timestamp}`;
}

/** PG 수수료 계산 (MD 정산 차감용) */
export function calculatePgFee(amount: number): number {
  return Math.round(amount * PG_FEE_RATE);
}

/** MD 정산 금액 (보증금 - PG 수수료) */
export function calculateSettlementAmount(amount: number): number {
  return amount - calculatePgFee(amount);
}

/** 잔금 계산 (낙찰가 - 보증금) */
export function calculateRemainingAmount(winningPrice: number, depositAmount: number): number {
  return Math.max(0, winningPrice - depositAmount);
}
