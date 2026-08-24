import { CONTACT_PATTERNS, detectContactInfo } from "@/lib/utils/contact-detector";
import { EXTRAS_OPTIONS } from "@/lib/constants/liquor";

/**
 * 카톡 홍보문구 → 조각(share) 템플릿 파싱 결과.
 *
 * MD들이 단톡방에 올리는 문구를 그대로 붙여넣어 템플릿을 만든다.
 * 모델 출력은 신뢰하지 않는다 — 반드시 normalizePromoRows()를 통과시킨 뒤 쓴다.
 */
export interface ParsedPromoRow {
  /** 티어명 — "일반자리" / "준메인" / "힙합존". 이모지·인원·가격 제거됨. 최대 20자 */
  name: string;
  /** 정원 — "6인" 표기가 있으면 그 값, 없으면 6. 2~20 */
  total_seats: number;
  /** 1인 가격(만원). "엔6" → 6. 범위("엔6~9")면 낮은 쪽 */
  price_man: number;
  /** 범위 상단(만원). "엔6~9"의 9. 범위가 아니면 null.
   *  저장하지 않고 검토 화면에서 "6만/9만" 칩으로 바꿔 끼우는 데만 쓴다 */
  price_man_high: number | null;
  /** 폴더 라벨 후보 — "평일"/"주말". 요일 언급이 없으면 null */
  category: string | null;
  /** EXTRAS_OPTIONS와 교집합만 남긴 값. 보통 빈 배열 */
  includes: string[];
  /** 케어/서비스 문구. 전화번호·URL 제거됨. 최대 200자 */
  md_comment: string | null;
}

/** 클라이언트 MAX_PRICE_MAN과 같은 기준 (1인 1000만원) */
export const MAX_PRICE_MAN = 1000;
/** 템플릿 개수 상한 — DB 트리거 check_auction_template_limit(513)와 동일 */
export const MAX_PROMO_ROWS = 9;

/**
 * 연락처(전화번호·URL·SNS 핸들)를 공백으로 치환.
 *
 * messenger_solo / kakao_keyword / dm_keyword는 제외한다 — "라인업", "인스타 사진" 같은
 * 정상 표현까지 먹어서 홍보문구 본문이 뭉개진다. 우리가 막으려는 건 "연락 가능한 값"이다.
 *
 * CONTACT_PATTERNS는 non-global이라 그대로 replace하면 첫 매치만 지워진다 → g 플래그를 붙여 재생성.
 */
const SCRUB_KEYS = Object.keys(CONTACT_PATTERNS).filter(
  (k) => k.startsWith("phone_") || k.startsWith("url_") || k.endsWith("_url") || k === "social_handle"
) as (keyof typeof CONTACT_PATTERNS)[];

export function scrubContacts(text: string): string {
  if (!text) return "";
  let out = text;
  for (const key of SCRUB_KEYS) {
    const p = CONTACT_PATTERNS[key];
    const g = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    out = out.replace(g, " ");
  }
  return out;
}

/** 이모지·기호 장식 제거 (티어명 정리용). 한글·영문·숫자·공백만 남긴다. */
function stripDecoration(s: string): string {
  return s
    .replace(/[^\p{Script=Hangul}\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** md_comment에서 EXTRAS_OPTIONS에 해당하는 항목만 뽑는다 (없으면 빈 배열이 정상) */
function deriveIncludes(comment: string | null): string[] {
  if (!comment) return [];
  return EXTRAS_OPTIONS.filter((opt) => comment.includes(opt));
}

/** 모델이 돌려준 원시 행. 어떤 필드든 빠지거나 타입이 틀릴 수 있다고 가정한다. */
export interface RawPromoTier {
  name?: unknown;
  total_seats?: unknown;
  price_man?: unknown;
  price_man_high?: unknown;
  md_comment?: unknown;
}

/**
 * 모델 출력 → 저장 가능한 행으로 정규화.
 * - 가격이 없거나 0이면 행 자체를 버린다 (인당가 없는 줄은 조각이 아니다)
 * - 이름·코멘트에서 연락처를 한 번 더 제거 (환각 방어)
 * - name|price_man 기준 중복 제거, 최대 9행
 */
export function normalizePromoRows(
  tiers: RawPromoTier[] | undefined | null,
  weekdayHint: string | null
): ParsedPromoRow[] {
  if (!Array.isArray(tiers)) return [];

  const category = weekdayHint === "평일" || weekdayHint === "주말" ? weekdayHint : null;
  const out: ParsedPromoRow[] = [];
  const seen = new Set<string>();

  for (const t of tiers) {
    // 가격 — 이게 없으면 조각 줄이 아니다.
    // clampInt를 먼저 쓰면 0이 하한 1로 올라가 버려서, 원값을 직접 검사한 뒤 클램프한다.
    const rawPrice = Number(t.price_man);
    if (!Number.isFinite(rawPrice) || Math.round(rawPrice) < 1) continue;
    const priceMan = clampInt(rawPrice, 1, MAX_PRICE_MAN, 0);

    let name = stripDecoration(typeof t.name === "string" ? t.name : "").slice(0, 20);
    if (detectContactInfo(name).length > 0) name = stripDecoration(scrubContacts(name)).slice(0, 20);
    if (!name) name = "조각";

    const key = `${name}|${priceMan}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 이름이 같고 가격만 다른 행(등급명 없는 문구에서 흔함) — 목록에서 구분되도록 번호를 붙인다
    if (out.some((r) => r.name === name)) {
      let n = 2;
      while (out.some((r) => r.name === `${name} ${n}`)) n += 1;
      name = `${name} ${n}`.slice(0, 20);
    }

    let comment: string | null = typeof t.md_comment === "string" ? t.md_comment.trim() : "";
    if (comment && detectContactInfo(comment).length > 0) {
      comment = scrubContacts(comment).replace(/\s+/g, " ").trim();
    }
    comment = comment ? comment.slice(0, 200) : null;

    // 상단이 하단 이하면 범위가 아니다
    const rawHigh = clampInt(t.price_man_high, 1, MAX_PRICE_MAN, 0);
    const priceHigh = rawHigh > priceMan ? rawHigh : null;

    out.push({
      name,
      total_seats: clampInt(t.total_seats, 2, 20, 6),
      price_man: priceMan,
      price_man_high: priceHigh,
      category,
      includes: deriveIncludes(comment),
      md_comment: comment,
    });

    if (out.length >= MAX_PROMO_ROWS) break;
  }

  return out;
}
