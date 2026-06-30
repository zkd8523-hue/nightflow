import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: { absolute: "返金・キャンセルポリシー — NightFlow ソウル" },
  description: "NightFlow 外国人ユーザー向け返金ポリシー。イベント48時間前まで100%返金、24-48時間50%、24時間以内またはノーショー0%。",
  alternates: {
    canonical: "https://nightflow.kr/ja/refund-policy",
    languages: {
      "ko-KR": "https://nightflow.kr/refund-policy",
      "en-US": "https://nightflow.kr/en/refund-policy",
      "zh-CN": "https://nightflow.kr/zh/refund-policy",
      "ja-JP": "https://nightflow.kr/ja/refund-policy",
    },
  },
};

export default function JaRefundPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ja" className="text-[14px] text-neutral-500 hover:text-white">← 戻る</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            返金・キャンセルポリシー
          </h1>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-8 text-neutral-300 text-[15px] leading-relaxed font-medium">

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 適用範囲</h2>
            <p>本ポリシーは外国人ユーザーが NightFlow プラットフォームを通じて行う全ての前払い取引に適用されます。韓国国内ユーザーは別途直接取引となるため、本返金ポリシーは適用されません。</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-black text-white">2. 返金スケジュール</h2>
            <p>外国人ユーザーの予約返金は<span className="text-white font-bold">イベント時間</span>までの残り時間に基づいて計算されます。</p>

            <div className="space-y-3 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-green-300">イベント48時間以上前のキャンセル</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">100% 返金</span>（PG 手数料は NightFlow が負担）</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-amber-300">イベント24-48時間前のキャンセル</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">50% 返金</span></p>
                </div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-300">イベント24時間以内またはノーショー</p>
                  <p className="text-[13px] text-neutral-400 mt-1"><span className="text-white font-bold">返金不可 (0%)</span></p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 返金プロセス</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>マイページまたはカスタマーサポートからキャンセル申請</li>
              <li>システムが時間に基づいて自動的に返金率を計算</li>
              <li>NightFlow は承認された返金を <span className="text-white font-bold">3 営業日以内</span>に処理します（韓国「電子商取引等における消費者保護法」第18条準拠）</li>
              <li>承認された返金は元の支払い方法へ返金</li>
              <li>カード口座への実際の反映は、カード会社のポリシーにより追加で 3-5 営業日かかる場合があります</li>
              <li>WeChat Pay、Alipay+ の返金は国際決済ネットワークのポリシー上、追加で 7-14 日かかる場合があり、お客様は決済時にこれに同意したものとみなされます</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. クラブ側のキャンセル</h2>
            <p>クラブ側の理由で予約が取り消された場合、ユーザーは<span className="text-white font-bold">100%返金</span>を受け取ります。該当MDには会社の方針に従ってペナルティが課される場合があります。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 決済処理</h2>
            <p>外国人ユーザーの全ての決済は認定決済代行業者を通じて処理されます。NightFlow はカード情報を直接保存せず、全ての決済データは PCI DSS 準拠の決済代行業者によって安全に管理されます。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px] mt-2">
              <li>クレジットカード：VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>モバイル決済：WeChat Pay、Alipay+、PayPal</li>
              <li>対応通貨：KRW、USD、JPY、TWD、HKD など</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 紛争解決</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>カスタマーサポートへの連絡：{BUSINESS_INFO.email}</li>
              <li>NightFlow が 7 営業日以内に審査・回答</li>
              <li>未解決の紛争は韓国消費者院または電子商取引紛争調停委員会を通じて処理</li>
            </ol>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <h2 className="text-lg font-black text-white">事業者情報</h2>
            <div className="text-[13px] text-neutral-400 space-y-1">
              <p>商号：{BUSINESS_INFO.companyName} (MadDawid)</p>
              <p>代表者：{BUSINESS_INFO.ceo}</p>
              <p>事業者登録番号：{BUSINESS_INFO.businessNumber}</p>
              <p>通信販売業申告番号：{BUSINESS_INFO.mailOrderSalesNumber}</p>
              <p>住所：{BUSINESS_INFO.address}</p>
              <p>カスタマーサポート：{BUSINESS_INFO.tel}</p>
              <p>メール：{BUSINESS_INFO.email}</p>
            </div>
          </section>

          <section className="space-y-2 pt-4 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本ポリシーは 2026年6月30日 から施行されます。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
