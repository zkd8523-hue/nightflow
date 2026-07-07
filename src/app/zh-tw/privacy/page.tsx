import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "隱私政策 — NightFlow 首爾" },
  description: "NightFlow 隱私政策繁體中文摘要。完整政策以韓文版本為準。",
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/privacy",
    languages: {
      "ko-KR": "https://nightflow.kr/privacy",
      "en-US": "https://nightflow.kr/en/privacy",
      "zh-CN": "https://nightflow.kr/zh/privacy",
      "zh-TW": "https://nightflow.kr/zh-tw/privacy",
      "zh-Hant": "https://nightflow.kr/zh-tw/privacy",
      "zh-HK": "https://nightflow.kr/zh-tw/privacy",
    },
  },
};

export default function ZhTwPrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh-tw" className="text-[14px] text-neutral-500 hover:text-white">← 返回</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            隱私政策(摘要)
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300">
          <p className="font-bold mb-2">完整韓文版本</p>
          <p><Link href="/privacy" className="underline">nightflow.kr/privacy</Link></p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6 text-neutral-300 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 收集的資料</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>帳戶資訊:姓名、電子郵件、電話(透過 Kakao/Google OAuth)</li>
              <li>個人資料:暱稱、頭像</li>
              <li>交易資料:預訂、付款、退款</li>
              <li>與 MD 及客服的通訊紀錄</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. 付款資料(重要)</h2>
            <p>NightFlow 不直接儲存您的信用卡資訊。所有付款資料由符合 PCI DSS 標準的支付處理商管理:</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Eximbay(韓國認證 PG)</li>
              <li>VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>WeChat Pay、Alipay+、PayPal</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 資料用途</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>帳戶管理與身分驗證</li>
              <li>與韓國夜店管理者(MD)配對</li>
              <li>付款處理與結算</li>
              <li>客戶支援與爭議解決</li>
              <li>服務改善與分析</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. 資料共享</h2>
            <p>我們僅在下列情況共享資料:</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>配對的夜店 MD(僅限預訂細節)</li>
              <li>支付處理商(Eximbay 等)</li>
              <li>韓國稅務機關(法律要求時)</li>
            </ul>
            <p className="text-[13px] text-neutral-500 mt-2">我們不會向第三方出售您的個人資料。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 資料保留</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>帳戶資料:帳戶刪除後保留 30 天恢復期</li>
              <li>交易紀錄:5 年(韓國稅法)</li>
              <li>通訊紀錄:3 年</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 您的權利</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>存取您的個人資料</li>
              <li>更正不正確的資料</li>
              <li>請求刪除帳戶</li>
              <li>撤回行銷同意</li>
              <li>資料可攜性</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">7. 聯絡</h2>
            <p>隱私相關問題:<a href="mailto:maddawids@gmail.com" className="text-amber-400 underline">maddawids@gmail.com</a></p>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本繁體中文版本為摘要。法律效力以韓文版本為準。自 2026 年 6 月 30 日起施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
