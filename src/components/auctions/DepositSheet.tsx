"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Shield, CreditCard, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils/format";
import { DEPOSIT_AMOUNT } from "@/lib/payments/deposit-helpers";

interface DepositSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auctionId: string;
  auctionTitle: string;
  depositAmount?: number;
  onDepositComplete: () => void;
}

export function DepositSheet({
  open,
  onOpenChange,
  auctionId,
  auctionTitle,
  depositAmount = DEPOSIT_AMOUNT,
  onDepositComplete,
}: DepositSheetProps) {
  const [loading, setLoading] = useState(false);

  const handleDeposit = async () => {
    setLoading(true);
    try {
      // 1. 서버에 보증금 결제 요청 생성
      const createRes = await fetch("/api/deposit/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        if (createRes.status === 409) {
          // 이미 결제됨 → 바로 성공 처리
          onDepositComplete();
          onOpenChange(false);
          return;
        }
        throw new Error(err.error || "보증금 생성 실패");
      }

      const { orderId, amount, orderName } = await createRes.json();

      // 2. 토스 SDK 결제 위젯 호출
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        throw new Error("결제 설정이 완료되지 않았습니다");
      }

      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: "ANONYMOUS" });

      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: amount },
        orderId,
        orderName,
        successUrl: `${window.location.origin}/deposit/success?auctionId=${auctionId}`,
        failUrl: `${window.location.origin}/auctions/${auctionId}?deposit=fail`,
      });

      // 토스 SDK가 리다이렉트하므로 여기까지 도달하지 않음
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("취소")) {
        // 사용자가 결제 취소
        toast.info("결제가 취소되었습니다");
      } else {
        toast.error("보증금 결제에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-white font-black text-xl flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            예약 보증금 결제
          </SheetTitle>
          <SheetDescription className="text-neutral-400">
            입찰 참여를 위해 보증금을 먼저 결제해주세요
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500 text-sm font-bold">경매 상품</span>
              <span className="font-bold text-white text-right max-w-[200px] truncate">
                {auctionTitle}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500 text-sm font-bold">보증금</span>
              <span className="font-black text-2xl text-green-400">
                {formatPrice(depositAmount)}
              </span>
            </div>
            <div className="h-px bg-neutral-800/30" />

            <div className="space-y-2 pt-1">
              <div className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-neutral-300 leading-relaxed font-medium">
                  낙찰 시 테이블 가격에서 <span className="text-green-400 font-bold">차감</span>됩니다
                </p>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-neutral-300 leading-relaxed font-medium">
                  미낙찰 시 <span className="text-green-400 font-bold">전액 환불</span>됩니다
                </p>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-neutral-300 leading-relaxed font-medium">
                  낙찰 취소 · 노쇼 시 보증금이 <span className="text-red-400 font-bold">환불되지 않습니다</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-8">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
            >
              취소
            </Button>
            <Button
              onClick={handleDeposit}
              disabled={loading}
              className="h-14 rounded-2xl font-black text-lg text-black bg-green-500 hover:bg-green-400 flex items-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              {loading ? "처리 중..." : `${formatPrice(depositAmount)} 결제`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
