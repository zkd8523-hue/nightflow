"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { benefitTypeLabel, couponDisplayName, formatCouponCountdown, formatCouponRemaining, isCouponDeadlineNear, splitDiscount } from "@/lib/utils/coupon";
import { hideTestData } from "@/lib/utils/testData";
import type { CouponIssue } from "@/types/database";

const MAX_CARDS = 8;

/**
 * 홈 쿠폰 스트립 — 게스트 간판(ClubBenefitSection) 바로 아래.
 * daily_hotdeals의 HotdealHomeSection이 폐기된 자리에 새로 노출되는 카드형 가로 스크롤.
 * 활성 쿠폰이 0건이면 섹션 자체를 렌더하지 않는다.
 */
export function CouponHomeStrip() {
  const supabase = useMemo(() => createClient(), []);
  const [coupons, setCoupons] = useState<CouponIssue[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await hideTestData(
        supabase
          .from("coupon_issues")
          .select("*, club:clubs(id, name, area, thumbnail_url)")
          .in("status", ["active", "sold_out"])
          .gt("redeem_ends_at", new Date().toISOString())
          .order("redeem_ends_at", { ascending: true })
          .limit(MAX_CARDS),
        "clubs"
      );
      if (!cancelled) setCoupons((data ?? []) as unknown as CouponIssue[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (coupons === null || coupons.length === 0) return null;

  return (
    <section className="space-y-2">
      <Link href="/coupons" className="flex items-baseline justify-between px-1">
        <h2 className="text-[18px] font-black text-foreground flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🎟️</span>
          오늘의 쿠폰
        </h2>
        <span className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5">
          더보기
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </Link>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x snap-proximity touch-pan-x touch-pan-y"
      >
        {coupons.map((c) => (
          <CouponHomeCard key={c.id} coupon={c} now={now} />
        ))}
      </div>
    </section>
  );
}

function CouponHomeCard({ coupon, now }: { coupon: CouponIssue; now: number }) {
  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const thumb = coupon.thumbnail_url || coupon.club?.thumbnail_url || null;
  const soldOut = coupon.status === "sold_out";
  const near = isCouponDeadlineNear(coupon.redeem_ends_at, now);
  const discount = splitDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend);

  return (
    <Link
      href={`/coupons/${coupon.id}`}
      className="shrink-0 w-40 snap-start rounded-xl overflow-hidden bg-card border border-border active:opacity-70 transition-opacity"
    >
      <div className="relative w-full h-24 bg-muted">
        {thumb ? (
          <Image src={thumb} alt={coupon.club?.name ?? label} fill sizes="160px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[24px]">{emoji}</div>
        )}
      </div>
      <div className="p-2.5 space-y-0.5">
        {/* 1줄: 할인 금액 또는 혜택명 */}
        {discount ? (
          <p className="text-[15px] font-black leading-tight truncate">
            <span className="text-brand-amber">{discount.value}</span>
            <span className="text-foreground ml-1">{discount.unit}</span>
          </p>
        ) : (
          <p className="text-[15px] font-black text-foreground leading-tight truncate">
            {display.name}
          </p>
        )}

        {/* 2줄: 부가 설명. 할인이면 조건, 아니면 혜택 부연 — 없어도 자리를 비워 높이를 맞춘다 */}
        <p className="text-[11px] font-bold text-muted-foreground truncate min-h-[16px]">
          {discount
            ? (discount.condition ?? display.name)
            : (coupon.club?.area ?? "")}
        </p>

        {/* 3줄: 클럽명 — 항상 같은 자리, 같은 색 */}
        <p className="text-[11px] font-bold text-foreground truncate pt-1">
          {coupon.club?.name ?? ""}
        </p>

        {/* 4줄: 남은 시간 */}
        <div className={`flex items-center gap-0.5 text-[10px] font-bold ${soldOut ? "text-muted-foreground" : "text-brand-amber"}`}>
          {near && <Clock className="w-2.5 h-2.5 shrink-0" />}
          <span className="truncate">
            {soldOut
              ? "소진됨"
              : near
                ? formatCouponCountdown(coupon.redeem_ends_at, now)
                : formatCouponRemaining(coupon.claimed_count, coupon.total_count)}
          </span>
        </div>
      </div>
    </Link>
  );
}
