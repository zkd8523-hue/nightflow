"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface Props {
  offerId: string;
  variant?: "compact" | "full";
  onWithdrawn?: () => void;
}

export function AdminWithdrawOfferButton({ offerId, variant = "compact", onWithdrawn }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleWithdraw = async () => {
    if (!confirm("이 제안을 강제 철회하시겠습니까?\nMD에게 알림이 발송되고 슬롯이 회복됩니다.")) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_withdraw_offer", {
        p_offer_id: offerId,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "철회에 실패했습니다");
        return;
      }
      toast.success("제안이 철회됐습니다");
      onWithdrawn?.();
      router.refresh();
    } catch (err) {
      console.error("admin_withdraw_offer error:", err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(`철회 처리 중 오류: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const className =
    variant === "full"
      ? "px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
      : "px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50";

  return (
    <button onClick={handleWithdraw} disabled={loading} className={className}>
      {loading ? "처리 중..." : "강제 철회"}
    </button>
  );
}
