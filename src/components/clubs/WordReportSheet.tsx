"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/** 488 마이그레이션의 reason CHECK와 동일 */
const REPORT_REASONS = [
  { value: "abuse", label: "욕설·혐오", desc: "비속어, 모욕, 혐오 표현" },
  { value: "false_info", label: "허위사실", desc: "사실과 다른 내용으로 클럽을 깎아내림" },
  { value: "privacy", label: "개인정보·명예훼손", desc: "특정인 지목, 신상 노출" },
  { value: "advertising", label: "광고", desc: "홍보 목적의 단어" },
  { value: "spam", label: "스팸·도배", desc: "의미 없는 반복 입력" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  /** 화면에 보이는 원본 표기 */
  label: string | null;
  /** 집계/삭제 키 (normalizeWord 결과) */
  normalized: string | null;
  reporterId: string | null;
}

/**
 * 워드클라우드 단어 신고 시트.
 * 로그인 유저면 role 무관(유저/MD 모두) 신고 가능, 본인이 남긴 단어는 DB에서 차단.
 * 신고가 들어가면 트리거(488)가 admin에게 바로 푸시를 보낸다.
 */
export function WordReportSheet({
  open,
  onOpenChange,
  clubId,
  label,
  normalized,
  reporterId,
}: Props) {
  const [reason, setReason] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);

  // 닫힐 때 초기화 (다음에 다른 단어로 열려도 이전 선택이 남지 않도록)
  function close() {
    setReason("");
    setMemo("");
    onOpenChange(false);
  }

  async function submit() {
    if (!normalized || !reporterId) return;
    if (!reason) {
      toast.error("신고 사유를 선택해주세요");
      return;
    }
    if (reason === "other" && !memo.trim()) {
      toast.error("기타 사유를 입력해주세요");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("club_word_cloud_reports").insert({
      club_id: clubId,
      normalized_word: normalized,
      word_label: label,
      reporter_id: reporterId,
      reason,
      memo: memo.trim() || null,
    });
    setLoading(false);

    if (error) {
      if (error.code === "23505") {
        toast.info("이미 신고한 단어예요");
        close();
      } else if (error.code === "42501") {
        toast.error("본인이 남긴 단어는 신고할 수 없어요");
      } else if (error.code === "42P01") {
        toast.error("아직 준비 중인 기능이에요 (DB 미적용)");
      } else {
        console.error("[WordReportSheet] insert error", error);
        toast.error("신고 처리 중 문제가 발생했어요");
      }
      return;
    }

    toast.success("신고가 접수됐어요", {
      description: "관리자가 확인 후 조치할게요.",
    });
    close();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <SheetContent
        side="bottom"
        className="bg-card border-border rounded-t-3xl max-w-lg mx-auto max-h-[90vh] overflow-y-auto pb-8"
      >
        <SheetHeader className="pb-2 text-left">
          <SheetTitle className="text-foreground text-[16px]">
            <span className="text-pink-400">{label}</span> 신고
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-[12px] mt-1">
            신고 사유를 선택해주세요. 관리자가 확인 후 삭제 여부를 결정합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  reason === r.value
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-border bg-background hover:border-border"
                }`}
              >
                <p
                  className={`text-[14px] font-bold ${
                    reason === r.value ? "text-red-400" : "text-foreground"
                  }`}
                >
                  {r.label}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{r.desc}</p>
              </button>
            ))}
          </div>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={
              reason === "other" ? "신고 사유를 입력해주세요 (필수)" : "추가 설명 (선택)"
            }
            className="w-full h-20 bg-background border border-border rounded-xl p-3 text-[13px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-border"
            maxLength={500}
          />

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={close}
              className="h-12 rounded-xl border-border text-muted-foreground font-bold"
            >
              취소
            </Button>
            <Button
              onClick={submit}
              disabled={loading || !reason || (reason === "other" && !memo.trim())}
              className="h-12 rounded-xl font-black text-base bg-red-500 hover:bg-red-600 text-white disabled:opacity-40"
            >
              {loading ? "처리 중..." : "신고하기"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
