import { createServerClient } from "@supabase/ssr";
import { normalizeDowSlots } from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

/** 쿠키 없는 익명 SSR 클라이언트 — 쿠폰·간판 모두 공개 SELECT다. */
function anonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export interface WeeklyCouponGroup {
  clubId: string;
  clubName: string;
  clubArea: string | null;
  thumbnail: string | null;
  /** 배지에 적을 혜택 이름들 */
  labels: string[];
  /** 같은 클럽 쿠폰이 여러 장이면 첫 장으로 보낸다 */
  firstCouponId: string;
  count: number;
}

export interface WeeklyGuestSign {
  clubId: string;
  clubName: string;
  clubArea: string | null;
  thumbnail: string | null;
  /** 이번 주에 걸린 혜택 라벨(요일 전체에서 중복 제거) */
  labels: string[];
  /** MD 가 직접 쓴 문구 — "여자게스트 무료" 같은 조건이 여기 들어간다 */
  note: string | null;
}

/**
 * 호 본문에 실을 쿠폰 — 클럽별로 묶는다.
 *
 * 묶는 이유: 한 클럽이 쿠폰을 다섯 장 걸면 다섯 줄이 되어 본문이 광고판이 된다.
 * 클럽 한 줄 + 혜택 배지로 접으면 "어디서 뭘 받는지"가 한눈에 들어온다.
 */
export async function getWeeklyCoupons(limit = 3): Promise<WeeklyCouponGroup[]> {
  const sb = anonClient();
  const { data } = await sb
    .from("coupon_issues")
    .select(
      "id, club_id, benefit_type, benefit_detail, discount_type, discount_amount, redeem_ends_at, club:clubs(name, area, thumbnail_url, is_test)"
    )
    .eq("status", "active")
    .gt("redeem_ends_at", new Date().toISOString())
    .order("redeem_ends_at", { ascending: true })
    .limit(40);

  const { couponDisplayName, splitDiscount } = await import("@/lib/utils/coupon");
  const groups = new Map<string, WeeklyCouponGroup>();

  for (const row of data ?? []) {
    const club = Array.isArray(row.club) ? row.club[0] : row.club;
    if (!club || club.is_test) continue;      // 테스트 클럽은 싣지 않는다(301 규약)

    // 배지 문구: 할인 쿠폰은 금액이 주인공, 그 외는 혜택 이름이 주인공
    const split = splitDiscount(row.discount_type, row.discount_amount, null);
    const label = split
      ? `${split.value} ${split.unit}`
      : couponDisplayName(row.benefit_type, row.benefit_detail).name;

    const g = groups.get(row.club_id);
    if (g) {
      if (!g.labels.includes(label) && g.labels.length < 3) g.labels.push(label);
      g.count += 1;
    } else {
      groups.set(row.club_id, {
        clubId: row.club_id,
        clubName: club.name,
        clubArea: club.area ?? null,
        thumbnail: club.thumbnail_url ?? null,
        labels: [label],
        firstCouponId: row.id,
        count: 1,
      });
    }
  }

  return [...groups.values()].slice(0, limit);
}

/**
 * 이번 주 게스트 간판.
 *
 * 간판은 매주 월 18시에 새로 열린다(Migration 283) — 지난주 슬롯은 이번 주에
 * 유효하지 않으므로 expires_at 으로 거른다. 요일별로 같은 혜택이 반복되는 경우가
 * 많아 라벨은 중복을 지우고 한 줄로 합친다.
 */
export async function getWeeklyGuestSigns(limit = 3): Promise<WeeklyGuestSign[]> {
  const sb = anonClient();
  const { data } = await sb
    .from("weekly_hotdeal_slots")
    .select("club_id, benefits_by_dow, expires_at, clubs(name, area, thumbnail_url, is_test)")
    .gt("expires_at", new Date().toISOString())
    .limit(20);

  const { benefitLabel } = await import("@/lib/utils/hotdeal");
  const out: WeeklyGuestSign[] = [];

  for (const row of data ?? []) {
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    if (!club || club.is_test) continue;

    const labels: string[] = [];
    let note: string | null = null;

    const byDow = (row.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
    const DOWS: HotdealDow[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    for (const dow of DOWS) {
      for (const slot of normalizeDowSlots(byDow[dow])) {
        for (const tag of slot.benefits ?? []) {
          const { label } = benefitLabel(tag);
          if (label && !labels.includes(label)) labels.push(label);
        }
        // MD 가 쓴 문구는 조건이 담겨 있어 버리면 안 된다("여자게스트 무료")
        if (!note && slot.text?.trim()) note = slot.text.trim();
      }
    }

    if (labels.length === 0 && !note) continue;   // 빈 슬롯은 싣지 않는다

    out.push({
      clubId: row.club_id,
      clubName: club.name,
      clubArea: club.area ?? null,
      thumbnail: club.thumbnail_url ?? null,
      labels: labels.slice(0, 3),
      note,
    });
  }

  return out.slice(0, limit);
}
