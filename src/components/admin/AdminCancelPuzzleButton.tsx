"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function AdminCancelPuzzleButton({ puzzleId }: { puzzleId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCancel = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_cancel_puzzle", {
        p_puzzle_id: puzzleId,
        p_reason: reason.trim() || null,
      });

      // 진단용 로그 — 실패 시 원인 추적
      if (error || !data?.success) {
        console.error("[admin_cancel_puzzle] error:", error, "data:", data);
      }

      if (error) {
        // PostgREST 에러 (PGRST202 = 함수 시그니처 mismatch → migration 165 미적용 가능성)
        const code = (error as { code?: string }).code;
        if (code === "PGRST202") {
          toast.error("DB 함수가 최신이 아닙니다 (migration 165 미적용)");
        } else {
          toast.error(error.message || "취소 처리 중 오류가 발생했습니다");
        }
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || "취소에 실패했습니다 (응답 비어있음)");
        return;
      }

      toast.success("취소됐습니다");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      console.error("[admin_cancel_puzzle] catch:", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`취소 처리 중 오류: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] font-bold hover:bg-red-500/20 transition-all"
      >
        깃발 내리기
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!loading) { setOpen(v); if (!v) setReason(""); } }}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-black text-foreground">
              깃발 강제 취소
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-[13px] text-muted-foreground">
              참여자 전원에게 알림이 발송됩니다.
            </p>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-foreground/80">
                취소 사유 <span className="text-muted-foreground font-normal">(선택)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예) 공연 취소로 인해 해당 날짜 영업이 중단됩니다."
                rows={3}
                maxLength={200}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-border transition-colors"
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {reason.length}/200
              </p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <p className="text-[12px] text-red-400">
                취소 후 되돌릴 수 없습니다. 파트너 오퍼 슬롯이 회복됩니다.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => { setOpen(false); setReason(""); }}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-muted text-foreground/80 text-[13px] font-bold hover:bg-muted transition-all disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {loading ? "처리 중..." : "깃발 내리기"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
