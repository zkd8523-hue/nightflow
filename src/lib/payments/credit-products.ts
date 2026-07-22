/**
 * 크레딧 충전 상품 정의 (MD 전용)
 *
 * 비즈니스 모델: 1크레딧 = 100원. MD가 깃발 매치 수수료/오퍼에 사용하는 크레딧을
 * 카드/카카오페이로 충전. Model B(결제 중개 없음)와 무관한, 플랫폼 자체 수익(SaaS형).
 *
 * PG/카드사 심사 요건: "비실물(컨텐츠) 서비스" 상품으로 분류. 금액·환불정보 고정 노출.
 * 상품명/금액 0원 금지 (카드사 심사 불가). 임의 입력 금액 금지(고정 정액만).
 */

export interface CreditProduct {
  /** 결제 식별용 코드 (paymentId prefix 에도 사용) */
  id: string;
  /** 충전되는 크레딧 수량 */
  credits: number;
  /** 결제 금액 (원, VAT 포함 표시가) */
  amount: number;
  /** 사용자에게 보이는 상품명. 'TEST'/0원 금지 (카드사 심사) */
  name: string;
  /** 보너스/추천 강조 여부 */
  recommended?: boolean;
}

/**
 * 정액 충전 상품 3종 (1크레딧 = 100원).
 * 금액은 고정 — 임의 입력 방식은 PG/카드사 입점이 어려움.
 */
export const CREDIT_PRODUCTS: CreditProduct[] = [
  {
    id: "credit_39",
    credits: 39,
    amount: 3900,
    name: "나이트플로우 크레딧 39개",
  },
  {
    id: "credit_99",
    credits: 99,
    amount: 9900,
    name: "나이트플로우 크레딧 99개",
    recommended: true,
  },
  {
    id: "credit_149",
    credits: 149,
    amount: 14900,
    name: "나이트플로우 크레딧 149개",
  },
];

/** 1크레딧 가격(원). 표시·검증 단일 출처. */
export const CREDIT_UNIT_PRICE = 100;

/**
 * 계좌이체(무통장입금) 안내 계좌 — 사업용 계좌.
 * PG 우회 경로: MD가 이 계좌로 직접 입금 → 관리자 통장 확인 후 수기 적립.
 * 계좌 변경 시 이 상수 한 곳만 수정하면 안내 화면에 반영됨.
 */
export const BANK_TRANSFER_ACCOUNT = {
  bank: "카카오뱅크",
  number: "3333-37-4374607",
  holder: "매드다윗(김민기)",
} as const;

/** id 로 상품 조회. 서버 검증에서 클라이언트가 보낸 금액 위변조 방지에 사용. */
export function getCreditProduct(id: string): CreditProduct | undefined {
  return CREDIT_PRODUCTS.find((p) => p.id === id);
}
