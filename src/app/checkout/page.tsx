import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, HandCoins, CreditCard } from "lucide-react";

// 결제 안내 페이지 (noindex).
// 현재 나플은 이용자 결제를 중개하지 않으며(Model B), 이용자는 클럽(MD)에게 직접 지불한다.
// 유일한 유료 항목은 MD(파트너)용 플랫폼 크레딧(PortOne/카카오페이).

export const metadata: Metadata = {
  title: "결제 안내 — NightFlow",
  description:
    "NightFlow 결제 안내. 이용자는 매칭된 클럽에 직접 지불하며(Model B), 회사는 결제를 중개하지 않습니다. 유료 항목은 파트너(MD)용 플랫폼 크레딧입니다.",
  alternates: { canonical: "https://nightflow.kr/checkout" },
  robots: { index: false, follow: true },
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-3">
            <ShieldCheck className="w-8 h-8 text-green-500" />
            결제 안내
          </h1>
          <p className="text-[14px] text-neutral-400">
            나플은 이용자의 결제를 중개하지 않습니다.
          </p>
        </div>

        {/* 이용자 — 무결제 · 직접 지불 (Model B) */}
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-amber-500" /> 이용자 — 무결제 · 직접 지불
          </h2>
          <p className="text-[14px] text-neutral-300 leading-relaxed">
            깃발(역경매)로 매칭된 뒤,{" "}
            <span className="text-white font-bold">
              테이블 이용 금액은 이용자가 매칭된 클럽(MD)에게 직접 지불
            </span>
            합니다. 나플은 이 금액을 수령·보관·정산하지 않으며, 별도의 예약 수수료도
            받지 않습니다. (내국인·외국인 동일)
          </p>
        </div>

        {/* MD(파트너) 크레딧 — 유일한 유료 항목 */}
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-500" /> MD(파트너) 크레딧
          </h2>
          <p className="text-[14px] text-neutral-300 leading-relaxed">
            나플의 유일한 유료 항목은{" "}
            <span className="text-white font-bold">
              MD가 플랫폼 기능(오퍼 제안·매치 등)에 사용하는 크레딧
            </span>
            입니다. 1크레딧 = 100원(부가세 포함)이며, 카카오페이 등 결제대행사(PortOne)를
            통해 충전합니다. 미사용 크레딧은 충전일로부터 7일 이내 전액 환불받을 수 있습니다.
          </p>
          <p className="text-[13px] text-neutral-500">
            자세한 내용은{" "}
            <Link href="/terms" className="text-amber-400 underline hover:text-amber-300">
              이용약관
            </Link>
            을 참고하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
