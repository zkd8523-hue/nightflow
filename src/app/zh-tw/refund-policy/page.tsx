import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: { absolute: "退款與取消政策 — NightFlow 首爾" },
  description: "NightFlow 外國用戶退款政策。活動前 48 小時取消 100% 退款;24-48 小時 50%;24 小時內或未到場不退款。",
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/refund-policy",
    languages: {
      "ko-KR": "https://nightflow.kr/refund-policy",
      "en-US": "https://nightflow.kr/en/refund-policy",
      "zh-CN": "https://nightflow.kr/zh/refund-policy",
      "zh-TW": "https://nightflow.kr/zh-tw/refund-policy",
      "zh-Hant": "https://nightflow.kr/zh-tw/refund-policy",
      "zh-HK": "https://nightflow.kr/zh-tw/refund-policy",
      "ja-JP": "https://nightflow.kr/ja/refund-policy",
    },
  },
};

export default function ZhTwRefundPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh-tw" className="text-[14px] text-neutral-500 hover:text-white">← 返回</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            退款與取消政策
          </h1>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-8 text-neutral-300 text-[15px] leading-relaxed font-medium">

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 適用範圍</h2>
            <p>本政策適用於外國用戶透過 NightFlow 平台進行的所有預付款交易。韓國國內用戶直接與夜店 MD 交易,不適用本退款政策。</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-black text-white">2. 退款時間表</h2>
            <p>外國用戶預訂的退款依據距離<span className="text-white font-bold">活動時間</span>剩餘時間計算。</p>

            <div className="space-y-3 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-green-300">活動前 48 小時以上取消</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">100% 退款</span>(PG 手續費由 NightFlow 承擔)</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-amber-300">活動前 24-48 小時取消</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">50% 退款</span></p>
                </div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-300">活動前 24 小時內或未到場</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">不予退款 (0%)</span></p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 退款流程</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>透過帳戶或客服申請取消</li>
              <li>系統依據時間自動計算退款比例</li>
              <li>NightFlow 於 <span className="text-white font-bold">3 個工作日內</span>處理已核准的退款(依據韓國《電子商務消費者保護法》第 18 條)</li>
              <li>退款將退回至原付款方式</li>
              <li>實際入帳時間因銀行政策可能額外需要 3-5 個工作日</li>
              <li>WeChat Pay、Alipay+ 退款因國際支付網路政策,可能額外需要 7-14 天,用戶於付款時已知悉</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. 夜店方取消</h2>
            <p>若因夜店方面原因取消預訂,用戶可獲得<span className="text-white font-bold">100% 退款</span>。相關 MD 可能依據公司政策承擔違約責任。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 付款處理</h2>
            <p>所有外國用戶付款均透過認證的支付服務商處理。NightFlow 不直接儲存您的卡片資訊,所有資料由符合 PCI DSS 標準的支付處理商安全管理。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px] mt-2">
              <li>信用卡:VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>行動支付:WeChat Pay、Alipay+、PayPal</li>
              <li>支援幣別:KRW、USD、JPY、TWD、HKD 等</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 爭議解決</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>聯絡客服 {BUSINESS_INFO.email}</li>
              <li>NightFlow 將於 7 個工作日內審核並回覆</li>
              <li>未解決之爭議將透過韓國消費者院或電子商務爭議調解委員會處理</li>
            </ol>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <h2 className="text-lg font-black text-white">公司資訊</h2>
            <div className="text-[13px] text-neutral-400 space-y-1">
              <p>公司:{BUSINESS_INFO.companyName} (MadDawid)</p>
              <p>法人代表:{BUSINESS_INFO.ceo}</p>
              <p>營業執照號:{BUSINESS_INFO.businessNumber}</p>
              <p>電子商務備案號:{BUSINESS_INFO.mailOrderSalesNumber}</p>
              <p>地址:{BUSINESS_INFO.address}</p>
              <p>客服電話:{BUSINESS_INFO.tel}</p>
              <p>信箱:{BUSINESS_INFO.email}</p>
            </div>
          </section>

          <section className="space-y-2 pt-4 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本政策自 2026 年 6 月 30 日起生效。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
