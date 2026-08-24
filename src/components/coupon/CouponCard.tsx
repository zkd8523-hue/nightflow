"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { benefitTypeLabel, couponDisplayName, formatCouponCountdown, formatCouponRemaining, formatDiscount } from "@/lib/utils/coupon";
import type { CouponIssue } from "@/types/database";

interface Props {
  coupon: CouponIssue;
  now: number;
  /** 예정 섹션에서는 날짜 배지를 붙인다 */
  dateLabel?: string | null;
}

export function CouponCard({ coupon, now, dateLabel }: Props) {
  const thumb = coupon.thumbnail_url || coupon.club?.thumbnail_url || null;
  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const countdown = formatCouponCountdown(coupon.redeem_ends_at, now);
  const soldOut = coupon.status === "sold_out";
  const stock = formatCouponRemaining(coupon.claimed_count, coupon.total_count);
  const discountLabel = formatDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend);
  const progressPct =
    coupon.total_count != null
      ? Math.min(100, Math.round((coupon.claimed_count / coupon.total_count) * 100))
      : null;

  return (
    <Link
      href={`/coupons/${coupon.id}`}
      className="flex gap-3 py-4 border-b border-border/60 active:opacity-70 transition-opacity"
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
        {thumb ? (
          <Image src={thumb} alt={coupon.club?.name ?? label} fill sizes="80px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[24px] font-black text-foreground/30">
            {coupon.club?.name?.charAt(0) ?? emoji}
          </div>
        )}
        {dateLabel && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-black">
            {dateLabel}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-brand-amber">{display.emoji} {display.name}</span>
          </div>
          <p className="text-foreground font-black text-[14px] leading-snug line-clamp-1">
            {coupon.club?.name ?? ""}
          </p>
          <p className="text-muted-foreground text-[11px] line-clamp-1">
            {[discountLabel, coupon.club?.area].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="space-y-1 mt-2">
          {progressPct !== null && (
            <div className="h-1 rounded-full bg-muted overflow-hidden w-full max-w-[140px]">
              <div
                className={`h-full ${soldOut ? "bg-muted-foreground" : "bg-amber-500"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground">{stock}</span>
            <span className={`text-[11px] font-black inline-flex items-center gap-1 ${soldOut ? "text-muted-foreground" : "text-brand-amber"}`}>
              <Clock className="w-3 h-3" />
              {soldOut ? "소진됨" : countdown}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
