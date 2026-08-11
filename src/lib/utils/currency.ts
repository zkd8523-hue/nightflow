/**
 * KRW 환율 — 한국 외래 관광객 상위 4개국.
 *
 * 예산 감 잡기용 근사치다(정밀 거래용 아님). 그래도 하드코딩만 두면 시간이 지나며 크게 벌어진다 —
 * 실제로 2026-06 고정값이 8월에 위안화 기준 10% 어긋나 있었다.
 * 그래서 open.er-api.com(무료·키 불필요)에서 15일마다 갱신하고, 실패하면 아래 표로 폴백한다.
 */

export type CurrencyCode = "USD" | "JPY" | "CNY" | "TWD";
/** 1 KRW = rate * (해당 통화) */
export type KrwRates = Record<CurrencyCode, number>;
export type RateSnapshot = { rates: KrwRates; asOf: string; /** 원본 ISO — 언어별 날짜 포맷용 */ asOfIso?: string };

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  JPY: "¥",
  CNY: "CN¥",
  TWD: "NT$",
};
const ORDER: CurrencyCode[] = ["USD", "JPY", "CNY", "TWD"];

/** API 실패 시 폴백. 2026-08 조회값 기준. */
export const FALLBACK_SNAPSHOT: RateSnapshot = {
  rates: { USD: 1 / 1416, JPY: 1 / 8.92, CNY: 1 / 209, TWD: 1 / 44 },
  asOf: "Aug 11, 2026",
  asOfIso: "2026-08-11T00:00:00Z",
};

/** 하위 호환 — 예전 코드가 참조하던 상수 */
export const RATE_AS_OF = FALLBACK_SNAPSHOT.asOf;

/** "Aug 11, 2026" 형태 — 월만 쓰면 며칠 전 환율인지 알 수 없어 일자까지 넣는다 */
export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return FALLBACK_SNAPSHOT.asOf;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** ₩amount를 4개 통화로 — "$290 · ¥43,478 · CN¥2,105 · NT$9,302" */
export function krwToAll(amount: number, rates: KrwRates = FALLBACK_SNAPSHOT.rates): string {
  return ORDER.map((code) => {
    const converted = Math.round(amount * rates[code]);
    return `${SYMBOLS[code]}${converted.toLocaleString("en-US")}`;
  }).join(" · ");
}

/** ₩amount를 특정 통화로 — "$362" */
export function krwTo(
  amount: number,
  code: string,
  rates: KrwRates = FALLBACK_SNAPSHOT.rates
): string | null {
  if (!(code in SYMBOLS)) return null;
  const c = code as CurrencyCode;
  return `${SYMBOLS[c]}${Math.round(amount * rates[c]).toLocaleString("en-US")}`;
}

/**
 * 서버 전용 — 환율 조회. Next fetch 캐시로 15일 주기 갱신.
 * 라우트 핸들러(/api/rates)와 서버 컴포넌트가 같이 쓴다(같은 URL이라 캐시 공유).
 */
export async function getKrwRates(): Promise<RateSnapshot> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/KRW", {
      next: { revalidate: 60 * 60 * 24 * 15 },
    });
    if (!res.ok) return FALLBACK_SNAPSHOT;
    const json = await res.json();
    const r = json?.rates;
    if (!r || ORDER.some((c) => typeof r[c] !== "number")) return FALLBACK_SNAPSHOT;
    return {
      rates: { USD: r.USD, JPY: r.JPY, CNY: r.CNY, TWD: r.TWD },
      asOf: formatAsOf(json?.time_last_update_utc ?? ""),
      asOfIso: json?.time_last_update_utc ?? undefined,
    };
  } catch {
    return FALLBACK_SNAPSHOT;
  }
}

/** 언어별 날짜 표기 — "Aug 11, 2026" / "2026年8月11日" / "2026年8月11日" */
export function formatAsOfLocale(iso: string | undefined, lang: string): string {
  if (!iso) return FALLBACK_SNAPSHOT.asOf;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return FALLBACK_SNAPSHOT.asOf;
  const locale =
    lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : lang === "zh-tw" ? "zh-TW" : lang === "ko" ? "ko-KR" : "en-US";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
