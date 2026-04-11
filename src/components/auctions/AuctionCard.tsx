"use client";

import { memo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction, MDCustomerGrade } from "@/types/database";
import { MD_GRADE_CONFIG } from "@/types/database";
import { formatNumber, formatTime, formatCountdown, formatEntryTime, sortByLiquorFirst, categorizeLiquor } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { URGENCY_STYLES, URGENCY_LABELS } from "@/lib/constants/timer-urgency";
import { Clock, Gavel, Zap } from "lucide-react";
import { AuctionImage } from "@/components/auctions/DrinkPlaceholder";
import { NotifySubscribeButton } from "@/components/auctions/NotifySubscribeButton";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";

interface AuctionCardProps {
  auction: Auction;
  userBidAmount?: number;
  isUserInterested?: boolean;
}

export const AuctionCard = memo(function AuctionCard({ auction, userBidAmount, isUserInterested }: AuctionCardProps) {
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
  const countdown = useCountdown((isActive || isExpired) ? endTime : null);
  const timerStyles = URGENCY_STYLES[countdown.level];

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

  // 입장시간 텍스트
  const hasEntryInfo = !isCompleted && !isExpired;
  const entryText = hasEntryInfo
    ? formatEntryTime(auction.entry_time, auction.event_date)
    : null;

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
            {entryText && (
              <span className="text-[10px] font-medium text-blue-400/90">
                {entryText}
              </span>
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
              />
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0 pr-10">
              {/* 상단 그룹: 클럽명 + 포함내역 (밀착) */}
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-[16px] text-white truncate leading-tight tracking-tight">
                    {club?.name}
                  </h3>
                  {club?.area && (
                    <span className="flex-shrink-0 text-[10px] text-neutral-500 font-medium">
                      {club.area}
                    </span>
                  )}
                  {(() => {
                    const grade = (auction.md as { md_customer_grade?: MDCustomerGrade } | null)?.md_customer_grade;
                    if (!grade || grade === "rookie") return null;
                    const cfg = MD_GRADE_CONFIG[grade];
                    return (
                      <span className={`flex-shrink-0 px-1.5 py-0 rounded text-[9px] font-black ${cfg.color} ${cfg.bgColor}`}>
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center mt-0.5 overflow-hidden">
                  {(() => {
                    const filtered = (auction.includes || []).filter(item => item !== "기본 안주");
                    const sorted = sortByLiquorFirst(filtered);
                    const { liquor } = categorizeLiquor(filtered);
                    const maxShow = 2;
                    const visible = sorted.slice(0, maxShow);
                    const remaining = sorted.length - maxShow;
                    return (
                      <span className="text-[10px] truncate text-neutral-500">
                        {visible.map((item, i) => {
                          const isLiquor = liquor.includes(item);
                          return (
                            <span key={item}>
                              {i > 0 && <span className="text-neutral-600 mx-1">&middot;</span>}
                              <span className={isLiquor ? "text-amber-400/90 font-medium" : "text-neutral-500"}>
                                {item}
                              </span>
                            </span>
                          );
                        })}
                        {remaining > 0 && (
                          <span className="text-neutral-600 ml-1">+{remaining}</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* 타이머/상태 */}
              <div className="flex items-center mt-1 -ml-1">
                {isActive && (
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
                    {isInstant ? "구매완료" : "낙찰"}
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
              </div>
            </div>
          </div>

          {/* Bottom Bar: 가격+유저상태 (좌) + 소셜프루프+CTA (우) */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`text-[23px] font-bold leading-none tracking-tight ${isWon ? "text-amber-400" : "text-white"}`}>
                  {formatNumber(currentPrice)}원
                </span>
                {!isInstant && auction.buy_now_price && auction.buy_now_price > 0 && !isWon && (
                  <span className="text-amber-400 text-[10px] font-bold whitespace-nowrap flex items-center gap-0.5">
                    <Zap className="w-3 h-3 fill-amber-400" />
                    {formatNumber(auction.buy_now_price)}원 즉낙
                  </span>
                )}
              </div>
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
            <div className="flex flex-col items-end gap-1">
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
                    ? isInstant ? (isUserInterested ? "대화중" : "예약하기") : "입찰하기"
                    : isScheduled
                      ? `${formatTime(auction.auction_start_at)} ${isInstant ? "구매" : "입찰"} 시작`
                      : "결과확인"
                  }
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Link>

    </div>
  );
});
