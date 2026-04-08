"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Calendar, Clock, Users, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCountdown } from "@/hooks/useCountdown";
import { formatPrice, formatEventDate } from "@/lib/utils/format";
import { toast } from "sonner";
import Link from "next/link";

interface CancelClientProps {
  auction: {
    id: string;
    clubName: string;
    clubArea: string;
    eventDate: string;
    winningPrice: number;
    contactDeadline: string | null;
    wonAt: string | null;
    listingType?: "auction" | "instant";
  };
  currentWarnings: number;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// isInstant에 따라 동적으로 생성
function getCancelReasons(isInstant: boolean) {
  return [
    { key: "schedule_change", label: "일정이 변경됐어요" },
    { key: "too_expensive", label: "가격이 부담돼요" },
    { key: "md_no_response", label: "MD가 연락을 안 받아요" },
    { key: "wrong_bid", label: isInstant ? "실수로 구매했어요" : "실수로 입찰했어요" },
    { key: "other_club", label: "다른 곳으로 변경했어요" },
    { key: "other", label: "기타" },
  ] as const;
}

type CancelZone = "grace" | "late";

export function CancelClient({ auction, currentWarnings }: CancelClientProps) {
  const router = useRouter();
  const isInstant = auction.listingType === "instant";
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [extraDetail, setExtraDetail] = useState("");
  const isOtherSelected = selectedReason === "other";
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const cancelReasons = getCancelReasons(isInstant);

  // 최종 사유: "[선택사유] 추가 내용" 형태로 조합
  const reason = (() => {
    const preset = cancelReasons.find(r => r.key === selectedReason);
    const parts: string[] = [];
    if (preset) parts.push(`[${preset.key}] ${preset.label}`);
    if (extraDetail.trim()) parts.push(extraDetail.trim());
    return parts.join(" — ");
  })();

  const { remaining, level } = useCountdown(auction.contactDeadline);

  // 2구간 판정: grace (타이머 전반 50%) / late (후반 50%)
  // contactDeadline이 null이면 연락 버튼을 이미 눌러 타이머 정지된 상태 → won_at 기준 2분 grace
  const { cancelZone, progressPercent } = useMemo(() => {
    if (!auction.wonAt) {
      return { cancelZone: "grace" as CancelZone, progressPercent: 0 };
    }

    const wonAt = new Date(auction.wonAt).getTime();
    const elapsedMs = Date.now() - wonAt;

    if (!auction.contactDeadline) {
      // 연락 버튼 이미 누름 → 2분 grace
      const graceCutoffMs = 2 * 60 * 1000;
      return {
        cancelZone: (elapsedMs <= graceCutoffMs ? "grace" : "late") as CancelZone,
        progressPercent: elapsedMs <= graceCutoffMs ? 0 : 100,
      };
    }

    const deadline = new Date(auction.contactDeadline).getTime();
    const totalMs = deadline - wonAt;
    if (totalMs <= 0) return { cancelZone: "late" as CancelZone, progressPercent: 100 };

    const graceCutoffMs = totalMs * 0.5; // 전반 50%
    const zone: CancelZone = elapsedMs <= graceCutoffMs ? "grace" : "late";

    return {
      cancelZone: zone,
      progressPercent: Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)),
    };
  }, [remaining, auction.contactDeadline, auction.wonAt]);

  const isExpired = remaining <= 0 && !!auction.contactDeadline;

  // 이 취소로 부과될 경고점
  const pendingWarningPoints = cancelZone === "grace" ? 1 : 2;
  const warningsAfterCancel = currentWarnings + pendingWarningPoints;
  const willTriggerStrike = warningsAfterCancel >= 3;

  // 프로그레스 바 색상
  const barColor = cancelZone === "grace" ? "bg-amber-500" : "bg-red-500";

  const handleCancel = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auction/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionId: auction.id,
          reason: reason.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "취소 처리 중 오류가 발생했습니다");
        setShowConfirm(false);
        setLoading(false);
        return;
      }

      const cancelMsg = isInstant ? "구매가 취소되었습니다" : "낙찰이 취소되었습니다";
      if (data.warningResult?.strike_triggered) {
        toast.error(cancelMsg, {
          description: "경고 누적으로 스트라이크가 부과되었습니다.",
        });
      } else {
        toast.warning(cancelMsg, {
          description: `경고 ${data.warningPoints}점이 기록되었습니다.`,
        });
      }

      router.push("/my-wins");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-14 pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <header className="pt-3 pb-5 flex items-center gap-4">
          <Link href="/my-wins" className="p-2 -ml-2 rounded-xl hover:bg-neutral-800/50 transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <h1 className="text-xl font-black text-white tracking-tight">{isInstant ? "구매 포기" : "낙찰 포기"}</h1>
        </header>

        <div className="space-y-3.5">
          {/* Auction Summary */}
          <Card className="bg-[#1C1C1E] border-neutral-800 gap-0 p-5 space-y-3">
            <h2 className="text-lg font-black text-white tracking-tight">
              {auction.clubName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-neutral-500 font-bold">
              <MapPin className="w-3 h-3" />
              {auction.clubArea}
              <span>·</span>
              <Calendar className="w-3 h-3" />
              {formatEventDate(auction.eventDate)}
            </div>
            <div className="bg-neutral-900/50 rounded-xl p-3.5 border border-neutral-800/50 flex justify-between items-center">
              <span className="text-neutral-500 text-sm font-bold">{isInstant ? "구매가" : "낙찰가"}</span>
              <span className="text-xl font-black text-white">
                {formatPrice(auction.winningPrice)}
              </span>
            </div>
          </Card>

          {/* Timer Status */}
          <Card className={`gap-0 p-5 space-y-3 border ${
            cancelZone === "grace"
              ? "bg-amber-500/5 border-amber-500/20"
              : "bg-red-500/5 border-red-500/20"
          }`}>
            {/* Progress Bar - 2구간 */}
            <div className="space-y-2">
              <div className="h-2 bg-neutral-800 rounded-full relative overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${barColor}`}
                  style={{ width: `${isExpired ? 100 : progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-neutral-600">
                <span className={cancelZone === "grace" ? "text-amber-400" : ""}>Grace (전반 50%)</span>
                <span className={cancelZone === "late" ? "text-red-400" : ""}>Late (후반 50%)</span>
              </div>
            </div>

            {/* Timer */}
            {isExpired ? (
              <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <Clock className="w-4 h-4 text-red-500" />
                <span className="text-sm font-bold text-red-500">연락 시간 만료</span>
              </div>
            ) : (
              <div className={`flex items-center justify-between py-2.5 px-4 rounded-xl border ${
                level === "critical"
                  ? "bg-red-500/10 border-red-500/30"
                  : level === "warning"
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-neutral-900 border-neutral-700"
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${
                    level === "critical" ? "text-red-400" : level === "warning" ? "text-amber-400" : "text-neutral-400"
                  }`} />
                  <span className={`text-xs font-bold ${
                    level === "critical" ? "text-red-400/70" : level === "warning" ? "text-amber-400/70" : "text-neutral-400"
                  }`}>
                    연락 마감까지
                  </span>
                </div>
                <span className={`text-lg font-black tabular-nums tracking-wider ${
                  level === "critical" ? "text-red-400 animate-pulse" : level === "warning" ? "text-amber-400" : "text-white"
                }`}>
                  {formatTimer(remaining)}
                </span>
              </div>
            )}
          </Card>

          {/* Consequences - 구간별 동적 표시 */}
          <Card className="bg-[#1C1C1E] border-neutral-800 gap-0 p-5 space-y-3">
            <h3 className="text-sm font-black text-neutral-300">취소 시 안내사항</h3>
            <ul className="space-y-2.5">
              {/* 구간별 패널티 안내 */}
              <li className="flex items-start gap-2.5">
                <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${
                  willTriggerStrike ? "text-red-500" : "text-amber-500"
                }`} />
                <span className="text-[13px] font-medium leading-relaxed">
                  <span className={willTriggerStrike ? "text-red-400" : "text-amber-400"}>
                    경고 <span className="text-white font-bold">+{pendingWarningPoints}점</span> 부과
                    <span className="text-neutral-500"> (현재 {currentWarnings}/3점)</span>
                  </span>
                </span>
              </li>

              {/* 스트라이크 임계 경고 */}
              {willTriggerStrike && (
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span className="text-[13px] text-red-400 font-bold leading-relaxed">
                    이 취소 시 스트라이크 1회가 부과됩니다!
                  </span>
                </li>
              )}

              {/* 차순위 낙찰 안내 (경매만 — instant은 차순위 없음) */}
              {!isInstant && (
                <li className="flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                  <span className="text-[13px] text-neutral-400 font-medium leading-relaxed">
                    차순위 입찰자에게 낙찰이 자동으로 넘어갑니다
                  </span>
                </li>
              )}
            </ul>
          </Card>

          {/* Reason */}
          <Card className="bg-[#1C1C1E] border-neutral-800 gap-0 p-5 space-y-3.5">
            <label className="text-sm font-black text-neutral-300">
              취소 사유 <span className="text-neutral-600 font-medium">(선택)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {cancelReasons.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setSelectedReason(prev => prev === r.key ? null : r.key);
                    if (r.key !== "other") setExtraDetail("");
                  }}
                  className={`px-3 py-2 rounded-xl text-[13px] font-bold border transition-all ${
                    selectedReason === r.key
                      ? "bg-white text-black border-white"
                      : "bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {isOtherSelected && (
              <>
                <Textarea
                  value={extraDetail}
                  onChange={(e) => setExtraDetail(e.target.value.slice(0, 200))}
                  placeholder="취소 사유를 직접 입력해주세요..."
                  className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 resize-none h-20 rounded-xl"
                  autoFocus
                />
                <p className="text-[11px] text-neutral-600 text-right font-medium">
                  {extraDetail.length}/200
                </p>
              </>
            )}
          </Card>

          {/* CTA */}
          <div className="pt-1">
            <Button
              onClick={() => setShowConfirm(true)}
              className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-black text-sm rounded-xl transition-colors"
            >
              {isInstant ? "구매 포기하기" : "낙찰 포기하기"}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Sheet */}
      <Sheet open={showConfirm} onOpenChange={setShowConfirm}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              정말 포기하시겠습니까?
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              이 작업은 되돌릴 수 없습니다
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3.5 px-4">
            {/* Summary */}
            <div className="bg-neutral-900/50 rounded-xl p-3.5 border border-neutral-800/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 font-medium">클럽</span>
                <span className="text-white font-bold">{auction.clubName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 font-medium">{isInstant ? "구매가" : "낙찰가"}</span>
                <span className="text-white font-bold">{formatPrice(auction.winningPrice)}</span>
              </div>
            </div>

            {/* 구간별 경고점 표시 */}
            <div className={`rounded-xl p-3.5 space-y-1 ${
              willTriggerStrike
                ? "bg-red-500/10 border border-red-500/20"
                : "bg-amber-500/10 border border-amber-500/20"
            }`}>
              <p className={`text-[13px] font-black ${
                willTriggerStrike ? "text-red-400" : "text-amber-400"
              }`}>
                {willTriggerStrike
                  ? `경고 +${pendingWarningPoints}점 → 스트라이크 1회 부과!`
                  : `경고 +${pendingWarningPoints}점 (${currentWarnings}점 → ${warningsAfterCancel}점 / 3점)`
                }
              </p>
              <p className="text-[12px] text-neutral-500 font-medium">
                3경고 누적 시 스트라이크 1회로 전환됩니다
              </p>
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-0.5 pb-6">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="h-12 border-neutral-700 text-neutral-300 font-black rounded-xl hover:bg-neutral-800"
              >
                돌아가기
              </Button>
              <Button
                onClick={handleCancel}
                disabled={loading}
                className="h-12 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl"
              >
                {loading ? "처리 중..." : "포기 확인"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
