"use client";

import { useState, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Auction, MDCustomerGrade } from "@/types/database";
import { MD_GRADE_CONFIG } from "@/types/database";
import { formatNumber, formatTime, formatCountdown, formatEntryTime, sortByLiquorFirst, categorizeLiquor } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { useCountdown } from "@/hooks/useCountdown";
import { URGENCY_STYLES, URGENCY_LABELS } from "@/lib/constants/timer-urgency";
import { MapPin, ExternalLink, Clock, Gavel, Zap, Shield } from "lucide-react";
import { DrinkPlaceholder, getAuctionImageUrl } from "@/components/auctions/DrinkPlaceholder";
import { NotifySubscribeButton } from "@/components/auctions/NotifySubscribeButton";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";

interface AuctionCardProps {
  auction: Auction;
  userBidAmount?: number;
}

export const AuctionCard = memo(function AuctionCard({ auction, userBidAmount }: AuctionCardProps) {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const club = auction.club;
  const displayStatus = getAuctionDisplayStatus(auction);
  const isActive = displayStatus === 'active';
  const isScheduled = displayStatus === 'scheduled';
  const isExpired = displayStatus === 'expired';
  const isCompleted = ["won", "unsold", "contacted", "confirmed", "cancelled"].includes(auction.status);
  const isWon = ["won", "contacted", "confirmed"].includes(auction.status);
  const endTime = getEffectiveEndTime(auction);
  const currentPrice = isWon && auction.winning_price ? auction.winning_price : (auction.current_bid || auction.start_price);
  const isInstant = auction.listing_type === 'instant';
  const countdown = useCountdown((isActive || isExpired) ? endTime : null);
  const timerStyles = URGENCY_STYLES[countdown.level];

  // 사용자 입찰 상태
  const userHasBid = userBidAmount !== undefined;
  const isUserHighest = userHasBid && userBidAmount >= (auction.current_bid || 0);
  const isUserOutbid = userHasBid && !isUserHighest && isActive;

  // 가격 컨텍스트 라벨
  const priceLabel = isWon
    ? (isInstant ? "구매 완료" : "낙찰가")
    : isInstant
      ? "판매가"
      : auction.bid_count > 0
        ? "현재 입찰가"
        : "시작가";

  // 소셜프루프 텍스트
  const socialProof = !isInstant && !isCompleted && !isExpired && auction.bid_count > 0
    ? `${auction.bidder_count || auction.bid_count}명 입찰 중`
    : null;

  // 입장시간 텍스트
  const hasEntryInfo = !isCompleted && !isExpired;
  const entryText = hasEntryInfo
    ? formatEntryTime(auction.entry_time, auction.event_date)
    : null;

  return (
    <div>
      <Link href={`/auctions/${auction.id}`}>
        <div className={`relative overflow-hidden bg-[#1C1C1E] rounded-2xl p-3 transition-all active:scale-[0.98] cursor-pointer ${isWon ? "won-card-border won-card-glow border border-transparent" : "border border-transparent"} ${auction.status === "unsold" ? "opacity-60" : ""}`}>
          {/* 우측 상단: 지도 (1행) + 입장시간 (2행) */}
          <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {club && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMapOpen(true);
                  }}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-neutral-800/40 backdrop-blur-[2px] border border-white/5 hover:bg-neutral-700 transition-colors"
                  title="지도에서 보기"
                >
                  <MapPin className="w-2.5 h-2.5 text-neutral-400" />
                </button>
              )}
            </div>
            {entryText && (
              <span className="text-[10px] font-medium text-blue-400/90">
                {entryText}
              </span>
            )}
          </div>

          {/* Row 1: Image + Info */}
          <div className="flex gap-3">
            {/* 110x80 Thumbnail */}
            <div className="w-[110px] h-[80px] rounded-xl bg-neutral-900 overflow-hidden flex-shrink-0 relative">
              {(() => {
                const imageUrl = getAuctionImageUrl(auction.thumbnail_url, club?.thumbnail_url, auction.includes);
                if (imageUrl) {
                  return <Image src={imageUrl} alt={club?.name || "경매"} fill className="object-cover" />;
                }
                return <DrinkPlaceholder includes={auction.includes || []} />;
              })()}
              {/* 찜 버튼 */}
              {club && (
                <div className="absolute top-1 right-1 z-10 scale-90 origin-top-right" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <FavoriteButton clubId={club.id} />
                </div>
              )}
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
                    const grade = (auction.md as any)?.md_customer_grade as MDCustomerGrade | undefined;
                    if (!grade || grade === "rookie") return null;
                    const cfg = MD_GRADE_CONFIG[grade];
                    return (
                      <span className={`flex-shrink-0 px-1.5 py-0 rounded text-[9px] font-black ${cfg.color} ${cfg.bgColor}`}>
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center mt-1.5 overflow-hidden">
                  {(() => {
                    const filtered = (auction.includes || []).filter(item => item !== "기본 안주");
                    const sorted = sortByLiquorFirst(filtered);
                    const { liquor } = categorizeLiquor(filtered);
                    const maxShow = 2;
                    const visible = sorted.slice(0, maxShow);
                    const remaining = sorted.length - maxShow;
                    return (
                      <span className="text-[11px] truncate text-neutral-500">
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

              {/* 타이머/상태 (좌) + 소셜프루프 (우) */}
              <div className="flex items-center justify-between mt-1 -ml-1">
                <div className="flex items-center">
                  {isActive && (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all duration-500 ${timerStyles.bg} ${countdown.level === 'critical' ? timerStyles.glow : ''} ${countdown.level === 'critical' ? 'animate-breathe' : ''}`}>
                      <span className={`w-2 h-2 rounded-full ${countdown.level === 'critical' ? 'bg-red-500 animate-ping' : 'bg-red-500 animate-pulse'}`} />
                      <span suppressHydrationWarning className={`text-[13px] font-mono font-bold tabular-nums ${timerStyles.text} ${countdown.shouldFlash ? 'animate-flip' : ''} ${countdown.level === 'critical' ? 'animate-tension' : ''}`}>
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
                {socialProof && (
                  <span className="text-[10px] text-neutral-400">{socialProof}</span>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Price + CTA */}
          <div className="flex items-end justify-between mt-2">
            <div className="flex flex-col">
              {/* 가격 컨텍스트 라벨 */}
              <span className="text-[10px] text-neutral-500 tracking-wider mb-1">
                {priceLabel}
              </span>
              <div className="flex items-end gap-2">
                <span className={`text-[20px] font-bold leading-none tracking-tight ${isWon ? "text-amber-400" : "text-white"}`}>
                  {formatNumber(currentPrice)}원
                </span>
                {!isInstant && auction.buy_now_price && auction.buy_now_price > 0 && !isWon && (
                  <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0 rounded-full text-[10px] font-bold border border-amber-500/20 whitespace-nowrap">
                    즉시 낙찰 가능
                  </span>
                )}
                {auction.deposit_required && !isWon && (
                  <span className="text-green-400 bg-green-500/10 px-1.5 py-0 rounded-full text-[10px] font-bold border border-green-500/20 whitespace-nowrap flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" />보증금
                  </span>
                )}
              </div>
              {/* 하단 메타 - 유저상태 */}
              {(!isInstant && (isUserHighest || isUserOutbid) || (isWon && !isInstant)) && (
              <div className="flex items-center gap-1 mt-1.5">
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

            <div className="flex items-center gap-2">
              {isScheduled && (
                <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <NotifySubscribeButton auctionId={auction.id} compact />
                </div>
              )}
              <Button
                size="sm"
                className={`h-[34px] px-5 rounded-full font-semibold text-[13px] transition-all ${isActive
                  ? isInstant
                    ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    : "bg-white text-black hover:bg-neutral-200"
                  : isWon
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                    : "bg-neutral-800 text-neutral-400"
                  }`}
              >
                {isActive
                  ? isInstant ? "예약하기" : "입찰하기"
                  : isScheduled
                    ? `${formatTime(auction.auction_start_at)} ${isInstant ? "구매" : "입찰"} 시작`
                    : "결과확인"
                }
              </Button>
            </div>
          </div>
        </div>
      </Link>

      {/* 지도 앱 선택 Sheet */}
      {club && (
        <Sheet open={isMapOpen} onOpenChange={setIsMapOpen}>
          <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-8">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-white text-[16px]">
                {club.name} 위치 확인
              </SheetTitle>
              {club.address && (
                <p className="text-[13px] text-neutral-400">{club.address}</p>
              )}
            </SheetHeader>
            <div className="flex flex-col gap-3 mt-4">
              <button
                onClick={() => {
                  const query = encodeURIComponent(club.address || club.name);
                  window.open(`https://map.naver.com/v5/search/${query}`, "_blank");
                  setIsMapOpen(false);
                }}
                className="flex items-center gap-3 p-4 bg-[#0A0A0A] rounded-2xl border border-neutral-800 hover:border-green-500/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[18px] font-bold text-green-500">N</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-bold text-white">네이버지도</p>
                  <p className="text-[12px] text-neutral-400">네이버지도에서 열기</p>
                </div>
                <ExternalLink className="w-4 h-4 text-neutral-500" />
              </button>

              <button
                onClick={() => {
                  const query = encodeURIComponent(club.address || club.name);
                  window.open(`https://map.kakao.com/link/search/${query}`, "_blank");
                  setIsMapOpen(false);
                }}
                className="flex items-center gap-3 p-4 bg-[#0A0A0A] rounded-2xl border border-neutral-800 hover:border-yellow-500/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[18px] font-bold text-yellow-500">K</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-bold text-white">카카오맵</p>
                  <p className="text-[12px] text-neutral-400">카카오맵에서 열기</p>
                </div>
                <ExternalLink className="w-4 h-4 text-neutral-500" />
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
});
