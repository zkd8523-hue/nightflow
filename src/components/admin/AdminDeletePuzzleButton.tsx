"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AdminDeletePuzzleButton({ puzzleId }: { puzzleId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    if (!confirm("깃발 기록을 완전히 삭제합니다.\n\n관련된 모든 제안/신고/관심/설문 기록이 함께 삭제되며 되돌릴 수 없습니다.\n\n진행할까요?")) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_delete_puzzle", { p_puzzle_id: puzzleId });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "삭제 실패");
      toast.success("깃발 기록이 삭제됐습니다");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 중 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/40 text-red-300 text-[12px] font-bold hover:bg-red-600/30 transition-all disabled:opacity-50"
    >
      <Trash2 className="w-3 h-3" />
      {loading ? "삭제 중..." : "기록 삭제"}
    </button>
  );
}
