"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  offerId: string;
  label?: string;
  onDeleted?: () => void;
}

export function AdminDeleteOfferButton({ offerId, label = "제안 삭제", onDeleted }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    if (!confirm("이 제안 기록을 완전히 삭제합니다.\n되돌릴 수 없습니다. 진행할까요?")) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_delete_puzzle_offer", { p_offer_id: offerId });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "삭제 실패");
      toast.success("제안 기록이 삭제됐습니다");
      if (onDeleted) onDeleted();
      else router.refresh();
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
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600/15 border border-red-600/30 text-red-300 text-[10px] font-bold hover:bg-red-600/25 transition-all disabled:opacity-50"
    >
      <Trash2 className="w-3 h-3" />
      {loading ? "삭제 중..." : label}
    </button>
  );
}
