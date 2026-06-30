import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "利用規約 — NightFlow ソウル" },
  description: "NightFlow 利用規約の日本語要約。完全版は韓国語版が法的に有効です。",
  alternates: {
    canonical: "https://nightflow.kr/ja/terms",
    languages: {
      "ko-KR": "https://nightflow.kr/terms",
      "en-US": "https://nightflow.kr/en/terms",
      "ja-JP": "https://nightflow.kr/ja/terms",
    },
  },
};

export default function JaTermsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ja" className="text-[14px] text-neutral-500 hover:text-white">← 戻る</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            利用規約（要約）
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300">
          <p className="font-bold mb-2">完全な韓国語版</p>
          <p>法的拘束力のある完全版は韓国語版です：<Link href="/terms" className="underline">nightflow.kr/terms</Link></p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6 text-neutral-300 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. サービス概要</h2>
            <p>NightFlow（運営：MadDawid、韓国）はソウルのナイトクラブ予約仲介プラットフォームです。外国人訪問者と韓国のクラブマネージャー（MD）をつなぎ、テーブル・VIPルーム予約サービスを提供します。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. 利用資格</h2>
            <p>ユーザーは満19歳以上（韓国の法定飲酒年齢）である必要があります。登録時にこの要件を満たしていることを確認したものとみなされます。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 外国人ユーザー決済（Escrow）</h2>
            <p>外国人ユーザー（en/zh/ja 言語トラック）は認定決済代行業者（Eximbay 等）を通じて前払いします。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>支払い金額は訪問確認まで NightFlow が安全に保管</li>
              <li>NightFlow プラットフォーム手数料：取引金額の 9%</li>
              <li>残額は訪問確認後に MD に決済</li>
              <li>返金ポリシー：イベント48時間前 100%、24-48時間 50%、24時間以内またはノーショー 0%</li>
              <li>詳細は <Link href="/ja/refund-policy" className="text-amber-400 underline">返金ポリシー</Link></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. ユーザーの責任</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>正確な個人情報の提供</li>
              <li>合意された時間にクラブへの到着</li>
              <li>クラブの規定と韓国法令の遵守</li>
              <li>現地費用（追加飲料、食事等）はクラブに直接支払い</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 紛争解決</h2>
            <p>紛争はまず NightFlow カスタマーサポートで対応します。未解決の紛争は韓国法に従い、韓国消費者院または電子商取引紛争調停委員会への提出が可能です。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 準拠法</h2>
            <p>本サービスは韓国から運営されており、韓国法に準拠します。</p>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">本日本語版は要約です。法的効力は韓国語版が優先されます。2026年6月30日 から施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
