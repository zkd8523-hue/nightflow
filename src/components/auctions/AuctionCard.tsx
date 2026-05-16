"use client";

import { memo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction } from "@/types/database";
import { formatNumber, formatTime, formatCountdown, formatCountdownLong, categorizeLiquor, formatRelativeTime } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { URGENCY_STYLES } from "@/lib/constants/timer-urgency";
import { Gavel, Zap, BadgeCheck, Flame, Users } from "lucide-react";
import { AuctionImage } from "@/components/auctions/DrinkPlaceholder";
import { NotifySubscribeButton } from "@/components/auctions/NotifySubscribeButton";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { PuzzlePiece } from "@/components/puzzles/PuzzleCard";

interface AuctionCardProps {
  auction: Auction;
  userBidAmount?: number;
  isUserInterested?: boolean;
  priority?: boolean;
}

export const AuctionCard = memo(function AuctionCard({ auction, userBidAmount, isUserInterested, priority }: AuctionCardProps) {
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

    return (
      <Link href={`/auctions/${auction.id}`}>
        <div className="relative bg-[#1C1C1E] rounded-2xl p-4 space-y-3 active:scale-[0.98] transition-all cursor-pointer">
          {isNew && (
            <div className="animate-new-badge pointer-events-none absolute -top-4 -right-2.5 z-10 px-2.5 py-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black tracking-widest select-none">
              NEW!
            </div>
          )}
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold">
              🧩 조각
            </span>
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
                N {(auction.price_per_seat ?? 0).toLocaleString()}원
              </span>
            </div>
            <div className="space-y-1">
              {isShareFull && (
                <span className="text-[13px] text-green-400 font-bold">조각 완성! 🎉</span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: totalSeats }).map((_, i) => (
                  <PuzzlePiece key={i} filled={i < totalFilled} />
                ))}
              </div>
            </div>
          </div>

          {/* 주류 */}
          {(() => {
            const all = auction.includes || [];
            const { liquor } = categorizeLiquor(all);
            const liquorOnly = all.filter(item => liquor.includes(item));
            const hasExtras = all.length > liquorOnly.length;
            if (liquorOnly.length === 0) return null;
            return (
              <span className="text-[10px] text-neutral-500">
                {liquorOnly.map((item, i) => (
                  <span key={item}>
                    {i > 0 && <span className="text-neutral-600 mx-1">&middot;</span>}
                    <span className="text-amber-400/90 font-medium">{item.replace(/병$/, "")}</span>
                  </span>
                ))}
                {hasExtras && <span className="text-neutral-600 ml-1">+α</span>}
              </span>
            );
          })()}

          {/* CTA */}
          <div className="relative">
            <p className="absolute -top-5 right-1 text-[10px] text-neutral-500 whitespace-nowrap pointer-events-none" suppressHydrationWarning>
              {formatRelativeTime(auction.created_at)}
            </p>
            <Button
              className={`w-full h-11 font-black text-[13px] rounded-xl transition-all active:scale-[0.98] ${
                isShareFull
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed pointer-events-none"
                  : "bg-amber-500 hover:bg-amber-400 text-black"
              }`}
            >
              {isShareFull ? "마감" : "참여하기"}
            </Button>
          </div>
        </div>
      </Link>
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
                  {isShareFull ? "마감" : "참여하기"}
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
              {!isInstant && (auction.view_count ?? 0) > 0 && (
                <span className="text-[10px] text-neutral-500 font-medium">조회 {auction.view_count}</span>
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
