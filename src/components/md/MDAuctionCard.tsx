"use client";

import { useState, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction } from "@/types/database";
import { formatNumber, formatTime } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { InlineTimer } from "@/components/auctions/InlineTimer";
import { Edit2, MoreVertical, Trash2, Share2, RotateCcw, Phone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCountdown } from "@/hooks/useCountdown";
import { AuctionImage } from "@/components/auctions/DrinkPlaceholder";
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
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const [saleChannel, setSaleChannel] = useState<"nightflow" | "other" | null>(null);
    const [completing, setCompleting] = useState(false);

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

    const performComplete = async (channel: "nightflow" | "other") => {
        setCompleting(true);
        try {
            const res = await fetch("/api/auction/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auctionId: auction.id, saleChannel: channel }),
            });
            if (!res.ok) {
                const { error } = await res.json();
                throw new Error(error || "판매완료 처리에 실패했습니다.");
            }
            toast.success("판매완료 처리되었습니다.");
            onDelete?.();
            router.refresh();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setCompleting(false);
            setShowCompleteConfirm(false);
            setSaleChannel(null);
        }
    };

    const handleDelete = async () => {
        if (!isEnded && hasBids) {
            toast.error("입찰이 있는 진행 중 경매는 삭제할 수 없습니다.");
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
            router.push("/md");
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

    const club = auction.club;
    const isInstant = auction.listing_type === 'instant';
    const displayStatus = getAuctionDisplayStatus(auction);
    const isActive = displayStatus === 'active';
    const isExpired = displayStatus === 'expired';
    const isScheduled = displayStatus === 'scheduled';
    const isEnded = ["won", "unsold", "confirmed"].includes(auction.status);
    const endTime = getEffectiveEndTime(auction);
    const currentPrice = auction.current_bid || auction.start_price;

    // 낙찰 경매 연락 타이머 (won + contact_deadline)
    const showContactTimer = auction.status === "won" && !!auction.contact_deadline;
    const { remaining: contactRemaining } = useCountdown(showContactTimer ? auction.contact_deadline : null);

    return (
        <Card className="overflow-hidden bg-[#1C1C1E] border-neutral-800/50 hover:border-neutral-700 transition-all p-3">
            <div className="flex gap-3">
                {/* Thumbnail — 클릭 시 상세 */}
                <Link href={`/auctions/${auction.id}`} className="w-16 h-16 rounded-lg bg-neutral-900 overflow-hidden flex-shrink-0 relative border border-neutral-800">
                    <AuctionImage
                        auctionThumbnail={auction.thumbnail_url}
                        clubThumbnail={club?.thumbnail_url}
                        includes={auction.includes}
                        alt={club?.name || (isInstant ? "판매" : "경매")}
                    />
                </Link>

                {/* Content Area */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                {/* 정산 상태 배지 (종료된 경매만 표시) */}
                                {auction.status === "won" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        📞 연락대기
                                    </Badge>
                                ) : auction.status === "confirmed" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-green-500/20 text-green-400 border-green-500/30">
                                        ✅ 판매완료
                                    </Badge>
                                ) : auction.status === "unsold" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-neutral-800 text-neutral-500 border-neutral-700">
                                        {isInstant ? "미판매" : "유찰"}
                                    </Badge>
                                ) : auction.status === "cancelled" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-neutral-800 text-neutral-600 border-neutral-700">
                                        취소
                                    </Badge>
                                ) : null}
                            </div>
                            {/* 연락 타이머 (낙찰 경매) */}
                            {showContactTimer && contactRemaining > 0 && (
                                <Link href="/md/transactions" className="inline-flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-1 rounded-full mb-1 animate-pulse">
                                    <Phone className="w-3 h-3 text-red-400" />
                                    <span className="text-[11px] font-black text-red-400 tabular-nums">
                                        연락 대기 {contactRemaining >= 3600
                                            ? `${Math.floor(contactRemaining / 3600)}시간 ${Math.floor((contactRemaining % 3600) / 60).toString().padStart(2, "0")}분`
                                            : `${Math.floor(contactRemaining / 60)}:${(contactRemaining % 60).toString().padStart(2, "0")}`}
                                    </span>
                                </Link>
                            )}
                            <Link href={`/auctions/${auction.id}`} className="block">
                                <h3 className="font-black text-[18px] text-white truncate leading-tight">
                                    {club?.name}
                                </h3>
                            </Link>
                        </div>
                        <div className="flex items-center -mr-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-500 hover:text-green-500" onClick={handleShare} title="스토리에 공유">
                                <Share2 className="w-[16px] h-[16px]" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-500">
                                        <MoreVertical className="w-[18px] h-[18px]" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[#2C2C2E] border-neutral-700 min-w-[140px]">
                                    <DropdownMenuItem
                                        onClick={handleDelete}
                                        className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        삭제
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1">
                        <div>
                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">
                                {isActive
                                  ? (isInstant ? "판매가" : "현재가")
                                  : ["won", "confirmed"].includes(auction.status)
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
                            {auction.view_count > 0 && (
                                <div className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                    👀 {auction.view_count}회 조회
                                </div>
                            )}
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
            <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-between">
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
                    {isInstant && isActive && (
                        <Button
                            size="sm"
                            onClick={() => setShowCompleteConfirm(true)}
                            disabled={completing}
                            className="h-8 px-3 rounded-lg bg-green-500 text-black font-black hover:bg-green-400"
                        >
                            판매완료
                        </Button>
                    )}
                    {auction.status === "unsold" && (
                        <Link href={`/md/auctions/new?repost=${auction.id}`}>
                            <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-amber-500/30 text-amber-400 hover:bg-amber-950/30 hover:border-amber-400">
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                재등록
                            </Button>
                        </Link>
                    )}
                    {!isEnded && auction.bid_count === 0 && (auction.chat_interest_count ?? 0) === 0 && (
                        <Link href={`/md/auctions/${auction.id}/edit`}>
                            <Button size="sm" className="h-8 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                                <Edit2 className="w-3.5 h-3.5 mr-1" />
                                수정
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* 판매완료 — 경로 선택 Sheet */}
            <Sheet open={showCompleteConfirm} onOpenChange={(o) => { setShowCompleteConfirm(o); if (!o) setSaleChannel(null); }}>
                <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-[32px] p-6 pb-12 outline-none">
                  <div className="flex flex-col">
                    <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />
                    <SheetHeader className="text-left p-0 gap-0.5 mb-3">
                        <SheetTitle className="text-white font-black text-xl">판매완료</SheetTitle>
                        <SheetDescription className="text-neutral-500 text-sm">판매 경로를 선택해주세요</SheetDescription>
                    </SheetHeader>
                    {/* 경로 선택 */}
                    <div className="space-y-2 mb-3">
                        {([
                            { value: "nightflow", label: "NightFlow" },
                            { value: "other", label: "다른 경로" },
                        ] as const).map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setSaleChannel(value)}
                                className={`w-full h-14 rounded-2xl font-bold text-base transition-all text-left px-5 border ${
                                    saleChannel === value
                                        ? "bg-white text-black border-white"
                                        : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-600 hover:text-white"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            onClick={() => { setShowCompleteConfirm(false); setSaleChannel(null); }}
                            className="h-12 rounded-2xl border-neutral-800 bg-neutral-900/50 text-neutral-400 font-bold hover:bg-neutral-800"
                        >
                            취소
                        </Button>
                        <Button
                            disabled={!saleChannel || completing}
                            onClick={() => saleChannel && performComplete(saleChannel)}
                            className="h-12 rounded-2xl font-black text-base bg-white hover:bg-neutral-200 text-black disabled:opacity-30"
                        >
                            판매완료
                        </Button>
                    </div>
                  </div>
                </SheetContent>
            </Sheet>
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
