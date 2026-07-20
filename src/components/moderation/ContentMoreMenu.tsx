"use client";

import { useState, useEffect } from "react";
import { MoreHorizontal, AlertTriangle, Ban, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type ContentType = "auction" | "puzzle";
type Step = "menu" | "report" | "block";

interface ContentMoreMenuProps {
  contentType: ContentType;
  contentId: string;
  targetUserId: string;
  targetDisplayName?: string | null;
}

// 콘텐츠 타입별 신고 사유
const AUCTION_REPORT_REASONS = [
  { value: "fake_listing", label: "허위매물", desc: "실제 테이블이 없거나 정보가 거짓" },
  { value: "scam_suspect", label: "사기 의심", desc: "금전적 피해가 우려되는 게시글" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

const PUZZLE_REPORT_REASONS = [
  { value: "scam_suspect", label: "사기 의심", desc: "금전적 피해가 우려되는 게시글" },
  { value: "inappropriate_content", label: "부적절한 콘텐츠", desc: "음란·폭력·혐오 표현 포함" },
  { value: "spam", label: "스팸/반복 게시", desc: "도배 또는 광고성 게시글" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

const BLOCK_REASONS = [
  { value: "inappropriate_content", label: "부적절한 콘텐츠", desc: "음란·폭력·혐오 표현 포함" },
  { value: "scam_suspect", label: "사기 의심", desc: "금전 피해가 우려되는 사용자" },
  { value: "harassment", label: "괴롭힘·욕설", desc: "무례한 언행, 집요한 연락, 성희롱" },
  { value: "spam", label: "스팸/반복 게시", desc: "도배 또는 광고성 게시글" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

export function ContentMoreMenu({
  contentType,
  contentId,
  targetUserId,
  targetDisplayName,
}: ContentMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const router = useRouter();
  const supabase = createClient();
  const reportReasons =
    contentType === "auction" ? AUCTION_REPORT_REASONS : PUZZLE_REPORT_REASONS;
  const targetLabel = targetDisplayName ? `${targetDisplayName}님` : "이 사용자";

  // 차단 상태 조회 (모달 열릴 때)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/users/${targetUserId}/block`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setIsBlocked(!!d?.blocked);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, targetUserId]);

  const reset = () => {
    setStep("menu");
    setReason("");
    setMemo("");
  };

  const closeAll = () => {
    setOpen(false);
    setTimeout(reset, 200); // close 애니메이션 후 리셋
  };

  const submitReport = async () => {
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("로그인이 필요합니다");
        return;
      }

      const table = contentType === "auction" ? "auction_reports" : "puzzle_content_reports";
      const fkColumn = contentType === "auction" ? "auction_id" : "puzzle_id";

      // 중복 신고 확인
      const { data: existing } = await supabase
        .from(table)
        .select("id")
        .eq(fkColumn, contentId)
        .eq("reporter_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.info(`이미 신고한 ${contentType === "auction" ? "게시글" : "깃발"}입니다`);
        closeAll();
        return;
      }

      const { error } = await supabase.from(table).insert({
        [fkColumn]: contentId,
        reporter_id: user.id,
        reason,
        memo: memo.trim() || null,
      });

      if (error) {
        toast.error("신고 처리 중 문제가 발생했습니다");
      } else {
        toast.success("신고가 접수되었습니다", {
          description: "관리자가 24시간 내에 확인 후 조치하겠습니다.",
        });
        closeAll();
      }
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const submitBlock = async () => {
    if (!isBlocked) {
      if (!reason) {
        toast.error("차단 사유를 선택해주세요");
        return;
      }
      if (reason === "other" && !memo.trim()) {
        toast.error("기타 사유를 입력해주세요");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${targetUserId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: isBlocked
          ? undefined
          : JSON.stringify({ reason, memo: memo.trim() || null }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || "차단 처리에 실패했습니다");
        return;
      }

      if (data.blocked) {
        toast.success("사용자를 차단했습니다", {
          description: "이 사용자의 게시글이 더 이상 표시되지 않으며, 사유가 관리자에게 전달되었습니다",
        });
      } else {
        toast.success("차단을 해제했습니다");
      }

      setIsBlocked(!!data.blocked);
      closeAll();
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const contentLabel = contentType === "auction" ? "게시글" : "깃발";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="더보기"
        className="flex items-center gap-1.5 py-3 group mx-auto"
      >
        <MoreHorizontal className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
        <span className="text-[11px] text-neutral-600 font-medium group-hover:text-neutral-400 transition-colors">
          신고·차단
        </span>
      </button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) closeAll();
          else setOpen(true);
        }}
      >
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-8 max-h-[90vh] overflow-y-auto"
        >
          {step === "menu" && (
            <>
              <SheetHeader className="pb-2 text-left">
                <SheetTitle className="text-white text-[16px]">더보기</SheetTitle>
                <SheetDescription className="text-neutral-500 text-[12px] mt-1">
                  부적절한 콘텐츠는 관리자가 24시간 내 검토합니다
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-2 mt-4">
                <button
                  onClick={() => {
                    setStep("report");
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-white">
                        이 {contentLabel} 신고
                      </p>
                      <p className="text-[12px] text-neutral-500 mt-0.5">
                        허위·사기·부적절 내용 신고
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-600" />
                </button>

                <button
                  onClick={() => {
                    setStep("block");
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                      <Ban className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-white">
                        {isBlocked ? "차단 해제" : `${targetLabel} 차단`}
                      </p>
                      <p className="text-[12px] text-neutral-500 mt-0.5">
                        {isBlocked
                          ? "다시 게시글을 볼 수 있습니다"
                          : "이 사용자의 모든 게시글이 즉시 사라집니다"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-600" />
                </button>
              </div>

              <div className="mt-5">
                <Button
                  variant="outline"
                  onClick={closeAll}
                  className="w-full h-12 rounded-xl border-neutral-800 text-neutral-400 font-bold"
                >
                  취소
                </Button>
              </div>
            </>
          )}

          {step === "report" && (
            <>
              <SheetHeader className="pb-2 text-left">
                <button
                  onClick={() => {
                    setStep("menu");
                    setReason("");
                    setMemo("");
                  }}
                  className="text-[12px] text-neutral-500 hover:text-white mb-2 flex items-center gap-1"
                >
                  ← 뒤로
                </button>
                <SheetTitle className="text-white text-[16px]">
                  {contentLabel} 신고
                </SheetTitle>
                <SheetDescription className="text-neutral-500 text-[12px] mt-1">
                  신고 사유를 선택해주세요
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  {reportReasons.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                        reason === r.value
                          ? "border-red-500/50 bg-red-500/10"
                          : "border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700"
                      }`}
                    >
                      <p
                        className={`text-[14px] font-bold ${
                          reason === r.value ? "text-red-400" : "text-white"
                        }`}
                      >
                        {r.label}
                      </p>
                      <p className="text-[12px] text-neutral-500 mt-0.5">{r.desc}</p>
                    </button>
                  ))}
                </div>

                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={
                    reason === "other"
                      ? "신고 사유를 입력해주세요 (필수)"
                      : "추가 설명 (선택)"
                  }
                  className="w-full h-20 bg-[#0A0A0A] border border-neutral-800 rounded-xl p-3 text-[13px] text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
                  maxLength={500}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("menu");
                      setReason("");
                      setMemo("");
                    }}
                    className="h-12 rounded-xl border-neutral-800 text-neutral-400 font-bold"
                  >
                    뒤로
                  </Button>
                  <Button
                    onClick={submitReport}
                    disabled={
                      loading || !reason || (reason === "other" && !memo.trim())
                    }
                    className="h-12 rounded-xl font-black text-base bg-red-500 hover:bg-red-600 text-white disabled:opacity-40"
                  >
                    {loading ? "처리 중..." : "신고하기"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "block" && (
            <>
              <SheetHeader className="pb-2 text-left">
                <button
                  onClick={() => {
                    setStep("menu");
                    setReason("");
                    setMemo("");
                  }}
                  className="text-[12px] text-neutral-500 hover:text-white mb-2 flex items-center gap-1"
                >
                  ← 뒤로
                </button>
                <SheetTitle className="text-white text-[16px]">
                  {isBlocked ? "차단 해제하시겠습니까?" : `${targetLabel} 차단하기`}
                </SheetTitle>
                <SheetDescription className="text-neutral-400 text-[13px] mt-1">
                  {isBlocked
                    ? "이 사용자의 게시글이 다시 표시됩니다."
                    : "차단 사유가 관리자에게 전달되어 24시간 내 검토됩니다. 차단 즉시 이 사용자의 모든 게시글이 피드에서 사라집니다."}
                </SheetDescription>
              </SheetHeader>

              {!isBlocked && (
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    {BLOCK_REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setReason(r.value)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                          reason === r.value
                            ? "border-red-500/50 bg-red-500/10"
                            : "border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700"
                        }`}
                      >
                        <p
                          className={`text-[14px] font-bold ${
                            reason === r.value ? "text-red-400" : "text-white"
                          }`}
                        >
                          {r.label}
                        </p>
                        <p className="text-[12px] text-neutral-500 mt-0.5">
                          {r.desc}
                        </p>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder={
                      reason === "other"
                        ? "차단 사유를 입력해주세요 (필수)"
                        : "추가 설명 (선택)"
                    }
                    className="w-full h-20 bg-[#0A0A0A] border border-neutral-800 rounded-xl p-3 text-[13px] text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
                    maxLength={500}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("menu");
                    setReason("");
                    setMemo("");
                  }}
                  className="h-12 rounded-xl border-neutral-800 text-neutral-400 font-bold"
                >
                  뒤로
                </Button>
                <Button
                  onClick={submitBlock}
                  disabled={
                    loading ||
                    (!isBlocked &&
                      (!reason || (reason === "other" && !memo.trim())))
                  }
                  className={`h-12 rounded-xl font-black text-base text-white disabled:opacity-40 ${
                    isBlocked
                      ? "bg-neutral-700 hover:bg-neutral-600"
                      : "bg-red-500 hover:bg-red-600"
                  }`}
                >
                  {loading
                    ? "처리 중..."
                    : isBlocked
                    ? "차단 해제"
                    : "차단하기"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
