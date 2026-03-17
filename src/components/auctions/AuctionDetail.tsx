"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Auction, Bid, User, UserTrustScore, MDCustomerGrade } from "@/types/database";
import { MD_GRADE_CONFIG } from "@/types/database";
import { useAuctionStore } from "@/stores/useAuctionStore";
import { useAuctionRealtime } from "@/hooks/useAuctionRealtime";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuctionTimer } from "./AuctionTimer";
import { CurrentBidDisplay } from "./CurrentBidDisplay";
import { BidHistory } from "./BidHistory";
import { BidPanel } from "./BidPanel";
import { BidCompetitionIndicator } from "./BidCompetitionIndicator";
import { LastBidIndicator } from "./LastBidIndicator";
import { useCountdown } from "@/hooks/useCountdown";
import { BidderProfile } from "@/components/md/BidderProfile";
import { formatDate, formatTime, formatPrice, formatEventDate, sortByLiquorFirst, categorizeLiquor } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { ContactButton } from "./ContactButton";
import { ExtensionNotice } from "./ExtensionNotice";
import { NotifySubscribeButton } from "./NotifySubscribeButton";
import { Calendar, ShieldCheck, MessageSquare, PartyPopper, MapPin, AlertCircle, Instagram, Zap, Clock, MessageCircle, Copy, Check as CheckIcon, Phone } from "lucide-react";
import { toast } from "sonner";
import { DrinkPlaceholder, getAuctionImageUrl } from "@/components/auctions/DrinkPlaceholder";
import { getDrinkCategoryImage } from "@/lib/constants/drink-images";
import { TableDetailsCard } from "./TableDetailsCard";
import { trackEvent } from "@/lib/analytics";

interface AuctionDetailProps {
  auction: Auction;
  initialBids: Bid[];
  mdConfirmedCount?: number;
}

