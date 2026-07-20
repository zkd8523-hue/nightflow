"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  offerId: string;
  variant?: "compact" | "full";
  onWithdrawn?: () => void;
}

const PRESET_REASONS = [
  "조금더 자세한 오퍼를 해주세요.",
  "개인을 특정할 수 있는 정보는 제외해주세요.",
] as const;

const CUSTOM_KEY = "__custom__";

export function AdminWithdrawOfferButton({ offerId, variant = "compact", onWithdrawn }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const reset = () => {
    setSelected(PRESET_REASONS[0]);
    setCustomReason("");
  };

  const handleWithdraw = async () => {
    const reason =
      selected === CUSTOM_KEY ? customReason.trim() : selected.trim();

    if (selected === CUSTOM_KEY && !reason) {
      toast.error("사유를 입력해주세요");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_withdraw_offer", {
        p_offer_id: offerId,
        p_reason: reason || null,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "철회에 실패했습니다");
        return;
      }
      toast.success("제안이 철회됐습니다");
      setOpen(false);
      reset();
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
    <>
      <button onClick={() => setOpen(true)} disabled={loading} className={className}>
        {loading ? "처리 중..." : "강제 철회"}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (loading) return;
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-black text-foreground">
              제안 강제 철회
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-[13px] text-muted-foreground">
              파트너에게 알림이 발송되고 슬롯이 회복됩니다.
            </p>

            <div className="space-y-2">
              <p className="text-[12px] font-bold text-foreground/80">
                철회 사유 <span className="text-red-400 font-normal">*</span>
              </p>
              <div className="space-y-1.5">
                {PRESET_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                      selected === reason
                        ? "bg-red-500/10 border-red-500/40"
                        : "bg-card border-border hover:border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="withdraw-reason"
                      value={reason}
                      checked={selected === reason}
                      onChange={() => setSelected(reason)}
                      className="mt-0.5 accent-red-500"
                    />
                    <span className="text-[13px] text-foreground leading-snug">
                      {reason}
                    </span>
                  </label>
                ))}

                <label
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                    selected === CUSTOM_KEY
                      ? "bg-red-500/10 border-red-500/40"
                      : "bg-card border-border hover:border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="withdraw-reason"
                    value={CUSTOM_KEY}
                    checked={selected === CUSTOM_KEY}
                    onChange={() => setSelected(CUSTOM_KEY)}
                    className="mt-0.5 accent-red-500"
                  />
                  <span className="text-[13px] text-foreground leading-snug">
                    기타 (직접 입력)
                  </span>
                </label>
              </div>

              {selected === CUSTOM_KEY && (
                <div className="space-y-1">
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="파트너에게 전달할 사유를 입력해주세요"
                    rows={3}
                    maxLength={300}
                    autoFocus
                    className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-border transition-colors"
                  />
                  <p className="text-[11px] text-muted-foreground text-right">
                    {customReason.length}/300
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-muted text-foreground/80 text-[13px] font-bold hover:bg-muted transition-all disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleWithdraw}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {loading ? "처리 중..." : "강제 철회"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
