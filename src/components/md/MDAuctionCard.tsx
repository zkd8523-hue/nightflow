"use client";

import { useState, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Auction } from "@/types/database";
import { formatNumber, formatTime } from "@/lib/utils/format";
import { getEffectiveEndTime, getAuctionDisplayStatus } from "@/lib/utils/auction";
import { InlineTimer } from "@/components/auctions/InlineTimer";
import { createClient } from "@/lib/supabase/client";
import { Edit2, MoreVertical, Trash2, Share2, RotateCcw, Phone, Heart, Minus, Plus } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface MDAuctionCardProps {
    auction: Auction;
    onDelete?: () => void;
    topBidder?: { bidder_name: string; bid_amount: number };
    favoriteCount?: number;
}

export const MDAuctionCard = memo(function MDAuctionCard({ auction, onDelete, topBidder, favoriteCount = 0 }: MDAuctionCardProps) {
    const router = useRouter();
    const { user } = useCurrentUser();
    const isAdmin = user?.role === "admin";

    const handleCardClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, [role="menuitem"]')) return;
        router.push(`/auctions/${auction.id}`);
    };

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [externalCount, setExternalCount] = useState(auction.external_attendees ?? 0);
    const [savingExternal, setSavingExternal] = useState(false);

    const updateExternalCount = async (next: number) => {
        setSavingExternal(true);
        setExternalCount(next);
        const supabase = createClient();
        await supabase.from("auctions").update({ external_attendees: next }).eq("id", auction.id);
        setSavingExternal(false);
        router.refresh();
    };
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
                title: isInstant ? "연락이 있는 판매 삭제" : "입찰이 있는 경매 삭제",
                description: isInstant
                    ? `이미 연락이 있습니다. 생성 후 5분 내이므로 삭제가 가능하지만, 혼란을 줄 수 있습니다. 정말 삭제하시겠습니까?`
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
        if (!isAdmin && !isEnded && hasBids) {
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


    const handleShare = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/share/auction/${auction.id}/story`);
    };

    const club = auction.club;
    const isInstant = auction.listing_type === 'instant';
    const isShare = auction.listing_type === 'share';
    const displayStatus = getAuctionDisplayStatus(auction);
    const isActive = displayStatus === 'active';
    const isExpired = displayStatus === 'expired';
    const isScheduled = displayStatus === 'scheduled';
    const isEnded = ["won", "unsold", "confirmed"].includes(auction.status);
    const endTime = getEffectiveEndTime(auction);
    const currentPrice = auction.current_bid || auction.start_price;

    // 조각(share) 전용 계산
    const totalFilled = isShare ? (auction.seats_claimed ?? 0) + (auction.external_attendees ?? 0) : 0;
    const totalSeats = isShare ? (auction.total_seats ?? 0) : 0;

    // 낙찰 경매 연락 타이머 (won + contact_deadline)
    const showContactTimer = auction.status === "won" && !!auction.contact_deadline;
    const { remaining: contactRemaining } = useCountdown(showContactTimer ? auction.contact_deadline : null);

    return (
        <Card className="overflow-hidden bg-card border-border/50 hover:border-border transition-all p-3 cursor-pointer active:scale-[0.98]" onClick={handleCardClick}>
            <div className="flex gap-3">
                {/* 조각은 날짜별 그룹 헤더 아래에 묶여 표시되므로 카드 안 썸네일/날짜는 생략(중복).
                    일반 경매·핫딜만 클럽 썸네일 노출. */}
                {!isShare && (
                    <Link href={`/auctions/${auction.id}`} className="w-16 h-16 rounded-lg bg-card overflow-hidden flex-shrink-0 relative border border-border">
                        <AuctionImage
                            auctionThumbnail={auction.thumbnail_url}
                            clubThumbnail={club?.thumbnail_url}
                            includes={auction.includes}
                            alt={club?.name || (isInstant ? "판매" : "경매")}
                        />
                    </Link>
                )}

                {/* Content Area */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                {/* 정산 상태 배지 (종료된 경매만 표시) */}
                                {auction.status === "won" ? null
                                : auction.status === "confirmed" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-green-500/20 text-money border-green-500/30">
                                        ✅ 판매완료
                                    </Badge>
                                ) : auction.status === "unsold" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-muted text-muted-foreground border-border">
                                        {isInstant ? "미판매" : "유찰"}
                                    </Badge>
                                ) : auction.status === "cancelled" ? (
                                    <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-muted text-muted-foreground border-border">
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
                                <h3 className="font-black text-[18px] text-foreground truncate leading-tight">
                                    {isShare ? (auction.table_info || "조각") : club?.name}
                                </h3>
                            </Link>
                        </div>
                        <div className="flex items-center -mr-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-money" onClick={handleShare} title="스토리에 공유">
                                <Share2 className="w-[16px] h-[16px]" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                        <MoreVertical className="w-[18px] h-[18px]" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-muted border-border min-w-[140px]">
                                    {!isEnded && auction.bid_count === 0 && (auction.chat_interest_count ?? 0) === 0 && (
                                        <DropdownMenuItem
                                            onClick={() => router.push(`/md/auctions/${auction.id}/edit`)}
                                            className="text-foreground focus:text-foreground focus:bg-muted"
                                        >
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            수정
                                        </DropdownMenuItem>
                                    )}
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

                    <div className="flex items-end justify-between gap-2 mt-1">
                        <div className="min-w-0">
                            {isShare ? (
                                <>
                                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">인당</div>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-[20px] font-black leading-none text-foreground">
                                            {formatNumber(auction.price_per_seat ?? 0)}
                                        </span>
                                        <span className="text-[12px] font-bold text-muted-foreground">원</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">
                                        {isActive
                                          ? (isInstant ? "판매가" : "현재가")
                                          : ["won", "confirmed"].includes(auction.status)
                                            ? (isInstant ? "확정가" : "낙찰가")
                                            : (isInstant ? "판매가" : "시작가")
                                        }
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`text-[20px] font-black leading-none ${auction.status === "unsold" || auction.status === "cancelled" ? "text-muted-foreground" : "text-foreground"}`}>
                                            {formatNumber(currentPrice)}
                                        </span>
                                        <span className="text-[12px] font-bold text-muted-foreground">원</span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="text-right shrink-0">
                            {isShare ? (
                                /* 현황 · 확정 인원 · 하트를 한 줄로 가로 배치 (컴팩트) */
                                <div className="flex items-end gap-3">
                                    <div>
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">현황</div>
                                        <div className="text-[13px] text-foreground/80 font-bold leading-none">{(auction.seats_claimed ?? 0) + externalCount}/{totalSeats}명</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-muted-foreground font-bold mb-0.5">확정 인원</div>
                                        <div className="flex items-center gap-1.5 justify-end">
                                            <button
                                                type="button"
                                                disabled={externalCount <= 0 || savingExternal}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateExternalCount(Math.max(0, externalCount - 1)); }}
                                                className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Minus className="w-3 h-3 text-foreground" />
                                            </button>
                                            <span className={`text-[13px] font-black w-4 text-center ${savingExternal ? "text-muted-foreground" : "text-foreground"}`}>
                                                {externalCount}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={externalCount + (auction.seats_claimed ?? 0) >= totalSeats || savingExternal}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateExternalCount(externalCount + 1); }}
                                                className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Plus className="w-3 h-3 text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-0.5 pb-0.5 shrink-0">
                                        <Heart className="w-3 h-3 text-red-500 fill-red-500" /> {favoriteCount}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    {auction.bid_count > 0 && !isInstant && (
                                        <>
                                            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">
                                                현황
                                            </div>
                                            <div className="text-[13px] text-foreground/80 font-bold">
                                                입찰 {auction.bid_count}회
                                            </div>
                                        </>
                                    )}
                                    <div className="flex items-center justify-end gap-2 mt-0.5">
                                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-0.5">
                                            <Heart className="w-3 h-3 text-red-500 fill-red-500" /> {favoriteCount}
                                        </span>
                                    </div>
                                    {isActive && !isInstant && topBidder && (
                                        <div className="text-[12px] font-bold mt-0.5 text-money">
                                            👤 {topBidder.bidder_name}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {isActive && !isShare && (
                        <div className="flex items-center gap-2 bg-card/50 px-3 py-1.5 rounded-full border border-border/50">
                            <InlineTimer endTime={endTime} status="active" />
                        </div>
                    )}
                    {isExpired && (
                        <span className="text-[12px] text-muted-foreground font-bold">종료</span>
                    )}
                    {isScheduled && !isActive && (
                        <div className="text-[12px] text-blue-400 font-bold">
                            시작 {formatTime(auction.auction_start_at)}
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {auction.status === "won" && (
                        <Link href="/md/transactions">
                            <Button size="sm" className="h-8 px-3 rounded-lg bg-green-600 text-white font-black hover:bg-green-500">
                                낙찰 관리
                            </Button>
                        </Link>
                    )}
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
                            <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-amber-500/30 text-brand-amber hover:bg-amber-950/30 hover:border-amber-400">
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                재등록
                            </Button>
                        </Link>
                    )}
                    {/* 수정은 점세개(⋮) 메뉴로 이동 */}
                </div>
            </div>

            {/* 판매완료 — 경로 선택 Sheet */}
            <Sheet open={showCompleteConfirm} onOpenChange={(o) => { setShowCompleteConfirm(o); if (!o) setSaleChannel(null); }}>
                <SheetContent side="bottom" className="h-auto bg-card border-border rounded-t-[32px] p-6 pb-12 outline-none">
                  <div className="flex flex-col">
                    <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-3" />
                    <SheetHeader className="text-left p-0 gap-0.5 mb-3">
                        <SheetTitle className="text-foreground font-black text-xl">판매완료</SheetTitle>
                        <SheetDescription className="text-muted-foreground text-sm">판매 경로를 선택해주세요</SheetDescription>
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
                                        ? "bg-inverse text-inverse-foreground border-white"
                                        : "bg-card text-foreground/80 border-border hover:border-border hover:text-foreground"
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
                            className="h-12 rounded-2xl border-border bg-card/50 text-muted-foreground font-bold hover:bg-muted"
                        >
                            취소
                        </Button>
                        <Button
                            disabled={!saleChannel || completing}
                            onClick={() => saleChannel && performComplete(saleChannel)}
                            className="h-12 rounded-2xl font-black text-base bg-inverse hover:opacity-90 text-inverse-foreground disabled:opacity-30"
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
