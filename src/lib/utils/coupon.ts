import type { CouponBenefitType, CouponDiscountType, CouponMinSpendUnit } from "@/types/database";
import { getClubEventDateFrom } from "@/lib/utils/date";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";

/**
 * 쿠폰 혜택 6종 프리셋. 게스트 간판의 GUEST_SIGN_BENEFIT_PRESETS(hotdeal.ts)와
 * free_entry/free_drink 값을 공유해 어휘 체계를 통일한다.
 * benefit_type은 정확히 1개 필수(필터·통계·아이콘용), 추가 변형은 benefit_tags(태그)로.
 */
// liquor_set(주류 세트 할인)은 table_discount와 개념이 겹쳐 칩에서 제거했다(2026-08-25).
// 과거 발행분 조회·통계가 깨지지 않도록 CouponBenefitType 값 자체는 유지한다.
export const COUPON_BENEFIT_PRESETS: { value: CouponBenefitType; label: string; emoji: string }[] = [
  { value: "service_bottle", label: "서비스 바틀", emoji: "🍾" },
  { value: "tequila_shot", label: "데킬라샷", emoji: "🥃" },
  { value: "table_discount", label: "테이블 할인", emoji: "🥂" },
  { value: "free_entry", label: "무료입장", emoji: "🎟" },
  { value: "free_drink", label: "프리드링크", emoji: "🍸" },
  { value: "free_pass", label: "프리패스", emoji: "⚡" },
  { value: "etc", label: "기타", emoji: "➕" },
];

export function benefitTypeLabel(type: CouponBenefitType | string): { label: string; emoji: string } {
  const preset = COUPON_BENEFIT_PRESETS.find((p) => p.value === type);
  return preset ? { label: preset.label, emoji: preset.emoji } : { label: type, emoji: "" };
}

/** 사용 화면 배경 그라디언트 팔레트 (redeem_color 0~5 인덱스). 위조 방지 장치 3 — 서버가 사용 시점에 랜덤 배정. */
export const REDEEM_COLORS: readonly [string, string][] = [
  ["#F59E0B", "#EF4444"], // amber → red
  ["#22C55E", "#0EA5E9"], // green → sky
  ["#A855F7", "#EC4899"], // purple → pink
  ["#0EA5E9", "#6366F1"], // sky → indigo
  ["#F97316", "#EAB308"], // orange → yellow
  ["#EC4899", "#8B5CF6"], // pink → violet
];

