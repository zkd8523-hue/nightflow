"use client";

import { useState, memo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import type { Auction } from "@/types/database";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import { isAuctionActive } from "@/lib/utils/auction";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { trackEvent } from "@/lib/analytics";

interface InstantBuyPanelProps {
  auction: Auction;
  onBuySuccess: (amount: number) => void;
}

export const InstantBuyPanel = memo(function InstantBuyPanel({ auction, onBuySuccess }: InstantBuyPanelProps) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isActive = isAuctionActive(auction);
  const price = auction.start_price;

  const handleBuy = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }

    setLoading(true);

    try {
      // place_bid()를 그대로 호출 (BIN 인프라 재활용)
      // buy_now_price === start_price이므로 즉시 낙찰 트리거
      const { data: result, error } = await supabase.rpc("place_bid", {
        p_auction_id: auction.id,
        p_bidder_id: user.id,
        p_bid_amount: price,
      });

      if (error) throw error;

      trackEvent("instant_buy", {
        auction_id: auction.id,
        price,
        club_name: auction.club?.name,
      });

      setShowConfirm(false);
      onBuySuccess(price);

      toast.success("예약 완료! MD에게 연락해주세요 🎉", { duration: 5000 });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, "InstantBuyPanel.handleBuy");

      if (msg.includes("자신의 경매")) {
        toast.error("자신의 경매는 예약할 수 없습니다.");
      } else if (msg.includes("진행 중이 아닙니다") || msg.includes("already won") || msg.includes("종료되었습니다")) {
        toast.error("이미 다른 사용자가 예약했습니다.");
        router.refresh();
      } else if (msg.includes("is_blocked") || msg.includes("차단된")) {
        toast.error("계정이 차단되어 예약할 수 없습니다.");
      } else if (error instanceof TypeError && msg.includes("fetch")) {
        toast.error("네트워크 연결이 불안정합니다. 인터넷 상태를 확인해주세요.");
      } else {
        toast.error("예약 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="p-3 space-y-2.5 bg-[#1C1C1E] border-neutral-800/50">
        {/* 예약 시 연락 의무 안내 */}
        {isActive && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-400/90 font-bold leading-snug">
              예약 후 10분 내 MD 연락해야 해요
            </p>
          </div>
        )}

        {/* 판매가 */}
        <div className="px-1">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">판매가</p>
          <div className="flex items-baseline font-black text-white tracking-tighter leading-none mt-1">
            <span className="text-[32px]">{formatNumber(price)}</span>
            <span className="text-[18px] ml-0.5 font-bold">원</span>
          </div>
        </div>

        {/* 예약 버튼 */}
        <Button
          className={`w-full h-12 text-base font-black rounded-xl transition-all active:scale-[0.98] ${
            isActive && !loading
              ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]"
              : "bg-neutral-800 text-neutral-500 shadow-none cursor-not-allowed"
          }`}
          onClick={() => setShowConfirm(true)}
          disabled={!isActive || loading}
        >
          {isActive ? "예약하기" : "판매 종료"}
        </Button>

        {/* 신뢰 + 안내 */}
        {isActive && (
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <p className="text-[11px] text-neutral-500 font-medium">
              보증금 3만원 발생, 나머지는 MD에게 직접 결제
            </p>
          </div>
        )}
      </Card>

      {/* 확인 시트 */}
      <Sheet open={showConfirm} onOpenChange={setShowConfirm}>
        <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              예약 확인
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              {`${formatPrice(price)}에 예약하시겠습니까?`}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">상품</span>
                <span className="font-bold text-white text-right max-w-[200px] truncate">{auction.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">예약가</span>
                <span className="font-black text-2xl text-amber-400">
                  {formatPrice(price)}
                </span>
              </div>
              <div className="h-px bg-neutral-800/30" />
              <div className="flex items-start gap-2 pt-1">
                <ShieldCheck className="w-4 h-4 text-neutral-400 mt-0.5" />
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  본 금액은 나이트플로우 결제 없이 **매장에서 MD에게 직접 지불**합니다.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 text-center">
              예약 확정 시 방문 필수 · 노쇼 시 이용이 제한됩니다
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
                onClick={handleBuy}
                disabled={loading}
                className="h-14 rounded-2xl font-black text-lg text-black bg-amber-500 hover:bg-amber-400"
              >
                {loading ? "처리 중..." : "예약하기"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}, (prev, next) => {
  return (
    prev.auction.id === next.auction.id &&
    prev.auction.status === next.auction.status &&
    prev.auction.start_price === next.auction.start_price &&
    prev.onBuySuccess === next.onBuySuccess
  );
});
