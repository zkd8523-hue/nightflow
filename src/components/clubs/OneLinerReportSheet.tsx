"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { OneLinerReportReason } from "@/types/database";

const REASONS: { value: OneLinerReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "도배·스팸", hint: "반복 게시, 무관한 내용" },
  { value: "abuse", label: "욕설·비방", hint: "특정인 비방, 모욕적 표현" },
  { value: "false_info", label: "허위·왜곡 정보", hint: "사실과 다른 주장" },
  { value: "advertising", label: "광고·홍보", hint: "외부 업체·계정 홍보" },
  { value: "other", label: "기타", hint: "사유를 직접 적어주세요" },
];

interface Props {
  oneLinerId: string;
  clubId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OneLinerReportSheet({
  oneLinerId,
  clubId,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState<OneLinerReportReason | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setMessage("");
    }
  }, [open]);

  const canSubmit =
    reason !== null &&
    !submitting &&
    (reason !== "other" || message.trim().length >= 5);

  async function handleSubmit() {
    if (!canSubmit || !reason) return;
    setSubmitting(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("로그인이 필요합니다");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("one_liner_reports").insert({
        one_liner_id: oneLinerId,
        club_id: clubId,
        reporter_id: user.id,
        reason,
        message: message.trim() || null,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("이미 신고하신 한 줄 리뷰입니다");
        } else if (
          error.message?.includes("row-level security") ||
          error.code === "42501"
        ) {
          toast.error("본인이 작성한 글은 신고할 수 없습니다");
        } else {
          console.error(error);
          toast.error("신고 처리에 실패했습니다");
        }
        setSubmitting(false);
        return;
      }

      toast.success("신고가 접수되었습니다. 검토 후 처리됩니다.");
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("처리 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-6"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-white text-[16px] text-left">
            한 줄 리뷰 신고
          </SheetTitle>
          <p className="text-[12px] text-neutral-400 text-left">
            허위 정보, 도배, 광고 등은 관리자가 검토 후 조치합니다.
          </p>
        </SheetHeader>

        <div className="mt-3 space-y-1.5">
          {REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selected
                    ? "bg-amber-500/10 border-amber-500 text-white"
                    : "bg-[#0A0A0A] border-neutral-800 text-neutral-300 hover:border-neutral-600"
                }`}
              >
                <div className="text-[14px] font-bold">{r.label}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {r.hint}
                </div>
              </button>
            );
          })}
        </div>

        {reason && (
          <div className="mt-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                reason === "other"
                  ? "신고 사유를 자세히 적어주세요 (최소 5자)"
                  : "추가 설명 (선택)"
              }
              rows={3}
              maxLength={500}
              className="w-full bg-[#0A0A0A] border border-neutral-800 rounded-2xl px-4 py-3 text-white text-[14px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
            />
            <div className="text-right text-[11px] text-neutral-500 mt-1">
              {message.length}/500
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full mt-4 py-3 rounded-full text-[14px] font-black bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
        >
          {submitting ? "처리 중..." : "신고하기"}
        </button>
      </SheetContent>
    </Sheet>
  );
}
