"use client";

import { memo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction } from "@/types/database";
import { formatNumber, formatTime, formatCountdown, formatCountdownLong, categorizeLiquor } from "@/lib/utils/format";
import { useState, useCallback } from "react";
import { updateShareAttendees } from "@/app/actions/share-attendees";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { URGENCY_STYLES } from "@/lib/constants/timer-urgency";
import { Gavel, Zap, BadgeCheck, Flame, Users, Minus, Plus, Share2 } from "lucide-react";
import { AuctionImage } from "@/components/auctions/DrinkPlaceholder";
import { NotifySubscribeButton } from "@/components/auctions/NotifySubscribeButton";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { PuzzlePiece } from "@/components/puzzles/PuzzleCard";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";
import { trackShareEvent } from "@/lib/analytics/events";

interface AuctionCardProps {
  auction: Auction;
  userBidAmount?: number;
  isUserInterested?: boolean;
  priority?: boolean;
  currentUserId?: string;
}

function copyToClipboardWithFallback(value: string): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        resolve(true);
        return;
      }
    } catch {
      /* fallthrough */
    }
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.top = "-1000px";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      resolve(ok);
    } catch {
      resolve(false);
    }
  });
}

function ShareSheet({
  open,
  onOpenChange,
  url,
  title,
  text,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
  title: string;
  text: string;
}) {
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

  const shareInstagram = async () => {
    const copied = await copyToClipboardWithFallback(url);
    if (isMobile) {
      window.location.href = "instagram://direct-inbox";
      setTimeout(() => {
        window.open("https://www.instagram.com/direct/inbox/", "_blank");
      }, 600);
    } else {
      window.open("https://www.instagram.com/direct/inbox/", "_blank");
    }
    toast.success(copied ? "링크 복사됨! 인스타에 붙여넣기 하세요" : "인스타가 열렸어요. 링크를 직접 복사해주세요");
    onOpenChange(false);
  };

  const shareKakao = async () => {
    const copied = await copyToClipboardWithFallback(`${title}\n${text}\n${url}`);
    // 카톡 친구목록(공유 채팅창 선택)으로 이동: kakaotalk:// 스킴
    if (isMobile) {
      window.location.href = "kakaotalk://inappbrowser";
      setTimeout(() => {
        window.open("https://accounts.kakao.com", "_blank");
      }, 600);
    } else {
      window.open("https://web.whale.naver.com/static/talk/index.html", "_blank");
    }
    toast.success(copied ? "내용 복사됨! 카톡에 붙여넣기 하세요" : "카톡이 열렸어요. 링크를 직접 복사해주세요");
    onOpenChange(false);
  };

  const shareCopy = async () => {
    const copied = await copyToClipboardWithFallback(url);
    toast[copied ? "success" : "error"](
      copied ? "링크가 복사됐어요" : "복사에 실패했어요. 주소창에서 직접 복사해주세요."
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10 pt-4"
      >
        <SheetHeader className="p-0 mb-4">
          <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />
          <SheetTitle className="text-white text-base font-black text-center">
            내 테이블 공유하기
          </SheetTitle>
          <SheetDescription className="text-neutral-400 text-[12px] text-center">
            어디로 공유할까요?
          </SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
          <button
            type="button"
            onClick={shareInstagram}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-colors active:scale-[0.97]"
          >
            <span className="text-2xl">📷</span>
            <span className="text-[12px] font-bold text-white">인스타</span>
          </button>
          <button
            type="button"
            onClick={shareKakao}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-colors active:scale-[0.97]"
          >
            <span className="text-2xl">💬</span>
            <span className="text-[12px] font-bold text-white">카카오톡</span>
          </button>
          <button
            type="button"
            onClick={shareCopy}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-colors active:scale-[0.97]"
          >
            <span className="text-2xl">🔗</span>
            <span className="text-[12px] font-bold text-white">링크 복사</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const AuctionCard = memo(function AuctionCard({ auction: propAuction, userBidAmount, isUserInterested, priority, currentUserId }: AuctionCardProps) {
  const auction = adjustMockAuctionDates(propAuction);
  const club = auction.club;
  const displayStatus = getAuctionDisplayStatus(auction);
  const isActive = displayStatus === 'active';
  const isScheduled = displayStatus === 'scheduled';
  const isExpired = displayStatus === 'expired';
  const isCompleted = ["won", "unsold", "confirmed", "cancelled"].includes(auction.status);
  const isWon = ["won", "confirmed"].includes(auction.status);
  const endTime = getEffectiveEndTime(auction);
  const currentPrice = isWon && auction.winning_price ? auction.winning_price : (auction.current_bid || auction.start_price);
  const isInstant = auction.listing_type === 'instant';
  const isShare = auction.listing_type === 'share';
  const countdown = useCountdown((isActive || isExpired) ? endTime : null);
  const timerStyles = URGENCY_STYLES[countdown.level] ?? URGENCY_STYLES.idle;

  // 조각(share) 관련 계산
  const totalFilled = isShare ? (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0) : 0;
  const totalSeats = isShare ? (auction.total_seats ?? 0) : 0;
  const seatsLeft = totalSeats - totalFilled;
  const isShareFull = isShare && seatsLeft <= 0;
  const isShareActive = isShare && auction.status === 'active' && !isShareFull;

  // 사용자 입찰 상태
  const userHasBid = userBidAmount !== undefined;
  const isUserHighest = userHasBid && userBidAmount >= (auction.current_bid || 0);
  const isUserOutbid = userHasBid && !isUserHighest && isActive;

// 소셜프루프 텍스트
  const chatCount = auction.chat_interest_count || 0;
  const socialProof = isInstant
    ? (chatCount >= 2 && isActive ? `${chatCount}명이 대화중` : null)
    : (!isCompleted && !isExpired && auction.bid_count > 0
      ? `${auction.bidder_count || auction.bid_count}명 입찰 중`
      : null);

  // 조각(share) 전용 레이아웃 — PuzzleCard와 동일한 구조
  if (isShare) {
    const totalBudget = (auction.price_per_seat ?? 0) * totalSeats;
    const currentBudget = (auction.price_per_seat ?? 0) * totalFilled;
    const isNew = Date.now() - new Date(auction.created_at).getTime() < 6 * 60 * 60 * 1000;
    const isOwner = !!currentUserId && currentUserId === auction.md_id;
    // 델타(변동분) 입력: 기본 0, +/-로 외부 인원 증감을 누적, 반영 시 DB 값에 가산
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [extDelta, setExtDelta] = useState(0);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [extMaleDelta, setExtMaleDelta] = useState(0);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [extFemaleDelta, setExtFemaleDelta] = useState(0);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [saving, setSaving] = useState(false);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [shareSheetOpen, setShareSheetOpen] = useState(false);
    const tM = auction.target_male ?? 0;
    const tF = auction.target_female ?? 0;
    const hasGenderSlot = tM + tF === totalSeats && totalSeats > 0;
    // 슬롯 시각화: 작성자(MD)는 로컬 델타 변화가 즉시 반영됨. 뷰어는 서버값.
    const localFilledOwner = totalFilled + extDelta;
    const localFilled = isOwner
      ? Math.max(0, Math.min(totalSeats, localFilledOwner))
      : totalFilled;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const confirmExt = useCallback(async () => {
      setSaving(true);
      const baseExt = auction.external_attendees ?? 0;
      const baseMale = auction.external_male ?? 0;
      const baseFemale = auction.external_female ?? 0;
      const m = hasGenderSlot ? baseMale + extMaleDelta : baseExt + extDelta;
      const f = hasGenderSlot ? baseFemale + extFemaleDelta : 0;
      const total = hasGenderSlot ? m + f : baseExt + extDelta;
      // Server Action 사용 — DB update + revalidatePath('/') 한 번에 처리
      // (직접 supabase 호출 시 ISR 캐시 안 비워져서 홈 돌아오면 빈 상태로 보였음)
      const result = await updateShareAttendees(auction.id, {
        external_attendees: total,
        external_male: m,
        external_female: f,
      });
      setSaving(false);
      if (result.ok) {
        const newFilled = totalFilled + (hasGenderSlot ? extMaleDelta + extFemaleDelta : extDelta);
        const remaining = totalSeats - newFilled;
        toast.success(remaining > 0 ? `반영됐어요! · ${remaining}자리 남았어요` : "반영됐어요! · 꽉 찼어요 🎉");
        setExtDelta(0);
        setExtMaleDelta(0);
        setExtFemaleDelta(0);
      } else {
        toast.error("저장 중 문제가 발생했습니다.");
      }
    }, [extDelta, extMaleDelta, extFemaleDelta, hasGenderSlot, totalFilled, totalSeats, auction.id]);
    const slotLayout = hasGenderSlot
      ? (() => {
          // Migration 202: 인앱 참여자(seats_claimed_male/female) + 외부 (서버 + 로컬 델타)
          const filledMale = (auction.seats_claimed_male ?? 0) + (auction.external_male ?? 0) + (isOwner ? extMaleDelta : 0);
          const filledFemale = (auction.seats_claimed_female ?? 0) + (auction.external_female ?? 0) + (isOwner ? extFemaleDelta : 0);
          const maleSurplus = Math.max(0, filledMale - tM);
          return Array.from({ length: totalSeats }).map((_, i) => {
            if (i < tM) {
              // 남자 슬롯
              return { gender: "male" as const, filled: i < filledMale };
            } else {
              // 여자 슬롯 — 남자 초과분이 앞에서부터 차지, 여자는 그 뒤부터
              const femaleIdx = i - tM;
              if (femaleIdx < maleSurplus) {
                return { gender: "male" as const, filled: true };
              }
              return { gender: "female" as const, filled: (femaleIdx - maleSurplus) < filledFemale };
            }
          });
        })()
      : Array.from({ length: totalSeats }).map((_, i) => ({
          gender: null as null,
          filled: i < localFilled,
        }));

    return (
      <>
      <Link
        href={`/auctions/${auction.id}`}
        onClick={() =>
          trackShareEvent("share_card_click", {
            auction_id: auction.id,
            club_id: auction.club_id,
            club_name: club?.name,
            area: club?.area ?? null,
            price_per_seat: auction.price_per_seat ?? 0,
            total_seats: totalSeats,
            seats_filled: totalFilled,
            seats_left: seatsLeft,
          })
        }
      >
        <div className="relative bg-[#1C1C1E] rounded-2xl p-4 space-y-3 active:scale-[0.98] transition-all cursor-pointer">
          {isNew && (
            <div className="animate-new-badge pointer-events-none absolute -top-4 -right-2.5 z-10 px-2.5 py-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black tracking-widest select-none">
              NEW!
            </div>
          )}
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold">
              🧩 조각
            </span>
            {isOwner && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  trackShareEvent("share_card_share_click", {
                    auction_id: auction.id,
                    club_id: auction.club_id,
                    club_name: club?.name,
                  });
                  setShareSheetOpen(true);
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-black transition-colors active:scale-[0.97] shadow-[0_2px_10px_rgba(245,158,11,0.4)]"
                aria-label="내 테이블 공유"
              >
                <Share2 className="w-3.5 h-3.5" />
                내 테이블 공유
              </button>
            )}
          </div>

          {/* 제목 + 지역 */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1 flex-1 pr-16">
              <div className="text-[18px] font-black leading-snug break-keep tracking-tight">
                <span className="text-white">{club?.name}</span>
                {club?.area && (
                  <span className="text-neutral-500 text-[14px] ml-1.5 font-bold tracking-normal align-middle">
                    {club.area}
                  </span>
                )}
              </div>
              {auction.md_message && (
                <p className="text-[13px] text-neutral-400 font-medium leading-snug">{auction.md_message}</p>
              )}
            </div>
          </div>

          {/* 가격 + 퍼즐 피스 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-[18px] font-black text-green-400">
                1인 {(auction.price_per_seat ?? 0).toLocaleString()}원
              </span>
            </div>
            <div className="space-y-1">
              {isShareFull && (
                <span className="text-[13px] text-green-400 font-bold">조각 완성! 🎉</span>
              )}
              {(() => {
                const remaining = totalSeats - localFilled;
                const todayViews = auction.today_view_count ?? 0;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {slotLayout.map((slot, i) => (
                      <PuzzlePiece key={i} filled={slot.filled} gender={slot.gender} />
                    ))}
                    {remaining === 1 && (
                      <span className="text-[11px] font-bold ml-1 text-red-400">
                        마지막 1자리
                      </span>
                    )}
                    {todayViews >= 10 && (
                      <span className={`text-[11px] font-semibold text-amber-400/80 ${remaining === 1 ? "" : "ml-1"}`}>
                        👀 오늘 {todayViews}명이 봤어요
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 주류 알약 + 참여하기 (같은 행) */}
          {(() => {
            const all = auction.includes || [];
            const { liquor } = categorizeLiquor(all);
            const sorted = [...all].sort((a, b) => {
              const aL = liquor.includes(a); const bL = liquor.includes(b);
              return aL === bL ? 0 : aL ? -1 : 1;
            });
            const maxShow = 3;
            return (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-wrap min-w-0">
                  {sorted.slice(0, maxShow).map((item) => (
                    <span key={item}
                      className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        liquor.includes(item)
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-neutral-800/50 text-neutral-400 border-neutral-700/30"
                      }`}>
                      {item}
                    </span>
                  ))}
                  {sorted.length > maxShow && (
                    <span className="text-[10px] text-neutral-500 font-bold">+{sorted.length - maxShow}</span>
                  )}
                </div>
                {!isOwner && (
                  <Button
                    className={`h-9 px-3 rounded-full font-black text-[12px] shrink-0 transition-all active:scale-[0.97] ${
                      isShareFull
                        ? "bg-neutral-800 text-neutral-500 cursor-not-allowed pointer-events-none"
                        : "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_2px_12px_rgba(245,158,11,0.35)]"
                    }`}
                  >
                    {isShareFull ? "마감" : "자세히 보기"}
                  </Button>
                )}
              </div>
            );
          })()}

          {/* 작성자 전용: 확정 인원 스테퍼 */}
          {isOwner && (
            <div className="space-y-1.5" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                인스타·네이버 카페 등 외부에서 인원을 모집했나요?
                <br />
                바로 업데이트 해보세요 👇
              </p>
              {hasGenderSlot ? (
                // 성별 분리 스테퍼
                <div className="grid grid-cols-2 gap-1.5">
                  {(() => {
                    const baseMale = (auction.seats_claimed_male ?? 0) + (auction.external_male ?? 0);
                    const baseFemale = (auction.seats_claimed_female ?? 0) + (auction.external_female ?? 0);
                    const baseTotal = baseMale + baseFemale;
                    const newTotal = baseTotal + extMaleDelta + extFemaleDelta;
                    return [
                      { label: "🧑 남자", delta: extMaleDelta, base: baseMale, onInc: () => setExtMaleDelta(d => d + 1), onDec: () => setExtMaleDelta(d => d - 1), color: "text-blue-400" },
                      { label: "👩 여자", delta: extFemaleDelta, base: baseFemale, onInc: () => setExtFemaleDelta(d => d + 1), onDec: () => setExtFemaleDelta(d => d - 1), color: "text-pink-400" },
                    ].map(({ label, delta, base, onInc, onDec, color }) => (
                      <div key={label} className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-3 h-10">
                        <span className={`text-[11px] font-bold ${saving ? "text-neutral-500" : color}`}>
                          {label} <span className="text-white">
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" disabled={base + delta <= 0 || saving} onClick={onDec}
                            className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 disabled:opacity-30 transition-colors">
                            <Minus className="w-2.5 h-2.5 text-white" />
                          </button>
                          <button type="button" disabled={newTotal >= totalSeats || saving} onClick={onInc}
                            className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 disabled:opacity-30 transition-colors">
                            <Plus className="w-2.5 h-2.5 text-white" />
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                // 단순 스테퍼 — 외부 인원 변동분(델타) 입력. 기본 0, +/-로 증감
                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 h-10">
                  <span className={`text-[12px] font-bold ${saving ? "text-neutral-500" : "text-neutral-300"}`}>
                    외부 모집 <span className="text-white">
                      {extDelta > 0 ? `+${extDelta}` : extDelta}명
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={totalFilled + extDelta <= 0 || saving}
                      onClick={() => setExtDelta(d => d - 1)}
                      className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 disabled:opacity-30 transition-colors">
                      <Minus className="w-3 h-3 text-white" />
                    </button>
                    <button type="button" disabled={totalFilled + extDelta >= totalSeats || saving}
                      onClick={() => setExtDelta(d => d + 1)}
                      className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 disabled:opacity-30 transition-colors">
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          {isOwner ? (
            <div onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
              <Button
                disabled={saving}
                onClick={confirmExt}
                className="w-full h-11 font-black text-[13px] rounded-xl active:scale-[0.98] disabled:opacity-50 bg-white hover:bg-neutral-200 text-black"
              >
                {saving ? "저장 중..." : "인원 업데이트"}
              </Button>
            </div>
          ) : null}
        </div>
      </Link>
      {isOwner && (
        <ShareSheet
          open={shareSheetOpen}
          onOpenChange={setShareSheetOpen}
          url={`${typeof window !== "undefined" ? window.location.origin : ""}/auctions/${auction.id}`}
          title={`${club?.name ?? "조각"} ${club?.area ?? ""}`.trim()}
          text={`1인 ${(auction.price_per_seat ?? 0).toLocaleString()}원 · 조각 모집 중`}
        />
      )}
      </>
    );
  }

  return (
    <div>
      <Link href={`/auctions/${auction.id}`}>
        <div className={`relative overflow-hidden bg-[#1C1C1E] rounded-2xl p-3 transition-all active:scale-[0.98] cursor-pointer ${isWon ? "won-card-border won-card-glow border border-transparent" : "border border-transparent"} ${auction.status === "unsold" ? "opacity-60" : ""}`}>
          {/* 우측 상단: 찜 (1행) + 입장시간 (2행) */}
          <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1">
            {club && (
              <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <FavoriteButton clubId={club.id} />
              </div>
            )}
          </div>

          {/* Row 1: Image + Info */}
          <div className="flex gap-3">
            {/* 110x80 Thumbnail */}
            <div className="w-[110px] h-[64px] rounded-xl bg-neutral-900 overflow-hidden flex-shrink-0 relative">
              <AuctionImage
                auctionThumbnail={auction.thumbnail_url}
                clubThumbnail={club?.thumbnail_url}
                includes={auction.includes}
                alt={club?.name || "경매"}
                priority={priority}
                sizes="(max-width: 768px) 110px, 140px"
              />
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0">
              {/* 상단 그룹: 클럽명 + 포함내역 (밀착) */}
              <div>
                {/* 클럽명 + 영역 (heart 자리 확보) */}
                <div className="flex items-baseline gap-1.5 pr-10">
                  <h3 className="font-semibold text-[16px] text-white truncate leading-tight tracking-tight min-w-0">
                    {club?.name}
                  </h3>
                  {club?.area && (
                    <span className="flex-shrink-0 text-[10px] text-neutral-500 font-medium">
                      {club.area}
                    </span>
                  )}
                </div>
                {/* 거래 뱃지 (별도 행, MD 거래 3회 이상일 때만) */}
                {(() => {
                  const dealCount = (auction.md as { md_deal_count?: number } | null)?.md_deal_count;
                  if (!dealCount || dealCount < 3) return null;
                  return (
                    <div className="flex items-center mt-0.5">
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-neutral-400">
                        {dealCount >= 30 ? (
                          <Flame className="w-3 h-3 text-orange-500" />
                        ) : dealCount >= 10 ? (
                          <BadgeCheck className="w-3 h-3 text-blue-400" />
                        ) : (
                          <BadgeCheck className="w-3 h-3 text-neutral-500" />
                        )}
                        거래 {dealCount}회
                      </span>
                    </div>
                  );
                })()}
                <div className="flex items-center mt-0.5 overflow-hidden">
                  {(() => {
                    const all = auction.includes || [];
                    const { liquor } = categorizeLiquor(all);
                    const liquorOnly = all.filter(item => liquor.includes(item));
                    const hasExtras = all.length > liquorOnly.length;
                    return (
                      <span className="text-[10px] truncate text-neutral-500">
                        {liquorOnly.map((item, i) => (
                          <span key={item}>
                            {i > 0 && <span className="text-neutral-600 mx-1">&middot;</span>}
                            <span className="text-amber-400/90 font-medium">
                              {item.replace(/병$/, "")}
                            </span>
                          </span>
                        ))}
                        {hasExtras && (
                          <span className="text-neutral-600 ml-1">+α</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* share: 퍼즐 슬롯 아이콘 */}
              {isShare && (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {Array.from({ length: totalSeats }).map((_, i) => (
                    <PuzzlePiece key={i} filled={i < totalFilled} />
                  ))}
                </div>
              )}

              {/* 타이머/상태 (share 제외) */}
              {!isShare && <div className="flex items-center mt-1 -ml-1">
                {isActive && countdown.level === 'idle' && (
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${timerStyles.bg}`}>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span suppressHydrationWarning className={`text-[15px] font-mono font-bold tabular-nums whitespace-nowrap ${timerStyles.text}`}>
                      {formatCountdownLong(countdown.remaining)}
                    </span>
                  </div>
                )}
                {isActive && countdown.level !== 'idle' && (
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-all duration-500 ${timerStyles.bg} ${countdown.level === 'critical' ? timerStyles.glow : ''} ${countdown.level === 'critical' ? 'animate-breathe' : ''}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${countdown.level === 'critical' ? 'bg-red-500 animate-ping' : 'bg-red-500 animate-pulse'}`} />
                    <span suppressHydrationWarning className={`text-[15px] font-mono font-bold tabular-nums ${timerStyles.text} ${countdown.shouldFlash ? 'animate-flip' : ''} ${countdown.level === 'critical' ? 'animate-tension' : ''}`}>
                      {formatCountdown(countdown.remaining)}
                    </span>
                  </div>
                )}
                {isExpired && (
                  <Badge className="text-[10px] px-2.5 py-0.5 h-auto font-medium bg-neutral-800 text-neutral-400 rounded-full border-transparent">
                    마감
                  </Badge>
                )}
                {isWon && (
                  <Badge className="text-[10px] px-2.5 py-0.5 h-auto font-bold bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                    {isInstant ? <Zap className="w-3 h-3 mr-0.5 fill-amber-400" /> : <Gavel className="w-3 h-3 mr-0.5" />}
                    {isInstant ? "예약완료" : "낙찰"}
                  </Badge>
                )}
                {auction.status === "unsold" && (
                  <Badge className="text-[10px] px-2.5 py-0.5 h-auto font-medium bg-neutral-800 text-neutral-500 rounded-full border-transparent">
                    {isInstant ? "미판매" : "유찰"}
                  </Badge>
                )}
                {auction.status === "cancelled" && (
                  <Badge className="text-[10px] px-2.5 py-0.5 h-auto font-medium bg-neutral-800 text-neutral-600 rounded-full border-transparent">
                    취소
                  </Badge>
                )}
              </div>}
            </div>
          </div>

          {/* MD 한마디 (모바일에서도 풀 너비로 잘 보이게 별도 행) */}
          {auction.md_comment && (
            <div className="flex items-center gap-1 mt-1.5 text-[12px] text-neutral-300 italic">
              <span className="shrink-0">💬</span>
              <span className="truncate">{auction.md_comment}</span>
            </div>
          )}

          {/* Bottom Bar: share 전용 */}
          {isShare ? (
            <div className="mt-2 space-y-1.5">
              {/* 라스트 N 강조 */}
              <div className="flex justify-end">
                {isShareActive && totalFilled > 0 && (seatsLeft <= 2 || seatsLeft / totalSeats <= 0.34) && (
                  <span className={`flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    seatsLeft === 1
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}>
                    <Zap className="w-2.5 h-2.5 fill-current" />
                    라스트 {seatsLeft}자리!
                  </span>
                )}
                {isShareFull && (
                  <span className="text-[11px] font-bold text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">마감</span>
                )}
              </div>
              {/* 진행 바 */}
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isShareFull ? "bg-neutral-500" : "bg-amber-500"}`}
                  style={{ width: `${totalSeats > 0 ? Math.min(100, (totalFilled / totalSeats) * 100) : 0}%` }}
                />
              </div>
              {/* 가격 + CTA */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-neutral-500 font-medium leading-none">인당</span>
                  <div className="text-[22px] font-bold text-white leading-none tracking-tight">
                    {formatNumber(auction.price_per_seat ?? 0)}원
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={isShareFull}
                  className={`h-8 px-4 rounded-full font-bold text-xs tracking-tight transition-all ${
                    isShareFull
                      ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                      : seatsLeft <= 2
                        ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                        : "bg-white text-black hover:bg-neutral-100"
                  }`}
                >
                  {isShareFull ? "마감" : "자세히 보기"}
                </Button>
            </div>
          </div>
          ) : (
          /* Bottom Bar: 경매/즉시구매 전용 (기존 코드) */
          <div className="flex items-center justify-between mt-1 gap-2">
            <div className="flex flex-col min-w-0">
              {!isInstant && !isCompleted && (
                <span className="text-[10px] text-neutral-500 font-medium leading-none mb-0.5">
                  {auction.bid_count > 0 ? "현재가" : "시작가"}
                </span>
              )}
              <span className={`text-[23px] font-bold leading-none tracking-tight ${isWon ? "text-amber-400" : "text-white"}`}>
                {formatNumber(currentPrice)}원
              </span>
              {(!isInstant && (isUserHighest || isUserOutbid) || (isWon && !isInstant)) && (
                <div className="flex items-center gap-1 mt-1">
                  {!isInstant && isUserHighest && (
                    <span className="text-green-400 bg-green-500/10 px-1.5 py-0 rounded-full text-[10px] font-bold border border-green-500/20">최고입찰</span>
                  )}
                  {!isInstant && isUserOutbid && (
                    <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0 rounded-full text-[10px] font-bold border border-amber-500/20">추월됨</span>
                  )}
                  {isWon && !isInstant && (
                    <span className="text-[10px] text-amber-500/70">입찰 {auction.bid_count}회</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              {!isInstant && (auction.today_view_count ?? 0) >= 10 && (
                <span className="text-[10px] text-amber-400/80 font-semibold">👀 오늘 {auction.today_view_count}명</span>
              )}
              {socialProof && (
                <span className="text-[10px] text-amber-400/60 font-medium">{socialProof}</span>
              )}
              <div className="flex items-center gap-2">
                {isScheduled && (
                  <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <NotifySubscribeButton auctionId={auction.id} compact />
                  </div>
                )}
                <Button
                  size="sm"
                  className={`h-8 px-4 rounded-full font-bold text-xs tracking-tight transition-all ${isActive
                    ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    : isWon
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                      : "bg-neutral-800 text-neutral-400"
                    }`}
                >
                  {isActive
                    ? isInstant ? (isUserInterested ? "대화중" : "예약하기") : "자세히 보기"
                    : isScheduled
                      ? `${formatTime(auction.auction_start_at)} ${isInstant ? "예약" : "입찰"} 시작`
                      : "결과확인"
                  }
                </Button>
              </div>
            </div>
          </div>
          )}
        </div>
      </Link>

    </div>
  );
});
