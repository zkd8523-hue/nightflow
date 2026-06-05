"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Zap, Check } from "lucide-react";
import { CREDIT_PRODUCTS, type CreditProduct } from "@/lib/payments/credit-products";
import { formatPrice } from "@/lib/utils/format";

interface CreditRechargeProps {
  /** 현재 크레딧 잔액 (표시용) */
  currentCredits: number | null;
}

/**
 * MD 크레딧 충전 — 상품 선택 후 포트원(카카오페이) 결제창 호출.
 *
 * 결제 플로우:
 *  1) 상품 선택 → "결제하기"
 *  2) 서버에 결제 의도 등록(/api/credits/prepare) → paymentId 발급(서버 확정 금액)
 *  3) PortOne.requestPayment() 로 카카오페이 결제창 호출  ← 카드사 심사 증빙 화면
 *  4) 결제 결과 → 서버 검증(/api/credits/verify) → 크레딧 적립
 *
 * 앱(Capacitor) 정책: iOS/Android 인앱에서 디지털 재화를 PG로 결제하면 스토어
 * 정책 위반이므로, 네이티브 앱에서는 결제를 막고 웹(브라우저)으로 유도한다.
 */
export function CreditRecharge({ currentCredits }: CreditRechargeProps) {
  const [selectedId, setSelectedId] = useState<string>(
    CREDIT_PRODUCTS.find((p) => p.recommended)?.id ?? CREDIT_PRODUCTS[0].id
  );
  const [loading, setLoading] = useState(false);

  const selected = CREDIT_PRODUCTS.find((p) => p.id === selectedId)!;

  async function handlePay() {
    if (loading) return;
    setLoading(true);

    try {
      // 1) 앱 환경 차단 (스토어 인앱결제 정책)
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        toast.error("크레딧 충전은 웹(브라우저)에서만 가능합니다.", {
          description: "nightflow.kr 에 로그인 후 충전해주세요.",
        });
        setLoading(false);
        return;
      }

      // 2) 서버에 결제 의도 등록 → 위변조 방지된 paymentId/금액 수령
      const prepareRes = await fetch("/api/credits/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected.id }),
      });

      if (!prepareRes.ok) {
        const err = await prepareRes.json().catch(() => ({}));
        throw new Error(err.error ?? "결제 준비에 실패했습니다.");
      }

      const { paymentId, amount, orderName, storeId, channelKey } =
        await prepareRes.json();

      if (!storeId || !channelKey) {
        throw new Error(
          "결제 설정이 완료되지 않았습니다. 잠시 후 다시 시도해주세요."
        );
      }

      // 3) 포트원 결제창 호출 (카카오페이)
      const PortOne = (await import("@portone/browser-sdk/v2")).default;

      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName,
        totalAmount: amount,
        currency: "CURRENCY_KRW",
        payMethod: "EASY_PAY",
        redirectUrl: `${window.location.origin}/md/credits/complete?paymentId=${paymentId}`,
      });

      // PG 창에서 사용자가 취소하거나 실패한 경우
      if (response?.code !== undefined) {
        // 결제 실패 — 서버에 실패 기록 (적립 안 됨)
        await fetch("/api/credits/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        }).catch(() => {});
        toast.error("결제가 취소되었습니다.", {
          description: response.message,
        });
        setLoading(false);
        return;
      }

      // 4) 서버 결제 검증 + 크레딧 적립
      const verifyRes = await fetch("/api/credits/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error ?? "결제 검증에 실패했습니다.");
      }

      toast.success(`크레딧 ${selected.credits}개가 충전되었습니다!`);
      // 잔액 갱신을 위해 새로고침
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      const message = e instanceof Error ? e.message : "결제 중 오류가 발생했습니다.";
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 현재 잔액 */}
      <div className="rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-5">
        <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
          보유 크레딧
        </p>
        <p className="text-3xl font-black text-amber-500">
          {currentCredits ?? 0}
          <span className="text-base font-bold text-neutral-400 ml-1">크레딧</span>
        </p>
      </div>

      {/* 상품 선택 */}
      <div className="space-y-3">
        {CREDIT_PRODUCTS.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            selected={product.id === selectedId}
            onSelect={() => setSelectedId(product.id)}
          />
        ))}
      </div>

      {/* 이용/제공기간/환불 안내 (PG·카드사 심사 요건: 결제금액·서비스 제공기간·환불정보 노출) */}
      <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-4 text-xs text-neutral-500 leading-relaxed space-y-2">
        {/* 서비스 제공 기간 — 카카오페이 요구 형식(제공 시작/이용기간/자동갱신) 명시 */}
        <div className="rounded-lg bg-neutral-800/50 border border-neutral-700/60 p-3 space-y-1">
          <p className="text-neutral-300 font-bold">서비스 제공 기간</p>
          <p>· 제공 시작: <span className="text-neutral-400">결제 완료 즉시</span> 계정에 크레딧 적립 (별도 제공 대기 없음)</p>
          <p>· 이용 기간: <span className="text-neutral-400">충전일로부터 무기한</span> — 충전한 크레딧은 사용 시점까지 소멸되지 않습니다.</p>
          <p>· 자동 갱신: <span className="text-neutral-400">없음</span> (정기결제·자동충전 아님 / 1회성 충전)</p>
        </div>
        <p>· 크레딧은 1개당 100원이며, 부가세가 포함된 금액입니다.</p>
        <p>· 사용하지 않은 크레딧은 충전일로부터 7일 이내 고객센터를 통해 전액 환불 가능합니다.</p>
        <p>· 이미 사용한 크레딧은 환불되지 않습니다.</p>
      </div>

      {/* 결제 버튼 */}
      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full rounded-full bg-white text-black font-black py-4 flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            결제 진행 중...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            {formatPrice(selected.amount)} 결제하기
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-neutral-600">
        카카오페이로 안전하게 결제됩니다.
      </p>
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onSelect,
}: {
  product: CreditProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 flex items-center justify-between transition-colors ${
        selected
          ? "border-amber-500 bg-amber-500/10"
          : "border-neutral-800 bg-[#1C1C1E] hover:border-neutral-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selected ? "border-amber-500 bg-amber-500" : "border-neutral-600"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
        </div>
        <div className="text-left">
          <p className="font-bold text-white">
            크레딧 {product.credits}개
            {product.recommended && (
              <span className="ml-2 text-[10px] font-black text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded-full align-middle">
                인기
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">{product.name}</p>
        </div>
      </div>
      <p className="font-black text-white">{formatPrice(product.amount)}</p>
    </button>
  );
}
