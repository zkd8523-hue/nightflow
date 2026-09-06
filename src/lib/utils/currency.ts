/**
 * KRW 환율 — 방한객 상위 시장 8개 통화.
 *
 * 예산 감 잡기용 근사치다(정밀 거래용 아님). 그래도 하드코딩만 두면 시간이 지나며 크게 벌어진다 —
 * 실제로 2026-06 고정값이 8월에 위안화 기준 10% 어긋나 있었다.
 * 그래서 주 1회 cron(sync-fx-rates)이 open.er-api.com에서 받아 fx_rate_snapshots에 적재하고,
 * 조회는 그 테이블에서 한다. 테이블이 비었거나 조회에 실패하면 아래 표로 폴백한다.
 *
 * 실결제는 전액 원화다(Model B — 손님이 MD에게 직접 지불). 여기 값은 화면 참고용이라
 * 신청서에 환산가를 남기지 않는다. 원화 금액은 selected_menu 스냅샷에 이미 박힌다.
 */

/**
 * 지원 통화. 2025년 방한객 순위(한국관광공사, 총 1,894만 명) 기준:
 *   CNY 548만(1위) · JPY 365만(2위) · TWD 189만(3위) · USD 148만(4위) · HKD 62만(5위)
 * SGD·THB·VND는 6~11위 동남아 시장 — 영어 트랙(/en)으로 들어오는데 USD 하나로는 못 맞춘다.
 */
export type CurrencyCode = "USD" | "JPY" | "CNY" | "TWD" | "HKD" | "SGD" | "THB" | "VND";
/** 1 KRW = rate * (해당 통화) */
export type KrwRates = Record<CurrencyCode, number>;
export type RateSnapshot = { rates: KrwRates; asOf: string; /** 원본 ISO — 언어별 날짜 포맷용 */ asOfIso?: string };

/**
 * 기호는 코드를 접두해 쓴다 — ¥를 CNY와 JPY가, $를 USD·HKD·SGD가 공유하기 때문이다.
 * 맨 ¥/$로 두면 도쿄 손님이 위안화 금액을 엔으로 읽는다.
 */
const SYMBOLS: Record<CurrencyCode, string> = {
  USD: "US$",
  JPY: "JP¥",
  CNY: "CN¥",
  TWD: "NT$",
  HKD: "HK$",
  SGD: "S$",
  THB: "฿",
  VND: "₫",
};

/** 통화 이름 — 선택 시트에 코드와 같이 띄운다. */
export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  USD: "US dollar",
  JPY: "Japanese yen",
  CNY: "Chinese yuan",
  TWD: "New Taiwan dollar",
  HKD: "Hong Kong dollar",
  SGD: "Singapore dollar",
  THB: "Thai baht",
  VND: "Vietnamese dong",
};

/** 목록 순서 — 방한객 규모순. krwToAll()과 선택 시트가 같이 쓴다. */
const ORDER: CurrencyCode[] = ["USD", "JPY", "CNY", "TWD", "HKD", "SGD", "THB", "VND"];
export const CURRENCY_ORDER = ORDER;

/**
 * 반올림 단위. VND는 1원이 약 18동이라 일의 자리까지 쓰면 "₫7,268,431" 같은
 * 가짜 정밀도가 된다 — 참고값이므로 읽기 쉬운 자리에서 끊는다.
 */
const ROUND_TO: Partial<Record<CurrencyCode, number>> = {
  VND: 10000,
  THB: 10,
  JPY: 10,
};

