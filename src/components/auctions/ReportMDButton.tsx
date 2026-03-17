"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AlertCircle, Clock, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface ReportMDButtonProps {
  auctionId: string;
  wonAt: string | null;
  contactDeadline: string | null;
  initialHasReported?: boolean;
  onDeadlineExtended?: (newDeadline: string) => void;
}

const COOLDOWN_MINUTES = 3;

export function ReportMDButton({
  auctionId,
  wonAt,
  contactDeadline,
  initialHasReported = false,
  onDeadlineExtended,
}: ReportMDButtonProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [hasReported, setHasReported] = useState(initialHasReported);
  const [loading, setLoading] = useState(false);
  const [cooldownPassed, setCooldownPassed] = useState(false);

  // 3분 쿨다운 타이머
  useEffect(() => {
    if (!wonAt) return;

    const cooldownEnd = new Date(wonAt).getTime() + COOLDOWN_MINUTES * 60 * 1000;

    function check() {
      if (Date.now() >= cooldownEnd) {
        setCooldownPassed(true);
        return true;
      }
      return false;
    }

    if (check()) return;

    const interval = setInterval(() => {
      if (check()) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [wonAt]);

  // 타이머 만료 여부
  const isExpired = contactDeadline && new Date() > new Date(contactDeadline);
  if (isExpired) return null;

  const canReport = cooldownPassed && !hasReported;

  const handleReport = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auction/report-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setHasReported(true);
        setShowSheet(false);
        onDeadlineExtended?.(data.extendedDeadline);
        toast.success("신고가 접수되었습니다", {
          description: `연락 타이머가 ${data.extensionMinutes}분 연장되었습니다. MD에게 알림이 전송되었습니다.`,
          duration: 8000,
        });
      } else if (res.status === 409) {
        setHasReported(true);
        setShowSheet(false);
        toast.info("이미 신고한 경매입니다.");
      } else {
        toast.error(data.error || "신고 처리 중 문제가 발생했습니다.");
      }
    } catch {
      toast.error("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = hasReported
    ? "접수 완료"
    : !cooldownPassed
      ? "준비 중..."
      : "MD 미응답";

  return (
    <>
      <button
        onClick={() => canReport && setShowSheet(true)}
        disabled={!canReport}
        className="flex items-center gap-1.5 py-2 px-1 group disabled:opacity-40"
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-500/50 group-hover:text-red-400 transition-colors" />
        <span className="text-xs text-red-500/50 font-medium group-hover:text-red-400 transition-colors">
          {buttonLabel}
        </span>
      </button>

      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              MD가 답하지 않나요?
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              연락을 시도했지만 응답이 없으면 알려주세요.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
              <p className="text-neutral-300 text-[13px] font-bold">
                접수 시 다음이 적용됩니다:
              </p>
              <ul className="text-[12px] text-neutral-400 space-y-2 ml-1 font-medium">
                <li className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                  <span>
                    연락 타이머가{" "}
                    <span className="text-green-400 font-bold">15분 연장</span>
                    됩니다
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <MessageCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span>
                    MD에게{" "}
                    <span className="text-amber-400 font-bold">긴급 알림</span>
                    이 전송됩니다
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-[13px] text-amber-400 font-bold">
                제공된 연락 수단(DM/전화)으로 먼저 연락을 시도하셨나요?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-8">
              <Button
                variant="outline"
                onClick={() => setShowSheet(false)}
                className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
              >
                취소
              </Button>
              <Button
                onClick={handleReport}
                disabled={loading}
                className="h-14 rounded-2xl font-black text-base bg-red-500 hover:bg-red-600 text-white"
              >
                {loading ? "처리 중..." : "알려주기"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
