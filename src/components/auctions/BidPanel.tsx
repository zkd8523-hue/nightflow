"use client";

import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuctionStore } from "@/stores/useAuctionStore";
import type { Auction } from "@/types/database";
import { formatPrice } from "@/lib/utils/format";
import { getMinBidAmount, getBidPresets, isAuctionActive, isAuctionExpired, getRemainingSeconds } from "@/lib/utils/auction";
import { Crown, ShieldCheck, Shield, Timer, AlertCircle, Zap } from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import { formatNumber } from "@/lib/utils/format";
import { useDepositStatus } from "@/hooks/useDepositStatus";
import { DepositSheet } from "./DepositSheet";
import { calculateRemainingAmount } from "@/lib/payments/deposit-helpers";

export interface BidPanelRef {
  openBinConfirm: () => void;
}

interface BidPanelProps {
  auction: Auction;
  onBidSuccess: (bidAmount: number) => void;
}

export const BidPanel = memo(forwardRef<BidPanelRef, BidPanelProps>(function BidPanel({ auction, onBidSuccess }, ref) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const bids = useAuctionStore((s) => s.bids);
  const supabase = createClient();
  const [bidAmount, setBidAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showBinConfirm, setShowBinConfirm] = useState(false);
  const [binLoading, setBinLoading] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [pendingAction, setPendingAction] = useState<"bid" | "bin" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 보증금 상태
  const { needsDeposit, depositStatus, refresh: refreshDeposit } = useDepositStatus(auction.id, user?.id);
  const depositAmount = auction.deposit_amount || 30000;

  const hasBin = !!(auction.buy_now_price && auction.buy_now_price > 0 && auction.listing_type === 'auction');
  const binPrice = auction.buy_now_price || 0;

  useImperativeHandle(ref, () => ({
    openBinConfirm: () => setShowBinConfirm(true),
  }));

  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, []);

  const isActive = isAuctionActive(auction);
  const isExpired = isAuctionExpired(auction);
  const minBid = getMinBidAmount(auction);
  const presets = getBidPresets(auction);

  // 현재 최고 입찰자인지 확인 (bids[0]이 최신 입찰)
  const isHighestBidder = user && bids.length > 0 && bids[0]?.bidder_id === user.id;

  // 추월 감지: 이전에 최고 입찰자였다가 추월당한 경우
  const wasHighestRef = useRef(false);
  const [wasOutbid, setWasOutbid] = useState(false);

  useEffect(() => {
    if (isHighestBidder) {
      wasHighestRef.current = true;
      setWasOutbid(false);
    } else if (wasHighestRef.current && !isHighestBidder && bids.length > 0) {
      // 추월당함
      setWasOutbid(true);
      wasHighestRef.current = false;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      toast.warning("추월되었습니다! 재입찰하세요", { duration: 6000 });
    }
  }, [isHighestBidder, bids]);

  const getButtonContent = () => {
    if (!isActive) return isExpired ? "마감되었습니다" : "경매 종료";
    if (isHighestBidder) return (
      <>
        <Crown className="w-4 h-4 mr-1 inline-block" />
        최고 입찰 유지 중
      </>
    );
    if (bidAmount < minBid) return "얼마에 입찰할까요?";
    return `${formatPrice(bidAmount)}으로 입찰하기`;
  };

  const getButtonStyle = () => {
    if (!isActive || loading) {
      return "bg-neutral-800 text-neutral-500 shadow-none cursor-not-allowed";
    }
    if (isHighestBidder) {
      return "bg-green-500/10 text-green-400 shadow-none border border-green-500/20 cursor-default";
    }
    if (bidAmount < minBid) {
      return "bg-neutral-800 text-neutral-500 shadow-none cursor-not-allowed";
    }
    return "bg-white hover:bg-neutral-200 text-black shadow-xl";
  };

  const handlePresetClick = (amount: number) => {
    setBidAmount(amount);
  };

  const handleBidSubmit = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }

    if (bidAmount < minBid) {
      toast.error(`최소 입찰가는 ${formatPrice(minBid)}입니다`);
      return;
    }

    setLoading(true);

    try {
      const { data: result, error } = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: user.id,
        p_bid_amount: bidAmount,
      });

      if (error) throw error;

      // 보증금 미결제 에러 처리 (place_bid()가 JSON으로 반환)
      if (result && !result.success && result.error === "deposit_required") {
        toast.error("보증금 결제가 필요합니다");
        setPendingAction("bid");
        setShowConfirm(false);
        setShowDeposit(true);
        return;
      }

      // Outbid 알림톡 발송 (fire-and-forget) - 이전 최고 입찰자에게
      if (result?.previous_bidder_id && result.previous_bidder_id !== user.id) {
        fetch("/api/notifications/outbid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auctionId: auction.id,
            outbidUserId: result.previous_bidder_id,
          }),
        }).catch(logger.error);
      }

      // 본인 입찰 성공 in-app 알림 생성 (fire-and-forget)
      fetch("/api/notifications/bid-placed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionId: auction.id,
          bidAmount,
        }),
      }).catch(logger.error);

      trackEvent("bid_placed", {
        auction_id: auction.id,
        bid_amount: bidAmount,
        club_name: auction.club?.name,
      });

      setShowConfirm(false);
      onBidSuccess(bidAmount);
      setBidAmount(0);

      toast.success("입찰이 완료되었습니다! 🎉", { duration: 5000 });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'BidPanel.handleBidSubmit');

      // 사용자 친화적 에러 메시지 분기
      if (msg.includes("자신의 경매")) {
        toast.error("자신의 경매에 입찰할 수 없습니다.");
      } else if (!user) {
        toast.error("로그인이 만료되었습니다. 다시 로그인해주세요.");
      } else if (msg.includes("already won")) {
        toast.error("이미 다른 사용자가 낙찰받은 경매입니다.");
      } else if (msg.includes("종료되었습니다")) {
        toast.error("경매가 종료되었습니다.");
      } else if (msg.includes("진행 중이 아닙니다")) {
        toast.error("경매가 현재 진행 중이 아닙니다. 새로고침 후 다시 시도해주세요.");
        router.refresh();
      } else if (msg.includes("찾을 수 없습니다")) {
        toast.error("경매를 찾을 수 없습니다.");
      } else if (msg.includes("최고 입찰자") || msg.includes("highest bidder")) {
        toast.error("이미 최고 입찰자입니다. 다른 입찰자가 나타날 때까지 기다려주세요.");
      } else if (msg.includes("is_blocked") || msg.includes("차단된")) {
        toast.error("계정이 차단되어 입찰할 수 없습니다.", {
          action: {
            label: "문의하기",
            onClick: () => router.push("/contact"),
          },
        });
      } else if (msg.includes("insufficient") || msg.includes("금액이 부족")) {
        toast.error("입찰 금액이 현재가보다 낮습니다. 더 높은 금액을 입력해주세요.");
      } else if (error instanceof TypeError && msg.includes("fetch")) {
        toast.error("네트워크 연결이 불안정합니다. 인터넷 상태를 확인해주세요.");
      } else {
        toast.error("입찰 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="p-3 space-y-2.5 bg-[#1C1C1E] border-neutral-800/50">
        {/* 낙찰 시 연락 의무 안내 배너 */}
        {isActive && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-400/90 font-bold leading-snug">
              낙찰 시 10분 내 MD 연락 필수 · 미연락 시 활동이 제한돼요
            </p>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider ml-1">빠른 입찰</p>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((amount, i) => {
              const label = amount >= 10000
                ? `${Math.floor(amount / 10000)}만${amount % 10000 > 0 ? (amount % 10000) / 1000 + "천" : ""}`
                : `${amount / 1000}천`;
              return (
                <Button
                  key={amount}
                  variant={bidAmount === amount ? "default" : "outline"}
                  onClick={() => handlePresetClick(amount)}
                  className={`text-[12px] h-11 border-neutral-800 font-bold flex flex-col gap-0 leading-tight ${bidAmount === amount ? "bg-white text-black hover:bg-neutral-200" : "bg-neutral-900/50 text-neutral-200"
                    }`}
                >
                  <span>{label}</span>
                  {i === 0 && <span className={`text-[9px] font-medium ${bidAmount === amount ? "text-neutral-500" : "text-neutral-500"}`}>최소</span>}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider ml-1">직접 입력</p>
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder={`최소 ${formatPrice(minBid)}`}
            value={bidAmount ? bidAmount.toLocaleString("ko-KR") : ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "");
              setBidAmount(parseInt(raw) || 0);
            }}
            onFocus={handleInputFocus}
            className="bg-neutral-900/80 border-neutral-800 h-11 text-white font-bold focus:ring-neutral-500 text-sm"
          />
        </div>

        {/* 추월 알림 배지 */}
        {wasOutbid && isActive && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-400 font-bold">
              추월되었습니다! 더 높은 금액으로 재입찰하세요
            </p>
          </div>
        )}

        {/* 보증금 안내 배지 */}
        {auction.deposit_required && isActive && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <Shield className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <p className="text-[11px] text-green-400/90 font-bold leading-snug">
              이 경매는 입찰 전 보증금 {formatPrice(depositAmount)} 결제가 필요합니다
              {depositStatus?.paid && " · 결제 완료"}
            </p>
          </div>
        )}

        <Button
          className={`w-full h-12 text-base font-black rounded-xl transition-all active:scale-[0.98] ${getButtonStyle()}`}
          onClick={() => {
            if (needsDeposit) {
              setPendingAction("bid");
              setShowDeposit(true);
            } else {
              setShowConfirm(true);
            }
          }}
          disabled={!isActive || bidAmount < minBid || loading || isHighestBidder}
        >
          {getButtonContent()}
        </Button>

      </Card>

      {/* 확인 시트 */}
      <Sheet open={showConfirm} onOpenChange={setShowConfirm}>
        <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              입찰 확인
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              {`${formatPrice(bidAmount)}으로 입찰하시겠습니까?`}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">경매 상품</span>
                <span className="font-bold text-white text-right max-w-[200px] truncate">{auction.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">입찰가</span>
                <span className="font-black text-2xl text-white">
                  {formatPrice(bidAmount)}
                </span>
              </div>
              {auction.deposit_required && depositStatus?.paid && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm font-bold">보증금 차감</span>
                    <span className="font-bold text-green-400">-{formatPrice(depositAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm font-bold">현장 잔금</span>
                    <span className="font-bold text-white">
                      {formatPrice(calculateRemainingAmount(bidAmount, depositAmount))}
                    </span>
                  </div>
                </>
              )}
              <div className="h-px bg-neutral-800/30" />
              <div className="flex items-start gap-2 pt-1">
                <ShieldCheck className="w-4 h-4 text-neutral-400 mt-0.5" />
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  본 금액은 나이트플로우 결제 없이 **매장에서 MD에게 직접 지불**합니다.
                </p>
              </div>
            </div>

            {/* 마감 임박 시 연장 안내 */}
            {(() => {
              const autoExtendMin = auction.auto_extend_min ?? 3;
              const extensionsLeft = (auction.max_extensions ?? 3) - (auction.extension_count ?? 0);
              const isNearEnd = getRemainingSeconds(auction) <= autoExtendMin * 60;
              if (isNearEnd) {
                return extensionsLeft > 0 ? (
                  <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-3">
                    <Timer className="w-4 h-4 text-neutral-400 shrink-0" />
                    <p className="text-[12px] text-neutral-400 font-bold">
                      이 입찰로 경매가 {autoExtendMin}분 연장됩니다 ({extensionsLeft}회 남음)
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-3">
                    <Timer className="w-4 h-4 text-neutral-400 shrink-0" />
                    <p className="text-[12px] text-neutral-300 font-bold">
                      연장 소진! 더 이상 연장되지 않습니다
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            <p className="text-[11px] text-neutral-500 text-center">
              낙찰 시 방문 필수 · 노쇼 시 이용이 제한됩니다
            </p>

            <div className="grid grid-cols-2 gap-3 pb-8">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
              >
                취소
              </Button>
              <Button
                onClick={handleBidSubmit}
                disabled={loading}
                className="h-14 rounded-2xl font-black text-lg text-black bg-white hover:bg-neutral-200"
              >
                {loading ? "처리 중..." : "확인"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* BIN 확인 시트 */}
      {hasBin && (
        <Sheet open={showBinConfirm} onOpenChange={setShowBinConfirm}>
          <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
            <SheetHeader className="text-left">
              <SheetTitle className="text-white font-black text-xl flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                즉시낙찰 확인
              </SheetTitle>
              <SheetDescription className="text-neutral-400">
                {`${formatPrice(binPrice)}에 즉시 낙찰하시겠습니까?`}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">경매 상품</span>
                  <span className="font-bold text-white text-right max-w-[200px] truncate">{auction.title}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">즉시낙찰가</span>
                  <span className="font-black text-2xl text-amber-400">
                    {formatPrice(binPrice)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">현재 최고가</span>
                  <span className="font-bold text-neutral-300">
                    {auction.current_bid > 0 ? formatPrice(auction.current_bid) : "입찰 없음"}
                  </span>
                </div>
                {auction.deposit_required && depositStatus?.paid && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500 text-sm font-bold">보증금 차감</span>
                      <span className="font-bold text-green-400">-{formatPrice(depositAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500 text-sm font-bold">현장 잔금</span>
                      <span className="font-bold text-white">
                        {formatPrice(calculateRemainingAmount(binPrice, depositAmount))}
                      </span>
                    </div>
                  </>
                )}
                <div className="h-px bg-neutral-800/30" />
                <div className="flex items-start gap-2 pt-1">
                  <ShieldCheck className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                    즉시낙찰 시 경매가 즉시 종료되며, 다른 입찰자에게 알림이 발송됩니다.
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-neutral-500 text-center">
                낙찰 시 방문 필수 · 노쇼 시 이용이 제한됩니다
              </p>

              <div className="grid grid-cols-2 gap-3 pb-8">
                <Button
                  variant="outline"
                  onClick={() => setShowBinConfirm(false)}
                  className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
                >
                  취소
                </Button>
                <Button
                  onClick={async () => {
                    if (!user) {
                      toast.error("로그인이 필요합니다");
                      return;
                    }
                    setBinLoading(true);
                    try {
                      const { data: result, error } = await supabase.rpc("place_bid", {
                        p_auction_id: auction.id,
                        p_bidder_id: user.id,
                        p_bid_amount: binPrice,
                      });
                      if (error) throw error;

                      if (result?.previous_bidder_id && result.previous_bidder_id !== user.id) {
                        fetch("/api/notifications/outbid", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            auctionId: auction.id,
                            outbidUserId: result.previous_bidder_id,
                          }),
                        }).catch(logger.error);
                      }

                      trackEvent("bin_purchase", {
                        auction_id: auction.id,
                        bin_price: binPrice,
                        club_name: auction.club?.name,
                      });

                      setShowBinConfirm(false);
                      onBidSuccess(binPrice);
                      toast.success("즉시낙찰 완료! MD에게 연락해주세요 🎉", { duration: 5000 });
                    } catch (error: unknown) {
                      const msg = getErrorMessage(error);
                      logError(error, 'BidPanel.handleBin');
                      if (msg.includes("자신의 경매")) {
                        toast.error("자신의 경매에 입찰할 수 없습니다.");
                      } else if (msg.includes("already won") || msg.includes("종료되었습니다")) {
                        toast.error("이미 다른 사용자가 낙찰받은 경매입니다.");
                        router.refresh();
                      } else {
                        toast.error("처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
                      }
                    } finally {
                      setBinLoading(false);
                    }
                  }}
                  disabled={binLoading}
                  className="h-14 rounded-2xl font-black text-lg text-black bg-amber-500 hover:bg-amber-400"
                >
                  {binLoading ? "처리 중..." : "즉시낙찰"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* 보증금 결제 시트 */}
      <DepositSheet
        open={showDeposit}
        onOpenChange={setShowDeposit}
        auctionId={auction.id}
        auctionTitle={auction.title}
        depositAmount={depositAmount}
        onDepositComplete={() => {
          setShowDeposit(false);
          refreshDeposit();
          // 보증금 결제 완료 → 원래 액션 재개
          if (pendingAction === "bid") {
            setShowConfirm(true);
          } else if (pendingAction === "bin") {
            setShowBinConfirm(true);
          }
          setPendingAction(null);
        }}
      />
    </>
  );
}), (prev, next) => {
  return (
    prev.auction.id === next.auction.id &&
    prev.auction.current_bid === next.auction.current_bid &&
    prev.auction.bid_count === next.auction.bid_count &&
    prev.auction.status === next.auction.status &&
    prev.auction.buy_now_price === next.auction.buy_now_price &&
    prev.auction.deposit_required === next.auction.deposit_required &&
    prev.auction.extended_end_at === next.auction.extended_end_at &&
    prev.onBidSuccess === next.onBidSuccess
  );
});
