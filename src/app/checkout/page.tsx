import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ShieldCheck, Globe } from "lucide-react";

// 결제 페이지 미리보기 (Coming Soon).
// 외국인 매칭 시 실제 결제 UI는 매칭 후 동적으로 노출되며,
// 이 페이지는 PG 심사관·일반 방문자 대상 결제 흐름 안내용.

export const metadata: Metadata = {
  title: "결제 시스템 — NightFlow",
  description: "NightFlow 외국인 사용자 안전 결제 시스템 안내. PortOne/Eximbay 결제대행사를 통한 보안 결제.",
  alternates: { canonical: "https://nightflow.kr/checkout" },
  robots: { index: false, follow: true },
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-3">
            <CreditCard className="w-8 h-8 text-amber-500" />
            안전 결제 시스템
          </h1>
          <p className="text-[14px] text-neutral-400">
            외국인 사용자 깃발 매칭 시 안전한 결제 시스템 안내
          </p>
        </div>

        {/* 결제 흐름 */}
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6">
          <h2 className="text-xl font-black text-white">결제 흐름</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-neutral-900 rounded-2xl border border-neutral-800">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center flex-shrink-0">1</div>
              <div className="space-y-1">
                <p className="font-bold text-white">깃발 매칭</p>
                <p className="text-[13px] text-neutral-400">
                  외국인 사용자가 깃발(역경매) 등록 → MD 오퍼 → 사용자 수락
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-neutral-900 rounded-2xl border border-neutral-800">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center flex-shrink-0">2</div>
              <div className="space-y-1">
                <p className="font-bold text-white">결제 진행 (PG)</p>
                <p className="text-[13px] text-neutral-400">
                  결제대행사(Eximbay 등) 페이지로 이동 → 카드/위챗/알리페이 결제
                </p>
                <p className="text-[12px] text-neutral-500 mt-1">
                  ※ NightFlow는 카드 정보를 저장하지 않습니다 (PCI DSS 준수)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-neutral-900 rounded-2xl border border-neutral-800">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center flex-shrink-0">3</div>
              <div className="space-y-1">
                <p className="font-bold text-white">에스크로 보관</p>
                <p className="text-[13px] text-neutral-400">
                  결제 금액은 회사가 안전하게 보관 (사용자 방문 확인 전까지)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-neutral-900 rounded-2xl border border-neutral-800">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center flex-shrink-0">4</div>
              <div className="space-y-1">
                <p className="font-bold text-white">방문 확인 후 정산</p>
                <p className="text-[13px] text-neutral-400">
                  사용자 클럽 방문 확인 → 회사 9% 마진 차감 후 MD에 정산 송금
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 지원 결제 수단 */}
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-amber-500" />
            지원 결제 수단
          </h2>

          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="p-3 bg-neutral-900 rounded-xl">
              <p className="font-bold text-white mb-1">해외 신용카드</p>
              <p className="text-neutral-500">VISA, MasterCard, JCB, AMEX, UnionPay</p>
            </div>
            <div className="p-3 bg-neutral-900 rounded-xl">
              <p className="font-bold text-white mb-1">중국 본토 결제</p>
              <p className="text-neutral-500">WeChat Pay, Alipay+, UnionPay</p>
            </div>
            <div className="p-3 bg-neutral-900 rounded-xl">
              <p className="font-bold text-white mb-1">국제 결제</p>
              <p className="text-neutral-500">PayPal</p>
            </div>
            <div className="p-3 bg-neutral-900 rounded-xl">
              <p className="font-bold text-white mb-1">한국 사용자</p>
              <p className="text-neutral-500">KG이니시스 신용카드 + 간편결제</p>
            </div>
          </div>

          <p className="text-[12px] text-neutral-500 mt-3">
            결제 통화: KRW (기본), USD, JPY, TWD, HKD 환산 표시 지원
          </p>
        </div>

        {/* 보안·환불 */}
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            보안 및 환불 정책
          </h2>

          <div className="space-y-3 text-[14px]">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-neutral-300">
                <span className="font-bold text-white">PCI DSS 보안 표준 준수</span>
                <br />
                <span className="text-[13px] text-neutral-500">카드 정보는 결제대행사에서 안전하게 처리되며, NightFlow는 저장하지 않습니다.</span>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-neutral-300">
                <span className="font-bold text-white">투명한 환불 정책</span>
                <br />
                <span className="text-[13px] text-neutral-500">방문 48시간 전 100% 환불 / 24-48시간 50% / 이후 0%</span>
                <br />
                <Link href="/refund-policy" className="text-amber-400 underline text-[13px] hover:text-amber-300">
                  자세한 환불 정책 보기 →
                </Link>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-neutral-300">
                <span className="font-bold text-white">3영업일 이내 환불 처리</span>
                <br />
                <span className="text-[13px] text-neutral-500">전자상거래법 준수 (실제 카드 입금은 카드사 정책에 따라 추가 3-5일)</span>
              </p>
            </div>
          </div>
        </div>

        {/* 다국어 안내 */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300 leading-relaxed text-center">
          <p className="font-bold mb-2">🌐 Multilingual Refund Policy</p>
          <p>
            <Link href="/en/refund-policy" className="underline hover:text-amber-200">English</Link>
            {" · "}
            <Link href="/zh/refund-policy" className="underline hover:text-amber-200">中文</Link>
            {" · "}
            <Link href="/ja/refund-policy" className="underline hover:text-amber-200">日本語</Link>
          </p>
        </div>

        {/* 출시 안내 */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-center text-[13px] text-neutral-500">
          외국인 결제 시스템은 현재 결제대행사 심사 진행 중이며, 곧 출시 예정입니다.
        </div>
      </div>
    </div>
  );
}
