"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function AdminPuzzleRefundButton({ puzzleId }: { puzzleId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRefund = async () => {
    if (!confirm(`깃발 ${puzzleId.slice(0, 8)}의 모든 MD 열람 크레딧을 환불하고 깃발을 취소 처리하겠습니까?\n대표자 계정도 차단됩니다.`)) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("refund_puzzle_unlocks", {
        p_puzzle_id: puzzleId,
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error || "환불 처리에 실패했습니다");
        return;
      }

      toast.success(`환불 완료: ${data.refunded_count}명의 MD에게 크레딧 환불`);
      router.refresh();
    } catch {
      toast.error("환불 처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleRefund}
      disabled={loading}
      className="w-full h-10 bg-red-500 hover:bg-red-400 text-white font-bold text-[13px] rounded-xl"
    >
      {loading ? "처리 중..." : "환불 처리 (MD 크레딧 환불 + 깃발 취소 + 대표자 차단)"}
    </Button>
  );
}
