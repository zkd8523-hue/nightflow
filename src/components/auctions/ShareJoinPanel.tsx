"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Auction, ShareClaimError } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { Users, Zap, ExternalLink, Loader2 } from "lucide-react";

interface ShareJoinPanelProps {
  auction: Auction;
  currentUserId?: string;
}

const ERROR_MESSAGES: Record<ShareClaimError, string> = {
  NOT_SHARE_LISTING: "조각 매물이 아닙니다.",
  OWN_LISTING: "본인 매물에는 참여할 수 없습니다.",
  NOT_OPEN: "현재 참여할 수 없는 매물입니다.",
  EXPIRED: "모집 마감 시간이 지났습니다.",
  FULL: "이미 마감된 매물입니다.",
  MD_CHAT_UNAVAILABLE: "MD의 오픈채팅 정보를 불러올 수 없습니다. MD에게 문의해주세요.",
  ALREADY_CLAIMED: "이미 참여 중인 매물입니다.",
  KICKED_BY_MD: "이 매물에는 재참여할 수 없습니다.",
  MAX_CANCELLATIONS: "취소 횟수 한도를 초과했습니다.",
  CLAIM_NOT_FOUND: "참여 기록을 찾을 수 없습니다.",
  NOT_OWNER: "권한이 없습니다.",
  NEGATIVE_NOT_ALLOWED: "유효하지 않은 요청입니다.",
  EXCEEDS_TOTAL_SEATS: "정원을 초과할 수 없습니다.",
};

export function ShareJoinPanel({ auction, currentUserId }: ShareJoinPanelProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [successSheet, setSuccessSheet] = useState(false);
  const [kakaoUrl, setKakaoUrl] = useState<string | null>(null);
  const [hasClaim, setHasClaim] = useState(false);
  const [checkingClaim, setCheckingClaim] = useState(true);

  const totalFilled = (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0);
  const totalSeats = auction.total_seats ?? 0;
  const seatsLeft = totalSeats - totalFilled;
  const isFull = seatsLeft <= 0;
  const isOpen = auction.status === "active" && !isFull;

  // 내 참여 여부 확인
  useEffect(() => {
    if (!currentUserId) {
      setCheckingClaim(false);
      return;
    }
    supabase
      .from("share_claims")
      .select("id")
      .eq("auction_id", auction.id)
      .eq("user_id", currentUserId)
      .is("cancelled_at", null)
      .single()
      .then(({ data }) => {
        setHasClaim(!!data);
        setCheckingClaim(false);
      });
  }, [auction.id, currentUserId]);

  const handleJoin = async () => {
    if (!currentUserId) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("claim_share_seat", {
        p_auction_id: auction.id,
      });
      if (error) throw error;
      if (!data?.success) {
        const msg = ERROR_MESSAGES[data?.error as ShareClaimError] ?? "참여 중 문제가 발생했습니다.";
        toast.error(msg);
        return;
      }
      setHasClaim(true);
      setKakaoUrl(data.kakao_open_chat_url ?? null);
      setSuccessSheet(true);
    } catch {
      toast.error("네트워크 연결이 불안정합니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_share_claim", {
        p_auction_id: auction.id,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(ERROR_MESSAGES[data?.error as ShareClaimError] ?? "취소 중 문제가 발생했습니다.");
        return;
      }
      setHasClaim(false);
      toast.success("참여가 취소되었습니다.");
    } catch {
      toast.error("네트워크 연결이 불안정합니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleOpenChat = () => {
    if (kakaoUrl) window.open(kakaoUrl, "_blank");
  };

  if (checkingClaim) return null;

  return (
    <>
      {/* 좌석 현황 */}
      <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-300 font-medium">
              {totalFilled}/{totalSeats} 자리 채워짐
            </span>
          </div>
          {isOpen && seatsLeft <= 2 && (
            <span className={`flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-full ${
              seatsLeft === 1
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            }`}>
              <Zap className="w-3 h-3 fill-current" />
              라스트 {seatsLeft}자리!
            </span>
          )}
          {isFull && (
            <span className="text-xs font-bold text-neutral-500 bg-neutral-800 px-2.5 py-1 rounded-full">마감</span>
          )}
        </div>

        {/* 진행 바 */}
        <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-neutral-600" : seatsLeft <= 2 ? "bg-amber-500" : "bg-white"}`}
            style={{ width: `${totalSeats > 0 ? Math.min(100, (totalFilled / totalSeats) * 100) : 0}%` }}
          />
        </div>

        {/* 성비 안내 */}
        {auction.total_seats && auction.total_seats > 0 && (
          <p className="text-[11px] text-neutral-500">성비 목표 외 인원도 MD 승인 시 참여 가능해요.</p>
        )}

        {/* 인당 가격 */}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">
            {formatNumber(auction.price_per_seat ?? 0)}원
          </span>
          <span className="text-sm text-neutral-500">/ 1인</span>
        </div>

        {/* CTA */}
        {hasClaim ? (
          <div className="space-y-2">
            <Button
              className="w-full h-12 rounded-2xl font-bold text-base bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
              onClick={() => setSuccessSheet(true)}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              오픈채팅 재진입
            </Button>
            <Button
              variant="ghost"
              className="w-full h-10 text-neutral-500 hover:text-neutral-300 text-sm"
              disabled={cancelLoading}
              onClick={handleCancel}
            >
              {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              참여 취소
            </Button>
          </div>
        ) : (
          <Button
            className={`w-full h-12 rounded-2xl font-bold text-base transition-all ${
              isFull
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : !isOpen
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-white text-black hover:bg-neutral-100"
            }`}
            disabled={!isOpen || loading}
            onClick={handleJoin}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isFull ? (
              "마감"
            ) : !isOpen ? (
              "참여 불가"
            ) : (
              "참여하기"
            )}
          </Button>
        )}

        <p className="text-xs text-neutral-600 text-center">
          결제 없이 오픈채팅에서 MD가 안내합니다
        </p>
      </div>

      {/* 참여 완료 시트 */}
      <Sheet open={successSheet} onOpenChange={setSuccessSheet}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-10">
          <SheetHeader className="text-left pb-4">
            <SheetTitle className="text-white text-lg">참여 완료!</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <p className="text-neutral-400 text-sm leading-relaxed">
              MD의 오픈채팅방에 참여해서 최종 안내를 받으세요.
              현장에서 인당 {formatNumber(auction.price_per_seat ?? 0)}원을 MD에게 직접 전달합니다.
            </p>
            <Button
              className="w-full h-12 rounded-2xl font-bold text-base bg-amber-500 text-black hover:bg-amber-400"
              onClick={handleOpenChat}
              disabled={!kakaoUrl}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              카카오 오픈채팅 입장
            </Button>
            {!kakaoUrl && (
              <p className="text-xs text-red-400 text-center">
                MD의 오픈채팅 정보를 불러올 수 없습니다. MD에게 직접 문의해주세요.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
