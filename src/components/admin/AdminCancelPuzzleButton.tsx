"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function AdminCancelPuzzleButton({ puzzleId }: { puzzleId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCancel = async () => {
    if (!confirm(`깃발을 강제 취소하시겠습니까?\n참여자 알림이 발송되고 MD 오퍼 슬롯이 회복됩니다.`)) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_cancel_puzzle", {
        p_puzzle_id: puzzleId,
      });

      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "취소에 실패했습니다");
        return;
      }

      toast.success("깃발이 취소됐습니다");
      router.refresh();
    } catch {
      toast.error("취소 처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
    >
      {loading ? "처리 중..." : "깃발 내리기"}
    </button>
  );
}
