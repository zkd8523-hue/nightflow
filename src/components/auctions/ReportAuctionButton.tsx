"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ReportAuctionButtonProps {
  auctionId: string;
}

const REASONS = [
  { value: "fake_listing", label: "허위매물", desc: "실제 테이블이 없거나 정보가 거짓" },
  { value: "scam_suspect", label: "사기 의심", desc: "금전적 피해가 우려되는 게시글" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

export function ReportAuctionButton({ auctionId }: ReportAuctionButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("신고 사유를 선택해주세요");
      return;
    }
    if (reason === "other" && !memo.trim()) {
      toast.error("기타 사유를 입력해주세요");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("로그인이 필요합니다");
        return;
      }

      // 이미 신고했는지 확인
      const { data: existing } = await supabase
        .from("auction_reports")
        .select("id")
        .eq("auction_id", auctionId)
        .eq("reporter_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.info("이미 신고한 게시글입니다");
        setOpen(false);
        return;
      }

      const { error } = await supabase
        .from("auction_reports")
        .insert({ auction_id: auctionId, reporter_id: user.id, reason, memo: memo.trim() || null });

      if (error) {
        toast.error("신고 처리 중 문제가 발생했습니다");
      } else {
        toast.success("신고가 접수되었습니다", {
          description: "관리자가 확인 후 조치하겠습니다.",
        });
      }

      setOpen(false);
      setReason("");
      setMemo("");
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 py-3 group mx-auto"
      >
        <AlertTriangle className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
        <span className="text-[11px] text-neutral-600 font-medium group-hover:text-neutral-400 transition-colors">
          이 게시글 신고
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-white text-[16px]">게시글 신고</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    reason === r.value
                      ? "border-red-500/50 bg-red-500/10"
                      : "border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700"
                  }`}
                >
                  <p className={`text-[14px] font-bold ${reason === r.value ? "text-red-400" : "text-white"}`}>
                    {r.label}
                  </p>
                  <p className="text-[12px] text-neutral-500 mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={reason === "other" ? "신고 사유를 입력해주세요 (필수)" : "추가 설명 (선택)"}
              className="w-full h-20 bg-[#0A0A0A] border border-neutral-800 rounded-xl p-3 text-[13px] text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
              maxLength={500}
            />

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => { setOpen(false); setReason(""); setMemo(""); }}
                className="h-12 rounded-xl border-neutral-800 text-neutral-400 font-bold"
              >
                취소
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !reason || (reason === "other" && !memo.trim())}
                className="h-12 rounded-xl font-black text-base bg-red-500 hover:bg-red-600 text-white disabled:opacity-40"
              >
                {loading ? "처리 중..." : "신고하기"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