/** 남은 시간 카운트다운 문자열. "3시간 12분 남음" / "12분 남음" / "종료됨" */
export function formatCouponCountdown(endsAtISO: string, nowMs: number = Date.now()): string {
  const end = new Date(endsAtISO);
  if (end.getTime() - nowMs <= 0) return "종료됨";

  // ⚠️ 영업일(새벽 6시 경계) 기준으로 "오늘"을 판단하면, 밤 10시에 보는
  //    새벽 5시 마감이 "오늘 5시"로 나와 이미 지난 시각처럼 읽힌다.
  //    유저가 보는 건 달력이므로 달력 날짜로 판단한다.
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = new Date(nowMs);
  const tomorrow = new Date(nowMs);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const hh = end.getHours();
  const mm = end.getMinutes();
  // 새벽 5시를 "오전"이라 하면 클럽 손님에겐 어색하다
  const period =
    hh < 6 ? "새벽" : hh < 12 ? "아침" : hh < 18 ? "오후" : "저녁";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const time = mm === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${mm}분`;

  if (dayKey(end) === dayKey(now)) return `오늘 ${time}까지`;
  if (dayKey(end) === dayKey(tomorrow)) return `내일 ${time}까지`;

  return `${end.getMonth() + 1}월 ${end.getDate()}일 ${time}까지`;
}


/** 진행 중인 재고 문자열. "12/50" 또는 total_count가 없으면 "무제한" */
export function formatCouponStock(claimed: number, total: number | null): string {
  if (total == null) return "무제한";
  return `${claimed}/${total}`;
}

/**
 * 유저용 잔여 재고 표기. MD는 "몇 장 나갔나"(claimed/total)가 궁금하지만
 * 유저는 "몇 장 남았나"가 궁금하다. "1/20"을 그대로 보여주면 1장 남은 것으로
 * 정반대로 읽히므로 남은 개수를 명시한다.
 */
/**
 * 타임딜형 카운트다운 — "D-1 08:34:25" / 당일이면 "08:34:25".
 * formatCouponCountdown("내일 새벽 5시까지")과 달리 초 단위로 줄어드는 게 보여
 * 마감이 실제로 다가온다는 압박을 준다. 1초마다 다시 그려야 의미가 있으므로
 * 호출부에서 nowMs를 초 단위로 갱신해 넘긴다.
 */
export function formatCouponTimer(endsAtISO: string, nowMs: number = Date.now()): string {
  const diff = new Date(endsAtISO).getTime() - nowMs;
  if (diff <= 0) return "종료됨";

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hh = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return days > 0 ? `D-${days} ${clock}` : clock;
}

/** 잔여 수량을 노출하기 시작하는 임계치 — 이 이하로 남아야 "N장 남음"이 뜬다. */
export const COUPON_LOW_STOCK_THRESHOLD = 3;

/**
 * 잔여 수량 라벨. 넉넉히 남아 있을 때(임계치 초과) 숫자를 보여주면 오히려
 * 긴박감이 사라지므로 빈 문자열을 돌려주고, 호출부에서 렌더를 생략한다.
 */
export function formatCouponRemaining(claimed: number, total: number | null): string {
  if (total == null) return "수량 무제한";
  const left = Math.max(0, total - claimed);
  if (left === 0) return "모두 소진";
  if (left > COUPON_LOW_STOCK_THRESHOLD) return "";
  return `${left}장 남음`;
}

/**
 * "오늘 쓸 수 있는가" 판정 — 영업일 경계(새벽 6시) 기준으로
 * redeem_ends_at의 영업일이 오늘 영업일 이내면 오늘, 아니면 예정.
 * getClubEventDateFrom()(date.ts)와 동일한 기준선을 그대로 재사용한다.
 */
export function isCouponUsableToday(redeemEndsAtISO: string, todayEventDate: string): boolean {
  return getClubEventDateFrom(redeemEndsAtISO) <= todayEventDate;
}

/** 원 단위 금액을 만원 단위 라벨로. 딱 떨어지지 않으면 원 단위 콤마 표기. */
export function formatWonCompact(won: number): string {
  return won % 10000 === 0
    ? `${(won / 10000).toLocaleString()}만원`
    : `${won.toLocaleString()}원`;
}

/** min_spend를 단위에 맞게 표기. bottle이면 "2병", krw면 만원 단위(기본). Migration 552 */
export function formatMinSpend(minSpend: number, unit: CouponMinSpendUnit = "krw"): string {
  return unit === "bottle" ? `${minSpend}병` : formatWonCompact(minSpend);
}

/**
 * 할인 문구 생성 (Migration 540).
 * "20% 할인" / "5만원 할인" / "50만원↑ 20% 할인" — 할인도 최소금액도 없으면 null.
 * DB의 build_coupon_title()과 표기를 맞춘다.
 */
export function formatDiscount(
  type: CouponDiscountType | null,
  amount: number | null,
  minSpend: number | null,
  minSpendUnit: CouponMinSpendUnit = "krw"
): string | null {
  let discount = "";
  if (type === "percent" && amount != null) discount = `${amount}% 할인`;
  else if (type === "flat" && amount != null) discount = `${formatWonCompact(amount)} 할인`;

  // 할인이 없으면(서비스 바틀 등) prefix만 남아 "2병 이상"처럼 뚝 끊긴다 — "구매시"를 붙여 문장으로 완성한다.
  const prefix = minSpend != null ? `${formatMinSpend(minSpend, minSpendUnit)} 이상 ${discount ? "" : "구매시 "}` : "";
  if (!discount && !prefix) return null;
  return `${prefix}${discount}`.trim();
}

/**
 * 화면에 표시할 쿠폰 이름.
 * benefit_type이 'etc'면 라벨("기타")이 그대로 이름이 되어버리므로
 * MD가 적은 benefit_detail을 대신 쓴다. DB의 build_coupon_title()과 같은 규칙.
 */
export function couponDisplayName(
  benefitType: CouponBenefitType | string,
  benefitDetail?: string | null
): { name: string; emoji: string } {
  const { label, emoji } = benefitTypeLabel(benefitType);
  if (benefitType === "etc") {
    const detail = benefitDetail?.trim();
    return { name: detail || "특별 혜택", emoji: detail ? "🎁" : emoji };
  }
  if (benefitType === "service_bottle") {
    const items = parseBottleItems(benefitDetail);
    const name = items.length > 0 ? `${items.map((b) => `${b.name} ${b.qty}`).join(" + ")} 쿠폰` : label;
    return { name, emoji };
  }
  if (benefitType === "tequila_shot") {
    const detail = benefitDetail?.trim();
    return { name: detail ? `데킬라샷 ${detail} 쿠폰` : label, emoji };
  }
  return { name: label, emoji };
}

/**
 * CouponManager가 저장한 "샴페인 1, 호세 1" 포맷(옛 "N병" 포맷도 호환)을
 * {name, qty} 배열로 되돌린다. 홈 카드·상세 페이지가 이름/숫자를 다른 색으로
 * 렌더링할 때 쓴다 — couponDisplayName()의 문자열 하나만으로는 색 분리가 안 된다.
 */
export function parseBottleItems(detail?: string | null): { name: string; qty: number }[] {
  const trimmed = detail?.trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((part) => {
      const m = part.trim().match(/^(.+?)\s*(\d+)\s*병?$/);
      return m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: part.trim(), qty: NaN };
    })
    .filter((item) => item.name && !Number.isNaN(item.qty));
}

/**
 * 할인 입력이 의미 없는 혜택. 무료입장·프리드링크·프리패스는 "공짜로 주는 것"이라
 * 할인율/할인액 개념이 성립하지 않는다. 주류세트·테이블 할인과 기타만 할인을 받는다.
 */
export const NO_DISCOUNT_BENEFITS: CouponBenefitType[] = [
  "free_entry",
  "free_drink",
  "free_pass",
  "service_bottle",
  "tequila_shot",
];

export function allowsDiscount(type: CouponBenefitType | ""): boolean {
  return type !== "" && !NO_DISCOUNT_BENEFITS.includes(type);
}

/**
 * 최소 구매 조건(min_spend) 입력이 의미 있는 혜택. 무료입장·프리드링크·프리패스는
 * "공짜로 주는 것"이라 구매 조건 자체가 성립하지 않는다. 서비스 바틀은 오히려
 * "x만원/x병 이상 구매시"가 핵심이라 allowsDiscount와 달리 여기서는 포함한다.
 */
export const NO_MIN_SPEND_BENEFITS: CouponBenefitType[] = [
  "free_entry",
  "free_drink",
  "free_pass",
  "tequila_shot",
];

export function allowsMinSpend(type: CouponBenefitType | ""): boolean {
  return type !== "" && !NO_MIN_SPEND_BENEFITS.includes(type);
}

/**
 * 배민식 위계 표기용 분해. "5만원"(강조) + "쿠폰"(약) + "200만원 이상"(조건, 회색)
 * formatDiscount()가 한 줄로 합친 버전이라면, 이건 시각적 위계를 주기 위한 분리형.
 */
export function splitDiscount(
  type: CouponDiscountType | null,
  amount: number | null,
  minSpend: number | null,
  minSpendUnit: CouponMinSpendUnit = "krw"
): { value: string; unit: string; condition: string | null } | null {
  // 할인 값이 없으면 강조할 금액 자체가 없으므로 null (호출부가 혜택명으로 대체)
  if (type == null || amount == null) return null;
  const value = type === "percent" ? `${amount}%` : formatWonCompact(amount);
  return {
    value,
    unit: "쿠폰",
    condition: minSpend != null ? `${formatMinSpend(minSpend, minSpendUnit)} 이상 구매 시` : null,
  };
}

/**
 * 마감이 오늘·내일 안인지. 카드에서 "8월 27일 5시까지"처럼 먼 날짜는
 * 긴박감이 없어 재고 압박("3장 남음")으로 대체하기 위한 판정.
 */
export function isCouponDeadlineNear(endsAtISO: string, nowMs: number = Date.now()): boolean {
  // formatCouponCountdown과 같은 달력 기준이어야 한다.
  // (한쪽만 영업일 기준이면 "내일 새벽 5시"인데 재고가 뜨는 식으로 어긋난다)
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const end = new Date(endsAtISO);
  const now = new Date(nowMs);
  const tomorrow = new Date(nowMs);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dayKey(end) === dayKey(now) || dayKey(end) === dayKey(tomorrow);
}


/**
 * 유저 노출용 쿠폰 필터. clubs.is_test 마킹이 빠진 운영자 테스트 클럽이
 * 프로덕션 홈·목록에 그대로 뜨는 걸 막는다 (ClubBenefitSection의 HIDDEN_PATTERN과 동일 기준).
 *
 * SHOW_TEST_DATA(testData.ts)와 동일한 판정식을 쓴다 — 로컬/프리뷰에서는 테스트
 * 클럽 발행분도 보여야 개발 중 확인이 가능하다. 과거 이 필터에 환경 분기를 걸었다가
 * NEXT_PUBLIC_VERCEL_ENV가 undefined일 때 "필터가 통째로 스킵"되는 사고가 있었는데,
 * 그건 `=== "production"`을 양성 조건으로 잘못 걸었을 때 얘기다.
 * SHOW_TEST_DATA는 `!== "production"`이라 undefined에서도 항상 "테스트 데이터 노출"
 * 쪽으로 떨어지므로(fail-safe), 프로덕션에서 필터가 빠지는 사고는 재현되지 않는다.
 */
export function excludeTestClubCoupons<T extends { club?: { name?: string | null } | null }>(
  rows: T[]
): T[] {
  if (SHOW_TEST_DATA) return rows;
  return rows.filter((r) => !/운영자/.test(r.club?.name ?? ""));
}