export function AuctionDetail({ auction, initialBids, mdConfirmedCount = 0 }: AuctionDetailProps) {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useCurrentUser();
  const { currentAuction, setCurrentAuction, setBids, bids } = useAuctionStore();

  // VIP CRM 상태 (MD 전용)
  const [vipUserIds, setVipUserIds] = useState<string[]>([]);
  const [vipIdMap, setVipIdMap] = useState<Record<string, string>>({});
  const [selectedBidderScore, setSelectedBidderScore] = useState<UserTrustScore | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // 초기 데이터 설정 + 언마운트 시 stale 방지
  useEffect(() => {
    setCurrentAuction(auction);
    setBids(initialBids);
    return () => {
      setCurrentAuction(null);
      setBids([]);
    };
  }, [auction, initialBids, setCurrentAuction, setBids]);

  // Mixpanel: 경매 상세 조회
  useEffect(() => {
    trackEvent("auction_viewed", {
      auction_id: auction.id,
      club_name: auction.club?.name,
      area: auction.club?.area,
      table_info: auction.table_info,
      start_price: auction.start_price,
      current_bid: auction.current_bid,
      status: auction.status,
    });
  }, [auction.id]);

  // Realtime 구독 (내부에서 Outbid 알림도 처리)
  useAuctionRealtime(auction.id, user?.id);

  const displayAuction = (currentAuction?.id === auction.id) ? currentAuction : auction;
  const club = displayAuction.club;
  const md = displayAuction.md;
  const displayStatus = getAuctionDisplayStatus(displayAuction);
  const isActive = displayStatus === 'active';
  const isExpired = displayStatus === 'expired';

  // Liquor 분류 메모이제이션 (성능 최적화)
  const { sortedIncludes, liquorItems } = useMemo(() => {
    const sorted = sortByLiquorFirst(displayAuction.includes || []);
    const { liquor } = categorizeLiquor(displayAuction.includes || []);
    return { sortedIncludes: sorted, liquorItems: liquor };
  }, [displayAuction.includes]);

  // 타이머 상태 결정: DB status + 실제 시작 시간 기반
  // DB가 scheduled이어도 시작 시간이 지났으면 active로 취급
  const isScheduled = displayStatus === 'scheduled';
  const endTime = isScheduled
    ? displayAuction.auction_start_at
    : getEffectiveEndTime(displayAuction);

  const timerStatus: "active" | "ended" | "scheduled" = isScheduled
    ? "scheduled"
    : (isActive ? "active" : "ended");

  // 타이머 remaining 값 (심리적 트리거용)
  const { remaining } = useCountdown(timerStatus !== "ended" ? endTime : null);

  // 시작 시간 라벨 (예: "2/26 (수) 오후 10:00 시작")
  const startTimeLabel = isScheduled
    ? `${formatDate(displayAuction.auction_start_at)} ${formatTime(displayAuction.auction_start_at)} 시작`
    : undefined;

  const isMdOwner = user?.role === "md" && user?.id === displayAuction.md_id;

  // 입찰 상태 계산
  const userHasBid = !!user && bids.some(b => b.bidder_id === user.id);
  const isHighestBidder = !!user && bids.length > 0 && bids[0]?.bidder_id === user.id;
  const isOutbid = userHasBid && !isHighestBidder && isActive;

  const isWinner = user && (displayAuction.winner_id === user.id || (displayAuction.status === "won" && bids.find(b => b.bidder_id === user.id && b.status === "won")));
  const isWonStatus = displayAuction.status === "won" || displayAuction.status === "contacted";
  const showContactCTA = isWonStatus && isWinner;

  // 낙찰 알림 Toast + 진동
  const prevStatusRef = useRef(displayAuction.status);
  useEffect(() => {
    if (prevStatusRef.current !== "won" && displayAuction.status === "won" && isWinner) {
      trackEvent("auction_won", {
        auction_id: displayAuction.id,
        winning_bid: displayAuction.current_bid,
        club_name: displayAuction.club?.name,
      });
      toast.success("축하합니다! 낙찰되셨습니다!", {
        description: "MD에게 연락하여 예약을 확정해주세요.",
        duration: 10000,
        action: {
          label: "내 낙찰 보기",
          onClick: () => router.push("/bids?tab=won"),
        },
      });
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }
    prevStatusRef.current = displayAuction.status;
  }, [displayAuction.status, isWinner]);

  // 낙찰자 연락 타이머 (Model B)
  const contactEndTime = displayAuction.contact_deadline;
  const { remaining: contactRemaining } = useCountdown(showContactCTA ? contactEndTime : null);
  const [contactAttempted, setContactAttempted] = useState(
    !!displayAuction.contact_attempted_at
  );

  // VIP 유저 목록 로드 (MD 전용)
  useEffect(() => {
    if (!isMdOwner) return;

    async function fetchVipUsers() {
      const { data } = await supabase
        .from("md_vip_users")
        .select("id, user_id")
        .eq("md_id", user!.id);

      if (data) {
        setVipUserIds(data.map((v) => v.user_id));
        setVipIdMap(Object.fromEntries(data.map((v) => [v.user_id, v.id])));
      }
    }

    fetchVipUsers();
  }, [isMdOwner, user, supabase]);

  // 입찰자 클릭 핸들러 (MD 전용)
  const handleBidderClick = async (bidderId: string) => {
    if (!isMdOwner) return;

    const { data } = await supabase
      .from("user_trust_scores")
      .select("*")
      .eq("id", bidderId)
      .single();

    if (data) {
      setSelectedBidderScore(data);
      setProfileModalOpen(true);
    }
  };

  // VIP 토글 핸들러
  const handleVipChange = (userId: string, isVip: boolean, vipId?: string) => {
    if (isVip && vipId) {
      setVipUserIds((prev) => [...prev, userId]);
      setVipIdMap((prev) => ({ ...prev, [userId]: vipId }));
    } else {
      setVipUserIds((prev) => prev.filter((id) => id !== userId));
      setVipIdMap((prev) => {
        const newMap = { ...prev };
        delete newMap[userId];
        return newMap;
      });
    }
  };

  const handleBidSuccess = useCallback((bidAmount: number) => {
    // 즉시 로컬 상태 업데이트 (Realtime 지연/미작동 대비)
    const state = useAuctionStore.getState();
    state.updateAuction({
      current_bid: bidAmount,
      bid_count: (state.currentAuction?.bid_count || 0) + 1,
    });

    // Optimistic: 입찰 기록도 즉시 추가 (Realtime 미작동 대비)
    if (user) {
      state.addBid({
        id: crypto.randomUUID(),
        auction_id: displayAuction.id,
        bidder_id: user.id,
        bid_amount: bidAmount,
        status: "active",
        bid_at: new Date().toISOString(),
        bidder: {
          ...user,
          name: user.name || "나",
          profile_image: user.profile_image || null,
        } as User,
      });
    }
  }, [displayAuction.id, user]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-32 max-w-lg mx-auto">
      {/* 1. Hero Image Section */}
      <div className="relative h-[220px] w-full overflow-hidden">
        {(() => {
          const imageUrl = getAuctionImageUrl(displayAuction.thumbnail_url, club?.thumbnail_url, displayAuction.includes);
          if (imageUrl) {
            return <Image src={imageUrl} alt={club?.name || "경매"} fill className="object-cover" priority />;
          }
          return <DrinkPlaceholder includes={displayAuction.includes || []} className="text-5xl" />;
        })()}
        {/* Overlay Gradients */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent" />

        {/* Floating Badges */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          {isActive ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <span className="text-[11px] font-bold text-white tracking-wider">LIVE</span>
            </div>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] px-2.5 py-1 uppercase font-medium tracking-wider bg-black/40 backdrop-blur-md text-neutral-300 border border-white/10 rounded-full"
            >
              {isExpired ? "마감중" : displayAuction.status === "won" ? "낙찰 성공" : displayAuction.status === "contacted" ? "연락 완료" : "종료"}
            </Badge>
          )}
        </div>

        {/* Hero Content Overlay */}
        <div className="absolute bottom-10 left-4 right-4 space-y-0.5">
          <div className="flex items-center gap-2 text-[13px] text-neutral-400 font-bold uppercase tracking-widest">
            <span>{club?.area}</span>
          </div>
          <h1 className="text-[42px] font-black text-white tracking-tighter leading-[1.1]">
            {club?.name}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {sortedIncludes.slice(0, 3).map((item) => {
              const isLiquor = liquorItems.includes(item);
              return (
                <span
                  key={item}
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${isLiquor
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-neutral-800/50 text-neutral-400 border-neutral-700/30"
                    }`}
                >
                  {item}
                </span>
              );
            })}
            {(displayAuction.includes?.length || 0) > 3 && (
              <span className="text-[11px] text-neutral-500 font-bold">
                +{(displayAuction.includes?.length || 0) - 3}
              </span>
            )}
          </div>
        </div>

        {/* Image Disclaimer */}
        {(() => {
          if (displayAuction.thumbnail_url) {
            return (
              <div className="absolute bottom-2 right-2 z-10">
                <p className="text-[8px] text-neutral-500 bg-black/60 px-2 py-1 rounded">
                  * 파트너 제공 이미지로, 실제와 다를 수 있습니다
                </p>
              </div>
            );
          }
          if (club?.thumbnail_url) {
            return (
              <div className="absolute bottom-2 right-2 z-10">
                <p className="text-[8px] text-neutral-500 bg-black/60 px-2 py-1 rounded">
                  * 클럽 대표 이미지로, 실제 테이블과 다를 수 있습니다
                </p>
              </div>
            );
          }
          if (getDrinkCategoryImage(displayAuction.includes || [])) {
            return (
              <div className="absolute bottom-2 right-2 z-10">
                <p className="text-[8px] text-neutral-500 bg-black/60 px-2 py-1 rounded">
                  * 이미지는 주류 카테고리를 나타내며, 실제 제공 브랜드와 다를 수 있습니다
                </p>
              </div>
            );
          }
          return null;
        })()}
      </div>

      <div className="px-4 -mt-8 space-y-3 relative z-10 max-w-lg mx-auto">
        {/* 2. Current Bid Status Card (High Urgency) */}
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-5 space-y-3 shadow-2xl">
          <div className="space-y-1">
            <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider">
              현재 최고 입찰가
            </p>
            <CurrentBidDisplay
              amount={displayAuction.current_bid || displayAuction.start_price}
              bidCount={displayAuction.bid_count}
              bidderCount={displayAuction.bidder_count}
              isMinimal={true}
              isHighestBidder={isHighestBidder}
              isOutbid={isOutbid}
            />
            {/* 마지막 입찰 경과 시간 (심리적 트리거) */}
            {bids.length > 0 && (
              <LastBidIndicator lastBidTime={bids[0]?.bid_at} />
            )}
          </div>

          <AuctionTimer endTime={endTime} status={timerStatus} startTimeLabel={startTimeLabel} />

          {/* 마감 임박 시 연장 안내 */}
          {isActive && (
            <ExtensionNotice auction={displayAuction} remaining={remaining} />
          )}

          {/* 입찰 경쟁 상황 표시 (1분 이하 + 3명 이상) */}
          {isActive && <BidCompetitionIndicator bids={bids} remaining={remaining} />}

          {/* 알림받기 버튼 (예정 경매만) */}
          {isScheduled && (
            <NotifySubscribeButton auctionId={displayAuction.id} />
          )}
        </Card>

        {/* 3. Event Summary */}
        <div className="px-1">
          <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[11px] text-neutral-500 font-bold tracking-wider">방문 일정</span>
              </div>
              {displayAuction.entry_time ? (
                <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span className="text-[11px] font-bold text-blue-400">{displayAuction.entry_time} 입장</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                  <Zap className="w-3 h-3 text-green-500 fill-green-500" />
                  <span className="text-[11px] font-bold text-green-500">즉시 입장</span>
                </div>
              )}
            </div>
            <p className="text-[16px] text-white font-bold">{formatEventDate(displayAuction.event_date)}</p>
          </div>
        </div>

        {/* Floor Plan Viewer (if club has floor plan) */}
        {club?.floor_plan_url && displayAuction.table_info && (
          <div className="px-1">
            <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-500" />
                <h2 className="text-[14px] font-bold text-white">테이블 위치</h2>
              </div>
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden border border-neutral-800">
                  <img
                    src={club.floor_plan_url}
                    alt="테이블 위치"
                    className="w-full h-auto block select-none pointer-events-none"
                    draggable={false}
                  />
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[11px] text-amber-400 font-bold">
                    {displayAuction.table_info}
                  </span>
                  <span className="text-[10px] text-neutral-500">테이블</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Table Details Card */}
        <TableDetailsCard
          includes={displayAuction.includes || []}
          notes={displayAuction.notes}
        />

        {/* 5. MD Information & Trust */}
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-black text-neutral-500">
                    {md?.name?.substring(0, 1) || "MD"}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1C1C1E] flex items-center justify-center">
                    <ShieldCheck className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-white font-bold">{md?.name || "나이트플로우 매니저"}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[12px] text-neutral-500 font-medium">NightFlow 공식 인증 파트너</p>
                    {mdConfirmedCount > 0 && (
                      <span className="text-[11px] text-green-500 font-bold">
                        · 거래 {mdConfirmedCount}건 완료
                      </span>
                    )}
                    {(() => {
                      const grade = (md as any)?.md_customer_grade as MDCustomerGrade | undefined;
                      if (!grade || grade === "rookie") return null;
                      const cfg = MD_GRADE_CONFIG[grade];
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${cfg.color} ${cfg.bgColor}`}>
                          {cfg.label} MD
                        </span>
                      );
                    })()}
                  </div>
                  {md?.instagram && (
                    <a
                      href={`https://instagram.com/${md.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[12px] text-neutral-400 font-bold hover:text-white transition-colors mt-0.5"
                    >
                      <Instagram className="w-3 h-3" />
                      @{md.instagram}
                    </a>
                  )}
                </div>
              </div>
              {md?.instagram ? (
                <a
                  href={`https://instagram.com/${md.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="icon" variant="ghost" className="rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800">
                    <Instagram className="w-5 h-5" />
                  </Button>
                </a>
              ) : (
                <Button size="icon" variant="ghost" className="rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800">
                  <MessageSquare className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* 6. Bid History (Compact) */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              실시간 입찰 기록
            </h2>
            <span className="text-[11px] text-neutral-500 font-bold">LIVE</span>
          </div>
          <BidHistory
            bids={bids}
            currentBid={displayAuction.current_bid}
            vipUserIds={isMdOwner ? vipUserIds : undefined}
            onBidderClick={isMdOwner ? handleBidderClick : undefined}
          />
        </div>

        {/* Footer Actions / Info — 비로그인 시 안내 (sticky CTA는 아래에서 별도 렌더링) */}
      </div>

      {/* 7-a. 비로그인 sticky CTA */}
      {isActive && !user && (
        <div className="bg-[#0A0A0A]/80 backdrop-blur-lg border-t border-neutral-800 p-4 pb-safe sticky bottom-0 z-50">
          <div className="max-w-lg mx-auto">
            <Button
              onClick={() => router.push("/login")}
              className="w-full h-12 bg-white text-black font-black text-base hover:bg-neutral-200 rounded-xl"
            >
              로그인하고 입찰하기
            </Button>
          </div>
        </div>
      )}
      {/* 7-b. Bid Panel (Bottom) */}
      {isActive && user && (
        <div className="bg-[#0A0A0A]/80 backdrop-blur-lg border-t border-neutral-800 p-4 pb-safe mt-8 sticky bottom-0 z-50">
          <div className="max-w-lg mx-auto">
            <BidPanel
              auction={displayAuction}
              onBidSuccess={handleBidSuccess}
            />
          </div>
        </div>
      )}
      {/* 8. Winner Contact MD CTA (Bottom) - Model B: DM + 전화 */}
      {showContactCTA && (
        <div className="bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-neutral-800 p-4 pb-safe sticky bottom-0 z-[60] animate-in slide-in-from-bottom duration-500">
          <div className="max-w-lg mx-auto space-y-3">
            {contactRemaining > 0 ? (
              <>
                <div className="bg-neutral-900/80 border border-neutral-700 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PartyPopper className="w-5 h-5 text-amber-400" />
                      <span className="text-white font-bold text-sm">{md?.name ? `${md.name} MD에게 연락하세요` : "MD에게 연락하세요"}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-neutral-500 font-medium uppercase">자동 취소까지</p>
                      <p className={`text-lg font-black tabular-nums ${contactRemaining <= 300 ? "text-red-500 animate-pulse" : contactRemaining <= 600 ? "text-amber-400" : "text-red-400"}`}>
                        {Math.floor(contactRemaining / 60)}:{(contactRemaining % 60).toString().padStart(2, "0")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-white text-[13px] font-bold">
                      {displayAuction.contact_timer_minutes || 15}분 이내에 {md?.name ? `${md.name} MD에게` : "MD에게"} 연락하여 예약을 확정하세요.
                    </p>
                    <p className="text-neutral-400 text-[11px] font-medium leading-relaxed">
                      마감 시간 내 연락이 없으면 낙찰이 취소되며, <span className="text-red-400">노쇼 스트라이크(3일~영구 활동 제한)</span>가 부과됩니다.
                    </p>
                  </div>

                  <div className="pt-1 space-y-2">
                    {md?.instagram && (
                      <ContactButton
                        auctionId={displayAuction.id}
                        type="dm"
                        url={`https://instagram.com/${md.instagram}`}
                        clubName={club?.name}
                        tableInfo={displayAuction.table_info}
                        currentBid={displayAuction.current_bid}
                        eventDate={displayAuction.event_date}
                        entryTime={displayAuction.entry_time}
                        onContact={() => setContactAttempted(true)}
                      />
                    )}
                    {md?.phone && (
                      <ContactButton
                        auctionId={displayAuction.id}
                        type="phone"
                        url={`tel:${md.phone}`}
                        onContact={() => setContactAttempted(true)}
                      />
                    )}
                  </div>

                  {/* 연락하러 가기 */}
                  <button
                    onClick={() => router.push("/bids?tab=won")}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-amber-400 font-bold">연락하러 가기</span>
                  </button>
                </div>

                {/* No-Show Warning */}
                <div className="flex items-start gap-2 px-1">
                  <AlertCircle className="w-4 h-4 text-neutral-500 mt-0.5" />
                  <p className="text-[10px] text-neutral-500 font-medium leading-normal">
                    미연락 시 활동이 제한됩니다. 신중한 예약을 부탁드립니다.
                  </p>
                </div>
              </>
            ) : contactAttempted ? (
              <div className="space-y-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-green-400 font-bold text-sm">연락 시도가 기록되었어요</p>
                    <p className="text-neutral-500 text-[11px]">스트라이크 없이 처리돼요. MD의 확인을 기다려주세요.</p>
                  </div>
                </div>
                <div className="bg-neutral-900/80 border border-neutral-700 rounded-2xl p-4 space-y-3">
                  <p className="text-neutral-400 text-xs font-bold">연락이 안 되셨나요? 다시 시도해주세요.</p>
                  {md?.instagram && (
                    <ContactButton
                      auctionId={displayAuction.id}
                      type="dm"
                      url={`https://instagram.com/${md.instagram}`}
                      clubName={club?.name}
                      tableInfo={displayAuction.table_info}
                      currentBid={displayAuction.current_bid}
                      eventDate={displayAuction.event_date}
                      entryTime={displayAuction.entry_time}
                    />
                  )}
                  {md?.phone && (
                    <ContactButton
                      auctionId={displayAuction.id}
                      type="phone"
                      url={`tel:${md.phone}`}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 space-y-2 text-center">
                <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
                <p className="text-red-400 font-bold text-sm">연락 시간이 만료되었습니다</p>
                <p className="text-neutral-500 text-xs">차순위 낙찰자에게 넘어갑니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. Bidder Profile Modal (MD 전용) */}
      {isMdOwner && (
        <BidderProfile
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          userScore={selectedBidderScore}
          mdId={user!.id}
          isVip={selectedBidderScore ? vipUserIds.includes(selectedBidderScore.id) : false}
          vipId={selectedBidderScore ? vipIdMap[selectedBidderScore.id] : undefined}
          onVipChange={handleVipChange}
        />
      )}
    </div>
  );
}