/** API 실패 시 폴백. 2026-08 조회값 기준. */
export const FALLBACK_SNAPSHOT: RateSnapshot = {
  rates: {
    USD: 1 / 1416,
    JPY: 1 / 8.92,
    CNY: 1 / 209,
    TWD: 1 / 44,
    HKD: 1 / 181,
    SGD: 1 / 1101,
    THB: 1 / 42.8,
    VND: 1 / 0.0536,
  },
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

/** 국가 → 표시 통화. 지원 통화가 없는 국가는 null(원화만 보여준다). */
export function countryToCurrency(countryCode: string | null | undefined): CurrencyCode | null {
  if (!countryCode) return null;
  switch (countryCode.toUpperCase()) {
    case "US": return "USD";
    case "JP": return "JPY";
    case "CN": return "CNY";
    case "TW": return "TWD";
    case "HK":
    case "MO": return "HKD";   // 마카오 파타카(MOP)는 HKD에 사실상 고정 — 별도 지원 없이 HKD로 읽힌다
    case "SG": return "SGD";
    case "TH": return "THB";
    case "VN": return "VND";
    default: return null;
  }
}

/**
 * 언어 → 표시 통화. country_code가 없을 때의 폴백이다.
 * en은 미국·홍콩·싱가포르·호주 등이 섞여 있어 하나로 못 정한다 — USD를 기본으로 두되
 * 화면에서 손님이 바꿀 수 있게 한다(통화 선택 시트).
 */
export function langToCurrency(lang: string): CurrencyCode | null {
  switch (lang) {
    case "ja": return "JPY";
    case "zh": return "CNY";
    case "zh-tw": return "TWD";
    case "en": return "USD";
    default: return null;   // ko — 원화만
  }
}

/**
 * 표시 통화 결정. country_code가 언어보다 정확하다 —
 * /en 트랙의 홍콩 손님은 lang만 보면 USD가 되지만 country_code로는 HKD가 나온다.
 */
export function resolveCurrency(
  countryCode: string | null | undefined,
  lang: string
): CurrencyCode | null {
  return countryToCurrency(countryCode) ?? langToCurrency(lang);
}

/** 통화 단위로 반올림한 수치. 포맷 없이 숫자만 필요할 때. */
export function convertKrw(amount: number, code: CurrencyCode, rates: KrwRates = FALLBACK_SNAPSHOT.rates): number {
  // 환율이 없는 통화(늘렸는데 아직 안 들어온 응답)는 폴백으로 메운다 —
  // 안 그러면 NaN이 그대로 화면에 "HK$NaN"으로 찍힌다.
  const rate = Number.isFinite(rates?.[code]) ? rates[code] : FALLBACK_SNAPSHOT.rates[code];
  const raw = amount * rate;
  if (!Number.isFinite(raw)) return NaN;
  const unit = ROUND_TO[code];
  return unit ? Math.round(raw / unit) * unit : Math.round(raw);
}

/**
 * 환율 고시 단위. 은행 고시가 "일본 JPY 100"으로 적는 이유와 같다 —
 * 1엔을 원화로 쓰면 8.9원이라 환율로 읽히지 않는다. 동은 더 심해서 0.05원이다.
 */
const QUOTE_UNIT: Partial<Record<CurrencyCode, number>> = {
  JPY: 100,
  VND: 1000,
};

/**
 * "1 HKD = 1,810원" 형태의 환율 표시. 통화를 고르는 화면에서 쓴다 —
 * "이 금액이 저 통화로 얼마"(역방향)는 자릿수만 커서 감이 안 잡히고,
 * 사람이 환율을 읽는 방식은 은행 고시처럼 통화 1단위 기준이다.
 */
export function quoteRate(code: CurrencyCode, rates: KrwRates = FALLBACK_SNAPSHOT.rates): string | null {
  const rate = Number.isFinite(rates?.[code]) ? rates[code] : FALLBACK_SNAPSHOT.rates[code];
  if (!Number.isFinite(rate) || rate === 0) return null;
  const unit = QUOTE_UNIT[code] ?? 1;
  const won = unit / rate;               // 1 KRW = rate * 통화 → 통화 1단위 = 1/rate 원
  if (!Number.isFinite(won)) return null;
  // 1원 미만 자리는 버린다 — 참고값이라 소수점이 정보를 더하지 않는다.
  return `${unit > 1 ? `${unit} ` : ""}${code} = ${Math.round(won).toLocaleString("en-US")} KRW`;
}

/** ₩amount를 4개 통화로 — "US$290 · JP¥43,480 · CN¥2,105 · NT$9,302" */
export function krwToAll(amount: number, rates: KrwRates = FALLBACK_SNAPSHOT.rates): string {
  return ORDER.slice(0, 4)
    .map((code) => `${SYMBOLS[code]}${convertKrw(amount, code, rates).toLocaleString("en-US")}`)
    .join(" · ");
}

/** ₩amount를 특정 통화로 — "US$362" */
export function krwTo(
  amount: number,
  code: string,
  rates: KrwRates = FALLBACK_SNAPSHOT.rates
): string | null {
  if (!(code in SYMBOLS)) return null;
  const c = code as CurrencyCode;
  const v = convertKrw(amount, c, rates);
  // 값이 안 나오면 아무것도 안 그린다 — 참고값이라 없는 편이 NaN보다 낫다.
  if (!Number.isFinite(v)) return null;
  return `${SYMBOLS[c]}${v.toLocaleString("en-US")}`;
}

/**
 * 환율 조회 — fx_rate_snapshots 최신 행. 주 1회 cron(sync-fx-rates)이 적재한다.
 * 외부 API를 직접 치지 않는 이유: Next fetch 캐시는 요청이 와야 갱신되고 재배포 때 날아가서,
 * 트래픽이 뜸한 새벽 첫 손님이 stale을 보거나 배포 직후 외부 API 지연을 그대로 맞았다.
 */
export async function getKrwRates(): Promise<RateSnapshot> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return FALLBACK_SNAPSHOT;

    const { data } = await createClient(url, key)
      .from("fx_rate_snapshots")
      .select("rates, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const r = data?.rates as Partial<KrwRates> | undefined;
    // 통화를 늘렸는데 아직 그 통화가 없는 행이 최신일 수 있다 — 빠진 건 폴백으로 메운다.
    if (!r || typeof r.USD !== "number") return FALLBACK_SNAPSHOT;
    const merged = { ...FALLBACK_SNAPSHOT.rates } as KrwRates;
    for (const c of ORDER) if (typeof r[c] === "number") merged[c] = r[c] as number;

    return {
      rates: merged,
      asOf: formatAsOf(data!.fetched_at as string),
      asOfIso: data!.fetched_at as string,
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
