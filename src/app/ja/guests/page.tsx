import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "ソウルクラブ ゲストリスト — 韓国クラブ無料入場 (韓国語不要)" },
  description: "ソウルのトップクラブにゲストリストで無料入場 — 江南・弘大・梨泰院。入場料をスキップ。本物のクラブMDからの週次ゲストディール。ブローカーなし、韓国語不要。",
  keywords: ["ソウルクラブ ゲストリスト","ソウルクラブ 無料入場","ソウルナイトクラブ ゲストリスト","ソウルクラブ 入場料","韓国クラブ ゲストリスト","韓国クラブ 無料入場","江南クラブ ゲストリスト","弘大クラブ ゲストリスト","梨泰院クラブ ゲストリスト","ソウルクラブMD","韓国クラブプロモーター","ソウルクラブ割引"],
  alternates: {
    canonical: "https://nightflow.kr/ja/guests",
    languages: {
        "en-US": "https://nightflow.kr/en/guests",
        "zh-CN": "https://nightflow.kr/zh/guests",
        "zh-TW": "https://nightflow.kr/zh/guests",
        "ja-JP": "https://nightflow.kr/ja/guests",
        "x-default": "https://nightflow.kr/en/guests",
    },
  },
  openGraph: { title: "ソウルクラブ ゲストリスト — 韓国クラブ無料入場", description: "ソウルのトップクラブの入場料をスキップ。週次ゲストディール、韓国語不要。", url: "https://nightflow.kr/ja/guests", locale: "ja_JP", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};

export default function JaGuestsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Service", name: "ソウルクラブ ゲストリスト", provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/ja" }, areaServed: { "@type": "City", name: "ソウル" }, description: "本物のソウルクラブMDからの週次ゲストリストディール。江南・弘大・梨泰院クラブの無料または割引入場。日本語フレンドリー。", serviceType: "Club Guest List" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" }, { "@type": "ListItem", position: 2, name: "Guest List", item: "https://nightflow.kr/ja/guests" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウルクラブ ゲストリスト</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">ソウルのトップクラブの入場料をスキップ。本物のMDからの週次ゲストディール — 無料入場、割引入場、無料ドリンクチケット。韓国語不要、ブローカーなし。</p>
        </header>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">ソウルクラブ ゲストリストとは？</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">韓国クラブMD（プロモーター）が毎週ゲストリストを運営 — 特定時間まで無料または割引入場。地元民はこの方法で₩20,000–30,000の入場料を回避。難点：従来はInstagramかKakaoTalkで韓国MDに連絡が必要。</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">NightFlowなら江南・弘大・梨泰院クラブの週次ゲストディールを一箇所に集約 — 日本語インターフェース、各MDへのワンタップコピペメッセージ。</p>
        </section>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">獲得できるもの</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• 特定時間前の無料入場（通常深夜12時まで）</li>
            <li>• 無料時間後の入場料割引</li>
            <li>• 一部クラブで無料ドリンクチケット</li>
            <li>• 優先入場（通常列をスキップ）</li>
            <li>• 週次更新 — 毎週月曜新着</li>
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">ソウル ゲストリストの使い方</h2>
          <ol className="space-y-2 text-[13px] text-foreground/80 list-decimal pl-5">
            <li>NightFlowで週次ゲストディールを閲覧</li>
            <li>クラブを選ぶ — 江南、弘大、または梨泰院</li>
            <li>「メッセージコピー」をタップ — 事前作成された日本語/英語リクエスト</li>
            <li>MDのInstagram DMにペースト</li>
            <li>確認を受け取る — あなたの名前がリストに</li>
            <li>クラブに到着、入場</li>
          </ol>
        </section>
        <section className="text-center pt-4 space-y-3">
          <Link href="/ja/clubs" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">今週のゲストディールを見る →</Link>
          <Link href="/ja/faq" className="text-[12px] text-blue-400 hover:underline">FAQを見る →</Link>
        </section>
      </div>
    </div>
  );
}
