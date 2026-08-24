"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { couponDisplayName, formatCouponCountdown, formatCouponStock, formatDiscount } from "@/lib/utils/coupon";
import type { CouponIssue } from "@/types/database";

interface Props {
  coupon: CouponIssue;
  onCancel?: () => void;
  /** 취소·만료된 발행분에서 같은 설정으로 폼을 다시 채우는 콜백 (카페24 "복사" 패턴) */
  onReissue?: () => void;
  /** 삭제 모드 — 카드마다 휴지통을 두면 목록이 시끄럽다 (파티와 동일 패턴) */
  deleteMode?: boolean;
  deletePicked?: boolean;
  onTogglePick?: () => void;
  /** 자주 쓰는 세팅으로 고정 — 지난 쿠폰 목록 맨 위로 */
  onToggleFavorite?: () => void;
}

const STATUS_LABEL: Record<CouponIssue["status"], { text: string; className: string }> = {
  active: { text: "발행중", className: "bg-green-500/15 text-green-400" },
  sold_out: { text: "소진됨", className: "bg-muted text-muted-foreground" },
  cancelled: { text: "취소됨", className: "bg-red-500/15 text-red-400" },
  expired: { text: "종료됨", className: "bg-muted text-muted-foreground" },
};

export function CouponIssueCard({ coupon, onCancel, onReissue, onToggleFavorite, deleteMode, deletePicked, onTogglePick }: Props) {
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const discountLabel = formatDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend);
  const status = STATUS_LABEL[coupon.status];
  const isLive = coupon.status === "active" || coupon.status === "sold_out";

  return (
    <Wrapper
      href={!deleteMode && isLive ? `/md/coupons/${coupon.id}` : undefined}
      onClick={deleteMode ? onTogglePick : undefined}
      className={`block bg-card border border-border rounded-xl p-3.5 space-y-2 ${
        deleteMode ? "cursor-pointer" : ""
      } ${deleteMode && !deletePicked ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        {deleteMode && (
          <span
            className={`w-[18px] h-[18px] mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
              deletePicked ? "bg-red-500 border-red-500" : "border-muted-foreground"
            }`}
          >
            {deletePicked && <span className="text-white text-[11px] font-black leading-none">✓</span>}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[13px]">{display.emoji}</span>
            <span className="text-[12px] font-bold text-muted-foreground">{display.name}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status.className}`}>
              {status.text}
            </span>
          </div>
          <p className="text-[14px] font-black text-foreground truncate">
            {discountLabel ?? display.name}
          </p>
        </div>
        {onCancel && isLive && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
            className="shrink-0 text-[11px] text-muted-foreground hover:text-red-400 font-bold"
          >
            취소
          </button>
        )}
        {!isLive && !deleteMode && onReissue && (
          <div className="shrink-0 flex items-center gap-2.5">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); }}
                aria-label={coupon.is_favorite ? "자주 쓰기 해제" : "자주 쓰기"}
                title={coupon.is_favorite ? "자주 쓰기 해제" : "자주 쓰기"}
                className={`transition-colors ${
                  coupon.is_favorite
                    ? "text-brand-amber"
                    : "text-muted-foreground hover:text-brand-amber"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${coupon.is_favorite ? "fill-current" : ""}`} />
              </button>
            )}
            {onReissue && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReissue(); }}
                className="text-[11px] text-brand-amber hover:underline font-bold whitespace-nowrap"
              >
                다시 발행
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatCouponStock(coupon.claimed_count, coupon.total_count)} 받음 · {coupon.redeemed_count} 사용</span>
        <span>{isLive ? formatCouponCountdown(coupon.redeem_ends_at) : ""}</span>
      </div>

    </Wrapper>
  );
}

/** 진행 중이면 카드 전체가 상세 링크, 아니면 평범한 div */
function Wrapper({
  href,
  className,
  onClick,
  children,
}: {
  href?: string;
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className} onClick={onClick}>{children}</div>;
  return (
    <Link href={href} className={`${className} active:opacity-70 transition-opacity`}>
      {children}
    </Link>
  );
}
