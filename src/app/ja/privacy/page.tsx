import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "プライバシーポリシー — NightFlow ソウル" },
  description: "NightFlow プライバシーポリシーの日本語要約。完全版は韓国語版が法的に有効です。",
  alternates: {
    canonical: "https://nightflow.kr/ja/privacy",
    languages: {
      "ko-KR": "https://nightflow.kr/privacy",
      "en-US": "https://nightflow.kr/en/privacy",
      "ja-JP": "https://nightflow.kr/ja/privacy",
    },
  },
};

export default function JaPrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ja" className="text-[14px] text-neutral-500 hover:text-white">← 戻る</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            プライバシーポリシー（要約）
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300">
          <p className="font-bold mb-2">完全な韓国語版</p>
          <p><Link href="/privacy" className="underline">nightflow.kr/privacy</Link></p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6 text-neutral-300 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 収集するデータ</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>アカウント情報：氏名、メール、電話（Kakao/Google OAuth経由）</li>
              <li>プロフィール情報：ニックネーム、プロフィール画像</li>
              <li>取引データ：予約、決済、返金</li>
              <li>MD・カスタマーサポートとの通信記録</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. 決済データ（重要）</h2>
            <p>NightFlow はクレジットカード情報を直接保存しません。全ての決済データは PCI DSS 準拠の決済処理業者によって管理されます：</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Eximbay（韓国認証 PG）</li>
              <li>VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>WeChat Pay、Alipay+、PayPal</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. データの利用目的</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>アカウント管理と認証</li>
              <li>韓国クラブマネージャー（MD）とのマッチング</li>
              <li>決済処理と精算</li>
              <li>カスタマーサポートと紛争解決</li>
              <li>サービス改善と分析</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. データの共有</h2>
            <p>以下の場合のみデータを共有します：</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>マッチしたクラブMD（予約詳細のみ）</li>
              <li>決済処理業者（Eximbay 等）</li>
              <li>韓国税務当局（法的に必要な場合）</li>
            </ul>
            <p className="text-[13px] text-neutral-500 mt-2">第三者に個人データを販売しません。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. データの保持期間</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>アカウントデータ：アカウント削除後30日復元期間</li>
              <li>取引記録：5年（韓国税法）</li>
              <li>通信記録：3年</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. お客様の権利</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>個人データへのアクセス</li>
              <li>不正確なデータの訂正</li>
              <li>アカウント削除の請求</li>
              <li>マーケティング同意の撤回</li>
              <li>データのポータビリティ</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">7. お問い合わせ</h2>
            <p>プライバシーに関するご質問：<a href="mailto:maddawids@gmail.com" className="text-amber-400 underline">maddawids@gmail.com</a></p>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本日本語版は要約です。法的効力は韓国語版が優先されます。2026年6月30日 から施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
