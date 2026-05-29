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
import { Zap, ExternalLink, Loader2, UserPlus } from "lucide-react";
import { PuzzlePiece } from "@/components/puzzles/PuzzleCard";
import { trackShareEvent } from "@/lib/analytics/events";
import { getClientId } from "@/lib/utils/clientId";

/** 조각 참여 클릭을 DB에 기록 (admin 대시보드 집계용). 실패해도 UX 영향 X. */
function logJoinClick(
  auction_id: string,
  result: "success" | "fail" | "gender_gate" | "login_required",
  error_code?: string,
) {
  try {
    void fetch("/api/share/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auction_id, result, error_code, client_id: getClientId() }),
      keepalive: true,
    });
  } catch {
    // analytics는 본 흐름을 깨면 안 됨
  }
}

interface ShareJoinPanelProps {
  auction: Auction;
  currentUserId?: string;
  onShareClick?: () => void;
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
  INVALID_PARTY_SIZE: "참여 인원은 1~3명만 선택할 수 있어요.",
};

export function ShareJoinPanel({ auction, currentUserId, onShareClick }: ShareJoinPanelProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [successSheet, setSuccessSheet] = useState(false);
  const [kakaoUrl, setKakaoUrl] = useState<string | null>(null);
  const [hasClaim, setHasClaim] = useState(false);
  const [checkingClaim, setCheckingClaim] = useState(true);
  // 성별 게이트: null이면 참여 전 입력 받기 (깃발 X, 조각에서만 묻기)
  const [myGender, setMyGender] = useState<"male" | "female" | null>(null);
  const [genderLoaded, setGenderLoaded] = useState(false);
  const [genderSheetOpen, setGenderSheetOpen] = useState(false);
  const [partySize, setPartySize] = useState(1);

  useEffect(() => {
    const totalFilled = (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0);
    const left = (auction.total_seats ?? 0) - totalFilled;
    if (partySize > left && left > 0) setPartySize(left);
  }, [auction.seats_claimed, auction.external_attendees, auction.total_seats, partySize]);

  useEffect(() => {
    if (!currentUserId) {
      setGenderLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("gender")
        .eq("id", currentUserId)
        .maybeSingle();
      if (cancelled) return;
      setMyGender((data?.gender as "male" | "female" | null) ?? null);
      setGenderLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, supabase]);

  const handleSaveMyGender = async (g: "male" | "female") => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from("users")
      .update({ gender: g })
      .eq("id", currentUserId);
    if (error) {
      toast.error("성별 저장에 실패했어요. 다시 시도해주세요");
      return;
    }
    setMyGender(g);
    setGenderSheetOpen(false);
    trackShareEvent('share_gender_set', {
      auction_id: auction.id,
      club_id: auction.club_id,
      gender: g,
    });
  };

  const totalFilled = (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0);
  const totalSeats = auction.total_seats ?? 0;
  const seatsLeft = totalSeats - totalFilled;
  const isFull = seatsLeft <= 0;
  const isOpen = auction.status === "active" && !isFull;

  // 성별 슬롯 레이아웃: 인앱 참여자(seats_claimed_male/female) + MD 외부 입력(external_male/female) 합산 (Migration 202)
  const tM = auction.target_male ?? 0;
  const tF = auction.target_female ?? 0;
  const hasGenderSlot = tM + tF === totalSeats && totalSeats > 0;
  const filledMale = (auction.seats_claimed_male ?? 0) + (auction.external_male ?? 0);
  const filledFemale = (auction.seats_claimed_female ?? 0) + (auction.external_female ?? 0);
  // 남자가 target 초과하면 잉여(maleSurplus)는 female 슬롯에 male로 표시
  const maleSurplus = Math.max(0, filledMale - tM);
  const slotLayout = Array.from({ length: totalSeats }).map((_, i) => {
    if (!hasGenderSlot) {
      return { gender: null, filled: i < totalFilled };
    }
    if (i < tM) {
      // 남자 슬롯
      return { gender: "male" as const, filled: i < filledMale };
    }
    // 여자 슬롯 영역
    const femaleIdx = i - tM;
    if (femaleIdx < maleSurplus) {
      // 남자 잉여로 채워진 슬롯 (시각적으로 male 표시)
      return { gender: "male" as const, filled: true };
    }
    const adjustedFemaleIdx = femaleIdx - maleSurplus;
    return { gender: "female" as const, filled: adjustedFemaleIdx < filledFemale };
  });

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
    // MD가 성별 슬롯을 지정한 경우에만 성별을 묻는다.
    // 혼성/무관 매물(hasGenderSlot=false)에는 불필요한 마찰이라 생략.
    if (hasGenderSlot && genderLoaded && !myGender) {
      setGenderSheetOpen(true);
      trackShareEvent('share_gender_gate_open', {
        auction_id: auction.id,
        club_id: auction.club_id,
      });
      return;
    }
    const baseParams = {
      auction_id: auction.id,
      club_id: auction.club_id,
      price_per_seat: auction.price_per_seat ?? 0,
      total_seats: totalSeats,
      seats_filled: totalFilled,
      seats_left: seatsLeft,
    };
    trackShareEvent('share_join_attempt', baseParams);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("claim_share_seat", {
        p_auction_id: auction.id,
        p_party_size: partySize,
      });
      if (error) throw error;
      if (!data?.success) {
        const msg = ERROR_MESSAGES[data?.error as ShareClaimError] ?? "참여 중 문제가 발생했습니다.";
        toast.error(msg);
        trackShareEvent('share_join_fail', {
          ...baseParams,
          error_code: data?.error ?? 'UNKNOWN',
        });
        logJoinClick(auction.id, "fail", data?.error ?? "UNKNOWN");
        return;
      }
      setHasClaim(true);
      setKakaoUrl(data.kakao_open_chat_url ?? null);
      setSuccessSheet(true);
      trackShareEvent('share_join_success', {
        ...baseParams,
        seats_filled: totalFilled + partySize,
        seats_left: Math.max(0, seatsLeft - partySize),
        has_kakao_url: !!data.kakao_open_chat_url,
        party_size: partySize,
      });
      logJoinClick(auction.id, "success");
    } catch (err) {
      console.error('[claim_share_seat] failed:', err);
      toast.error("네트워크 연결이 불안정합니다.");
      trackShareEvent('share_join_fail', { ...baseParams, error_code: 'NETWORK' });
      logJoinClick(auction.id, "fail", "NETWORK");
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
      trackShareEvent('share_cancel', {
        auction_id: auction.id,
        club_id: auction.club_id,
        source: 'detail',
      });
    } catch (err) {
      console.error('[cancel_share_claim] failed:', err);
      toast.error("네트워크 연결이 불안정합니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleOpenChat = () => {
    trackShareEvent('share_kakao_open', {
      auction_id: auction.id,
      club_id: auction.club_id,
      has_kakao_url: !!kakaoUrl,
      source: 'detail',
    });
    if (kakaoUrl) window.open(kakaoUrl, "_blank");
  };

  if (checkingClaim) return null;

  return (
    <>
      {/* 좌석 현황 */}
      <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {slotLayout.map((slot, i) => (
              <PuzzlePiece key={i} filled={slot.filled} gender={slot.gender} />
            ))}
          </div>
          {isOpen && seatsLeft <= 2 && (
            <span className={`flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
              seatsLeft === 1
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            }`}>
              <Zap className="w-3 h-3 fill-current" />
              라스트 {seatsLeft}자리!
            </span>
          )}
          {isFull && (
            <span className="text-xs font-bold text-neutral-500 bg-neutral-800 px-2.5 py-1 rounded-full flex-shrink-0">마감</span>
          )}
        </div>

        {/* 성비 안내 */}
        {hasGenderSlot && (
          <p className="text-[11px] text-neutral-500">성비 목표 외 인원도 MD 승인 시 참여 가능해요.</p>
        )}

        {/* 인당 가격 */}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">
            {formatNumber(auction.price_per_seat ?? 0)}원
          </span>
          <span className="text-sm text-neutral-500">/ 1인</span>
        </div>

        {/* CTA + 인원 세팅 */}
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
        ) : isOpen && !isFull ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-neutral-300">함께 갈 인원</span>
              <span className="text-[11px] text-neutral-500">본인 포함 · 최대 {Math.min(3, seatsLeft)}명</span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 grid grid-cols-3 gap-1">
                {[1, 2, 3].map((n) => {
                  const disabled = n > seatsLeft;
                  const active = partySize === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPartySize(n)}
                      className={`h-12 rounded-2xl border text-sm font-bold transition-all ${
                        disabled
                          ? "bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed"
                          : active
                            ? "bg-white border-white text-black"
                            : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {n}명
                    </button>
                  );
                })}
              </div>
              <Button
                className="flex-1 h-12 rounded-2xl font-bold text-base bg-white text-black hover:bg-neutral-100 transition-all"
                disabled={loading}
                onClick={handleJoin}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "참여하기"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-full h-12 rounded-2xl font-bold text-base bg-neutral-800 text-neutral-500 cursor-not-allowed transition-all"
            disabled
          >
            {isFull ? "마감" : "참여 불가"}
          </Button>
        )}

        {onShareClick && (
          <Button
            variant="outline"
            className="w-full h-11 rounded-2xl border border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white text-sm font-semibold"
            onClick={onShareClick}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            같이 갈 친구에게 공유
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
              {partySize > 1 && (
                <>
                  {" "}일행 포함 <span className="text-white font-bold">{partySize}명</span>으로 신청했어요.
                </>
              )}
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

      {/* 성별 게이트 (참여 전 1회) */}
      <Sheet open={genderSheetOpen} onOpenChange={setGenderSheetOpen}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-10">
          <SheetHeader className="text-left pb-4">
            <SheetTitle className="text-white text-lg">조각 매치를 위해 성별을 알려주세요</SheetTitle>
          </SheetHeader>
          <p className="text-[12px] text-neutral-500 mb-4">한 번 설정하면 변경할 수 없어요</p>
          <div className="grid grid-cols-2 gap-3 pb-2">
            {([
              { value: "male", label: "남자", emoji: "🧑" },
              { value: "female", label: "여자", emoji: "👩" },
            ] as const).map(({ value, label, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleSaveMyGender(value)}
                className={`h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all bg-neutral-800 border-neutral-700 ${
                  value === "female" ? "hover:border-pink-500 hover:bg-pink-500/10" : "hover:border-green-500 hover:bg-green-500/10"
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[15px] font-bold text-white">{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
