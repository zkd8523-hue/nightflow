"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface Props {
  issueId: string;
  disabled?: boolean;
  disabledLabel?: string;
  /** 이미 보유 중이면 claim id — 있으면 버튼이 "보유중"으로 바뀌고 내 쿠폰함으로 이동 */
  existingClaimId?: string | null;
  onClaimed?: (claimId: string) => void;
}

export function CouponClaimButton({ issueId, disabled, disabledLabel, existingClaimId, onClaimed }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [claimId, setClaimId] = useState<string | null>(existingClaimId ?? null);

  if (claimId) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/my-coupons/${claimId}/use`)}
        className="w-full h-12 rounded-xl bg-card border border-amber-500/50 text-brand-amber font-black text-[14px]"
      >
        보유중 · 사용하러 가기
      </button>
    );
  }

  if (disabled) {
    return (
      <button type="button" disabled className="w-full h-12 rounded-xl bg-muted text-muted-foreground font-black text-[14px]">
        {disabledLabel ?? "받을 수 없어요"}
      </button>
    );
  }

  const handleClaim = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?redirect=/coupons/${issueId}`);
        return;
      }
      const { data, error } = await supabase.rpc("claim_coupon", { p_issue_id: issueId });
      if (error) {
        toast.error("받기 실패");
        return;
      }
      const result = data as { success: boolean; error?: string; claim_id?: string };
      if (!result?.success) {
        toast.error(result?.error || "받기 실패");
        return;
      }
      toast.success("쿠폰을 받았어요! 내 쿠폰함에서 확인하세요", {
        action: {
          label: "쿠폰함 바로가기",
          onClick: () => router.push("/my-coupons"),
        },
      });
      if (result.claim_id) {
        setClaimId(result.claim_id);
        onClaimed?.(result.claim_id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClaim}
      disabled={busy}
      className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-[14px]"
    >
      {busy ? "받는 중..." : "쿠폰 받기"}
    </button>
  );
}
