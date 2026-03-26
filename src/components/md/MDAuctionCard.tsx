"use client";

import { useState, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction } from "@/types/database";
import { formatNumber, formatTime, generateTemplateName } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { InlineTimer } from "@/components/auctions/InlineTimer";
import { Edit2, ExternalLink, MoreVertical, Trash2, Share2, RotateCcw, Bookmark, Phone, Zap } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { DrinkPlaceholder, getAuctionImageUrl } from "@/components/auctions/DrinkPlaceholder";
import { toast } from "sonner";
import dayjs from "dayjs";
import { shareAuction } from "@/lib/utils/share";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface MDAuctionCardProps {
    auction: Auction;
    onDelete?: () => void;
    topBidder?: { bidder_name: string; bid_amount: number };
}

export const MDAuctionCard = memo(function MDAuctionCard({ auction, onDelete, topBidder }: MDAuctionCardProps) {
    const router = useRouter();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const createdAt = auction.created_at;
    const minutesSinceCreated = dayjs().diff(dayjs(createdAt), "minute");
    const isGracePeriod = minutesSinceCreated < 5;
    const hasBids = auction.bid_count > 0;

    const getDeleteConfirmInfo = () => {
        if (hasBids && isGracePeriod) {
            return {
                title: isInstant ? "구매 관심이 있는 판매 삭제" : "입찰이 있는 경매 삭제",
                description: isInstant
                    ? `이미 구매 시도가 있습니다. 생성 후 5분 내이므로 삭제가 가능하지만, 혼란을 줄 수 있습니다. 정말 삭제하시겠습니까?`
                    : `이미 ${auction.bid_count}회의 입찰이 있습니다. 생성 후 5분 내이므로 삭제가 가능하지만, 입찰자들에게 혼란을 줄 수 있습니다. 정말 삭제하시겠습니까?`,
                variant: "danger" as const,
            };
        }
        return {
            title: isInstant ? "판매 삭제" : "경매 삭제",
            description: isInstant
                ? "정말 이 판매를 삭제하시겠습니까? 삭제된 항목은 복구할 수 없습니다."
                : "정말 이 경매를 삭제하시겠습니까? 삭제된 경매는 복구할 수 없습니다.",
            variant: "danger" as const,
        };
    };

    const handleDelete = async () => {
        if (hasBids && !isGracePeriod) {
            toast.error(
                isInstant
                    ? `구매 시도가 있어 삭제할 수 없습니다. 생성 후 5분 내에만 삭제 가능합니다.`
                    : `입찰이 ${auction.bid_count}회 있어 삭제할 수 없습니다. 생성 후 5분 내에만 입찰이 있어도 삭제 가능합니다.`,
                {
                    action: {
                        label: "문의하기",
                        onClick: () => router.push("/contact"),
                    },
                }
            );
            return;
        }
        setShowDeleteConfirm(true);
    };

    const performDelete = async () => {
        try {
            const response = await fetch(`/api/auctions/${auction.id}/delete`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const { error } = await response.json();
                throw new Error(error || "삭제에 실패했습니다.");
            }

            toast.success("삭제되었습니다.");
            onDelete?.();
            router.refresh();
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'MDAuctionCard.performDelete');
            toast.error(msg || "삭제에 실패했습니다.");
        }
    };


    const handleShare = async () => {
        await shareAuction({
            auctionId: auction.id,
            clubName: auction.club?.name || "클럽",
            eventDate: auction.event_date,
            startPrice: auction.start_price,
            tableInfo: auction.table_info,
        });
    };

    const [templateSaving, setTemplateSaving] = useState(false);
    const handleSaveTemplate = async () => {
        if (templateSaving) return;
        setTemplateSaving(true);
        try {
            const defaultName = generateTemplateName(
                auction.club?.name || "템플릿",
                auction.includes || [],
                auction.start_price || 0,
            );
            const res = await fetch("/api/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: defaultName,
                    club_id: auction.club_id,
                    listing_type: auction.listing_type || 'auction',
                    start_price: auction.start_price,
                    buy_now_price: auction.buy_now_price,
                    includes: auction.includes,
                    duration_minutes: auction.duration_minutes,
                }),
            });
            if (!res.ok) {
                const { error } = await res.json();
                throw new Error(error);
            }
            toast.success("템플릿으로 저장되었습니다");
        } catch (error: any) {
            toast.error(error?.message || "템플릿 저장에 실패했습니다.");
        } finally {
            setTemplateSaving(false);
        }
    };

    const club = auction.club;
    const isInstant = auction.listing_type === 'instant';
    const displayStatus = getAuctionDisplayStatus(auction);
    const isActive = displayStatus === 'active';
    const isExpired = displayStatus === 'expired';
    const isScheduled = displayStatus === 'scheduled';
    const isEnded = ["won", "unsold", "contacted", "confirmed"].includes(auction.status);
    const endTime = getEffectiveEndTime(auction);
    const currentPrice = auction.current_bid || auction.start_price;

    // 낙찰 경매 연락 타이머 (won + contact_deadline)
    const showContactTimer = auction.status === "won" && !!auction.contact_deadline;
    const { remaining: contactRemaining } = useCountdown(showContactTimer ? auction.contact_deadline : null);

    return (
        <Card className="overflow-hidden bg-[#1C1C1E] border-neutral-800/50 hover:border-neutral-700 transition-all p-3">
            <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="w-20 h-20 rounded-lg bg-neutral-900 overflow-hidden flex-shrink-0 relative border border-neutral-800">
                    {(() => {
                        const imageUrl = getAuctionImageUrl(auction.thumbnail_url, club?.thumbnail_url, auction.includes);
                        if (imageUrl) {
                            return <img src={imageUrl} alt={club?.name || (isInstant ? "판매" : "경매")} className="w-full h-full object-cover" />;
                        }
                        return <DrinkPlaceholder includes={auction.includes || []} />;
                    })()}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {/* 즉시구매 배지 */}
                                {isInstant && (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-black bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        <Zap className="w-2.5 h-2.5 mr-0.5 fill-amber-400" />
                                        즉시구매
                                    </Badge>
                                )}
                                {/* 정산 상태 배지 (종료된 경매는 정산 배지만 표시) */}
                                {auction.status === "contacted" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-blue-500 hover:bg-blue-500 border-blue-400">
                                        ⚠️ 확인필요
                                    </Badge>
                                ) : auction.status === "won" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        📞 연락대기
                                    </Badge>
                                ) : auction.status === "confirmed" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-green-500/20 text-green-400 border-green-500/30">
                                        ✅ 완료
                                    </Badge>
                                ) : auction.status === "unsold" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-neutral-800 text-neutral-500 border-neutral-700">
                                        {isInstant ? "미판매" : "유찰"}
                                    </Badge>
                                ) : auction.status === "cancelled" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-neutral-800 text-neutral-600 border-neutral-700">
                                        취소
                                    </Badge>
                                ) : (
                                    /* 진행/예정 상태 배지 */
                                    <Badge
                                        variant={isActive ? "destructive" : "secondary"}
                                        className={`text-[9px] px-1.5 py-0 h-4 uppercase font-bold ${isActive
                                            ? "bg-red-500 hover:bg-red-500"
                                            : isScheduled
                                                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                                : "bg-neutral-800 text-neutral-400"
                                            }`}
                                    >
                                        {isActive ? "🔴 LIVE" : isExpired ? "마감중" : "예정"}
                                    </Badge>
                                )}
                            </div>
                            {/* 연락 타이머 (낙찰 경매) */}
                            {showContactTimer && contactRemaining > 0 && (
                                <Link href="/md/transactions" className="inline-flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-1 rounded-full mb-1 animate-pulse">
                                    <Phone className="w-3 h-3 text-red-400" />
                                    <span className="text-[11px] font-black text-red-400 tabular-nums">
                                        연락 대기 {Math.floor(contactRemaining / 60)}:{(contactRemaining % 60).toString().padStart(2, "0")}
                                    </span>
                                </Link>
                            )}
                            <h3 className="font-bold text-[16px] text-white truncate leading-tight">
                                {club?.name}
                            </h3>
                        </div>
                        <div className="flex items-center -mr-2">
                            {!isEnded && (
                                <Button variant="ghost" size="icon" className="h-11 w-11 text-neutral-500 hover:text-amber-400" onClick={handleSaveTemplate} disabled={templateSaving} title="템플릿 저장">
                                    <Bookmark className="w-[18px] h-[18px]" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-11 w-11 text-neutral-500 hover:text-green-500" onClick={handleShare} title="스토리에 공유">
                                <Share2 className="w-[18px] h-[18px]" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-11 w-11 text-neutral-500">
                                <MoreVertical className="w-[18px] h-[18px]" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-2">
                        <div>
                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">
                                {isActive
                                  ? (isInstant ? "판매가" : "현재가")
                                  : ["won", "contacted", "confirmed"].includes(auction.status)
                                    ? (isInstant ? "구매가" : "낙찰가")
                                    : (isInstant ? "판매가" : "시작가")
                                }
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-[20px] font-black leading-none ${auction.status === "unsold" || auction.status === "cancelled" ? "text-neutral-600" : "text-white"}`}>
                                    {formatNumber(currentPrice)}
                                </span>
                                <span className="text-[12px] font-bold text-neutral-400">원</span>
                            </div>
                        </div>

                        <div className="text-right">
                            {auction.bid_count > 0 ? (
                                <>
                                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">
                                        현황
                                    </div>
                                    <div className="text-[13px] text-neutral-300 font-bold">
                                        {isInstant ? "구매 완료" : `입찰 ${auction.bid_count}회`}
                                    </div>
                                </>
                            ) : !isEnded ? (
                                <>
                                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">
                                        현황
                                    </div>
                                    <div className="text-[13px] text-neutral-500 font-bold">
                                        {isInstant ? "구매 대기" : "입찰 대기"}
                                    </div>
                                </>
                            ) : null}
                            {isActive && (
                                <div className={`text-[12px] font-bold mt-0.5 ${topBidder ? "text-green-500" : "text-neutral-600"}`}>
                                    {topBidder ? `👤 ${topBidder.bidder_name}` : (isInstant ? "아직 구매 없음" : "아직 입찰 없음")}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-3 pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {isActive && (
                        <div className="flex items-center gap-2 bg-neutral-900/50 px-3 py-1.5 rounded-full border border-neutral-800/50">
                            <span className="text-[11px] text-neutral-500 font-bold">마감</span>
                            <InlineTimer endTime={endTime} status="active" />
                        </div>
                    )}
                    {isExpired && (
                        <span className="text-[12px] text-neutral-500 font-bold">종료</span>
                    )}
                    {isScheduled && !isActive && (
                        <div className="text-[12px] text-blue-400 font-bold">
                            시작 {formatTime(auction.auction_start_at)}
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {!isEnded && (
                        <Link href={`/md/auctions/${auction.id}/edit`}>
                            <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-blue-500/30 text-blue-400 hover:bg-blue-950/30 hover:border-blue-400">
                                <Edit2 className="w-3.5 h-3.5 mr-1" />
                                수정
                            </Button>
                        </Link>
                    )}
                    {auction.status === "unsold" && (
                        <Link href={`/md/auctions/new?repost=${auction.id}`}>
                            <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-amber-500/30 text-amber-400 hover:bg-amber-950/30 hover:border-amber-400">
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                재등록
                            </Button>
                        </Link>
                    )}
                    <Link href={`/auctions/${auction.id}`}>
                        <Button size="sm" className="h-8 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />
                            상세
                        </Button>
                    </Link>
                    {!isEnded && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 rounded-lg border-red-500/30 text-red-400 hover:bg-red-950/30 hover:border-red-400"
                            onClick={handleDelete}
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            삭제
                        </Button>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                onConfirm={performDelete}
                {...getDeleteConfirmInfo()}
                confirmText="삭제하기"
            />

        </Card>
    );
});
