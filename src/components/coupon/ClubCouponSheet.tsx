"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { benefitTypeLabel, couponDisplayName, formatCouponCountdown, formatCouponRemaining, formatDiscount } from "@/lib/utils/coupon";
import type { CouponIssue } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupons: CouponIssue[];
}

/** 배민식 쿠폰 카드 목록 시트 — 절취선 카드 + 우측 받기/보유중 스탬프 */
export function ClubCouponSheet({ open, onOpenChange, coupons }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl !max-h-[80vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-[18px] font-black text-foreground text-left">이 클럽 쿠폰</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 space-y-3">
          {coupons.map((c) => (
            <CouponTicketRow key={c.id} coupon={c} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CouponTicketRow({ coupon }: { coupon: CouponIssue }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [claimId, setClaimId] = useState<string | null>(null);
  const { label, emoji } = benefitTypeLabel(coupon.benefit_type);
  const display = couponDisplayName(coupon.benefit_type, coupon.benefit_detail);
  const discountLabel = formatDiscount(coupon.discount_type, coupon.discount_amount, coupon.min_spend, coupon.min_spend_unit);
  const soldOut = coupon.status === "sold_out";
  const stock = formatCouponRemaining(coupon.claimed_count, coupon.total_count);

  const handleClaim = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?redirect=/coupons/${coupon.id}`);
        return;
      }
      const { data, error } = await supabase.rpc("claim_coupon", { p_issue_id: coupon.id });
      if (error) {
        toast.error("받기 실패");
        return;
      }
      const result = data as { success: boolean; error?: string; claim_id?: string };
      if (!result?.success) {
        toast.error(result?.error || "받기 실패");
        return;
      }
      toast.success("쿠폰을 받았어요!");
      if (result.claim_id) setClaimId(result.claim_id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-stretch bg-card border border-border rounded-xl overflow-hidden">
      {/* 절취선 카드 본문 */}
      <div className="flex-1 p-3.5 space-y-1">
        <p className="text-[14px] font-black text-foreground leading-snug">
          <span className="mr-1">{display.emoji}</span>{display.name}
        </p>
        {discountLabel && (
          <span className="text-[11px] font-bold text-brand-amber">{discountLabel}</span>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {stock && (
            <>
              <span>{stock}</span>
              <span>·</span>
            </>
          )}
          <span>{soldOut ? "소진됨" : formatCouponCountdown(coupon.redeem_ends_at)}</span>
        </div>
      </div>

      {/* 절취선 — 상하 모서리에 반쯤 파인 노치 + 그 사이를 잇는 점선 */}
      <div className="relative w-0" aria-hidden>
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-background border border-border" />
        <span className="absolute inset-y-2 left-0 border-l border-dashed border-border" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full bg-background border border-border" />
      </div>

      {/* 액션 영역 */}
      <div className="w-24 flex items-center justify-center p-2">
        {claimId ? (
          <button
            type="button"
            onClick={() => router.push(`/my-coupons/${claimId}/use`)}
            className="text-[12px] font-black text-brand-amber"
          >
            보유중
          </button>
        ) : soldOut ? (
          <span className="text-[12px] font-bold text-muted-foreground">소진됨</span>
        ) : (
          <button
            type="button"
            onClick={handleClaim}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-[12px] font-black"
          >
            {busy ? "..." : "받기"}
          </button>
        )}
      </div>
    </div>
  );
}
