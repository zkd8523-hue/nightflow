/**
 * 사업자 정보 단일 출처 (Single Source of Truth)
 *
 * PG/카드사 심사 요건: 사업자등록증 정보와 일치해야 하며, 메인 + 결제페이지에
 * 상시 노출되어야 함. 전화번호는 휴대폰 불가(유선/070 가능).
 *
 * 통신판매업번호: 통신판매업 신고 완료 후 발급되는 번호. 발급 전에는 빈 값이며,
 * 발급되면 BUSINESS_INFO.mailOrderSalesNumber 만 채우면 푸터·결제페이지에 자동 반영.
 */
export const BUSINESS_INFO = {
  /** 상호명 */
  companyName: "매드다윗",
  /** 대표자명 */
  ceo: "김민기",
  /** 사업자등록번호 */
  businessNumber: "842-06-03382",
  /** 통신판매업 신고번호 — 신고 완료 후 채움 (예: 2026-부산연제-XXXX) */
  mailOrderSalesNumber: "",
  /** 사업장 주소지 */
  address: "부산광역시 연제구 쌍미천로129번길 21",
  /** 고객센터 유선전화 (휴대폰 불가) */
  tel: "070-5236-4647",
  /** 고객센터 이메일 */
  email: "maddawids@gmail.com",
} as const;
