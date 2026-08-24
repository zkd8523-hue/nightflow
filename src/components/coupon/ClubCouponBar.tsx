"use client";

import { useEffect, useMemo, useState } from "react";
import { Ticket, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ClubCouponSheet } from "@/components/coupon/ClubCouponSheet";
import type { CouponIssue } from "@/types/database";

/**
 * 클럽 상세 쿠폰 띠 — 배민 "픽업 3,000원 즉시할인 + 쿠폰" 패턴.
 * 상세엔 한 줄만 두고, 탭하면 하단 시트에서 받는다.
 * 활성 쿠폰이 없으면 렌더하지 않는다.
 */
export function ClubCouponBar({ clubId }: { clubId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [coupons, setCoupons] = useState<CouponIssue[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("coupon_issues")
        .select("*, club:clubs(id, name, area, thumbnail_url)")
        .eq("club_id", clubId)
        .in("status", ["active", "sold_out"])
        .gt("redeem_ends_at", new Date().toISOString())
        .order("redeem_ends_at", { ascending: true });
      if (!cancelled) setCoupons((data ?? []) as unknown as CouponIssue[]);
    })();
    return () => { cancelled = true; };
  }, [supabase, clubId]);

  if (!coupons || coupons.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full flex items-center justify-between gap-2 h-12 px-4 rounded-xl bg-card border border-amber-500/30 active:scale-[0.98] transition-transform"
      >
        <span className="flex items-center gap-2 text-[13px] font-black text-foreground">
          <Ticket className="w-4 h-4 text-brand-amber" />
          받을 수 있는 쿠폰 {coupons.length}개
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>
      <ClubCouponSheet open={sheetOpen} onOpenChange={setSheetOpen} coupons={coupons} />
    </>
  );
}
