/**
 * KRW 고정 환율 테이블 — 한국 외래 관광객 상위 4개국
 * 마지막 업데이트: 2026-06
 * 감 잡기용 근사치 — 정밀 거래용 아님
 */
/** 환율 기준 시점 (테이블 갱신 시 함께 업데이트) */
export const RATE_AS_OF = "Jun 2026";

const KRW_RATES = [
  { code: "USD", symbol: "$",    rate: 1 / 1380  },
  { code: "JPY", symbol: "¥",   rate: 1 / 9.2   },
  { code: "CNY", symbol: "CN¥", rate: 1 / 190   },
  { code: "TWD", symbol: "NT$", rate: 1 / 43    },
] as const;

/**
 * ₩amount를 4개 통화로 변환해 "~$360 · ¥54,000 · CN¥2,600 · NT$11,600" 형태로 반환
 */
export function krwToAll(amount: number): string {
  return KRW_RATES.map(({ symbol, rate }) => {
    const converted = Math.round(amount * rate);
    return `${symbol}${converted.toLocaleString("en-US")}`;
  }).join(" · ");
}

/**
 * ₩amount를 특정 통화 코드로 변환해 "≈ $362" 형태로 반환
 */
export function krwTo(amount: number, code: string): string | null {
  const entry = KRW_RATES.find((r) => r.code === code);
  if (!entry) return null;
  const converted = Math.round(amount * entry.rate);
  return `${entry.symbol}${converted.toLocaleString("en-US")}`;
}
