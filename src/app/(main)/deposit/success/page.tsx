"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function DepositSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");
    const auctionId = searchParams.get("auctionId");

    if (!paymentKey || !orderId || !amount) {
      setStatus("error");
      return;
    }

    // 서버에 결제 승인 요청
    fetch("/api/deposit/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount),
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("결제 승인 실패");
        setStatus("success");

        // 2초 후 경매 페이지로 복귀
        setTimeout(() => {
          router.replace(`/auctions/${auctionId || ""}`);
        }, 2000);
      })
      .catch(() => {
        setStatus("error");
        setTimeout(() => {
          router.replace(`/auctions/${auctionId || ""}`);
        }, 3000);
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-green-400 animate-spin mx-auto" />
            <p className="text-white font-bold text-lg">보증금 결제 확인 중...</p>
            <p className="text-neutral-400 text-sm">잠시만 기다려주세요</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-white font-bold text-lg">보증금 결제 완료!</p>
            <p className="text-neutral-400 text-sm">경매 페이지로 돌아갑니다...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-white font-bold text-lg">결제 확인 실패</p>
            <p className="text-neutral-400 text-sm">경매 페이지에서 다시 시도해주세요</p>
          </>
        )}
      </div>
    </div>
  );
}
