import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "服務條款 — NightFlow 首爾" },
  description: "NightFlow 服務條款繁體中文摘要。完整條款以韓文版本為準。",
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/terms",
    languages: {
      "ko-KR": "https://nightflow.kr/terms",
      "en-US": "https://nightflow.kr/en/terms",
      "zh-CN": "https://nightflow.kr/zh/terms",
      "zh-TW": "https://nightflow.kr/zh-tw/terms",
      "zh-Hant": "https://nightflow.kr/zh-tw/terms",
      "zh-HK": "https://nightflow.kr/zh-tw/terms",
    },
  },
};

export default function ZhTwTermsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh-tw" className="text-[14px] text-neutral-500 hover:text-white">← 返回</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            服務條款（摘要）
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300">
          <p className="font-bold mb-2">完整韓文版本</p>
          <p>具有法律效力的完整條款為韓文版:<Link href="/terms" className="underline">nightflow.kr/terms</Link></p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6 text-neutral-300 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 服務說明</h2>
            <p>NightFlow(營運公司:MadDawid,韓國)是首爾夜店預訂中介平台。我們將國際旅客與韓國夜店管理者(MD)連接,提供包廂與 VIP 桌預訂服務。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. 使用資格</h2>
            <p>用戶必須年滿 19 歲(韓國法定飲酒年齡)。註冊即視為確認符合此要求。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 外國用戶付款(Escrow)</h2>
            <p>外國用戶(en/zh/ja 語言版本)透過認證支付服務商(如 Eximbay)進行預付款。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>付款款項由 NightFlow 託管,待用戶到場確認後釋放</li>
              <li>NightFlow 平台費:交易金額的 9%</li>
              <li>剩餘金額於到場確認後結算給 MD</li>
              <li>退款政策:活動前 48 小時 100%、24-48 小時 50%、24 小時內或未到場 0%</li>
              <li>詳見 <Link href="/zh-tw/refund-policy" className="text-amber-400 underline">退款政策</Link></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. 用戶責任</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>提供正確的個人資訊</li>
              <li>依約定時間到達夜店</li>
              <li>遵守夜店規定與韓國法律</li>
              <li>現場費用(額外酒水、餐點等)直接向夜店支付</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 爭議解決</h2>
            <p>爭議首先由 NightFlow 客服處理,未解決之爭議依據韓國法律,可提交至韓國消費者院或電子商務爭議調解委員會。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 適用法律</h2>
            <p>本服務由韓國營運,適用韓國法律。</p>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本繁體中文版本為摘要。法律效力以韓文版本為準。自 2026 年 6 月 30 日起施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
