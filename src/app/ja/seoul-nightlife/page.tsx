import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "ソウルナイトライフガイド 2026 — どこへ行く、何を予約 (日本人旅行者版)" },
  description: "日本人旅行者向け完全ソウルナイトライフガイド。江南EDM、弘大ヒップホップ、梨泰院国際的、狎鴎亭VIPラウンジ。本物の価格、ブローカーなし、韓国語不要。",
  keywords: ["ソウルナイトライフ","ソウルナイトライフガイド","韓国ナイトライフ","韓国ナイトライフガイド","ソウル夜遊び","ソウルパーティー","ソウル夜","ソウル夜遊びガイド","ソウル夜遊びおすすめ","江南ナイトライフ","弘大ナイトライフ","梨泰院ナイトライフ","狎鴎亭ナイトライフ","ソウルバーとクラブ","韓国旅行ナイトライフ"],
  alternates: {
    canonical: "https://nightflow.kr/ja/seoul-nightlife",
    languages: {
        "en-US": "https://nightflow.kr/en/seoul-nightlife",
        "zh-CN": "https://nightflow.kr/zh/seoul-nightlife",
        "zh-TW": "https://nightflow.kr/zh/seoul-nightlife",
        "ja-JP": "https://nightflow.kr/ja/seoul-nightlife",
        "x-default": "https://nightflow.kr/en/seoul-nightlife",
    },
  },
  openGraph: { title: "ソウルナイトライフガイド 2026 — どこへ行く、何を予約", description: "日本人旅行者向け正直なガイド。江南、弘大、梨泰院、狎鴎亭。本物の価格、ブローカーなし。", url: "https://nightflow.kr/ja/seoul-nightlife", locale: "ja_JP", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

export default function JaSeoulNightlifePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: "ソウルナイトライフガイド 2026 — どこへ行く、何を予約", description: "日本人旅行者向け完全ソウルナイトライフガイド。", image: ["https://nightflow.kr/og-image.png"], datePublished: "2026-01-01T00:00:00+09:00", author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/ja" }, publisher: { "@type": "Organization", name: "NightFlow", logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" } }, mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/ja/seoul-nightlife" }, inLanguage: "ja-JP" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" }, { "@type": "ListItem", position: 2, name: "ソウルナイトライフ", item: "https://nightflow.kr/ja/seoul-nightlife" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウルナイトライフガイド</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">日本人旅行者がどこへ行き、何を予約し、ソウルナイトライフを本当に楽しむ方法。ブローカー手数料なし、韓国語不要。</p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">エリア別ソウルナイトライフ</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">ソウルナイトライフは一つではない — 4つのエリアで4つの異なる雰囲気・客層・価格があります。</p>
          <div className="space-y-3">
            {[
              { name: "江南", vibe: "高級EDM、洗練された客層、VIPルーム文化、₩750K+ルーム", link: "/ja/clubs/gangnam" },
              { name: "弘大", vibe: "ヒップホップ&K-POP、外国人フレンドリー、ウォークインOK、入場料₩10–30K", link: "/ja/clubs/hongdae" },
              { name: "梨泰院", vibe: "国際的、英語フレンドリー、ハウスと電子音楽", link: "/ja/clubs/itaewon" },
              { name: "狎鴎亭 & 清潭", vibe: "高級VIPラウンジ、シャンパンサービス、₩2M+ルーム", link: "/ja/clubs/apgujeong" },
            ].map((d) => (
              <Link key={d.name} href={d.link} className="block p-5 rounded-2xl bg-card border border-border hover:border-border transition-colors">
                <p className="font-bold text-[15px] text-foreground mb-1">{d.name}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{d.vibe}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">ソウルの夜の費用</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• ウォークインカジュアル: 一人 ₩30,000–80,000</li>
            <li>• 弘大VIPルーム (6人): 一人 ₩50,000–100,000</li>
            <li>• 江南メインVIP (4–6人): 一人 ₩150,000–300,000</li>
            <li>• 狎鴎亭プレミアムラウンジ: 一人 ₩400,000+</li>
          </ul>
          <Link href="/ja/vip-tables" className="text-[12px] text-blue-400 hover:underline">VIPルーム価格詳細 →</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">韓国語不要で予約する方法</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">行きたいソウルクラブを選んでください、または雰囲気だけ伝えてください — 日付・人数・予算と一緒に。NightFlowが直接クラブに連絡し、予算内で一番良い席を確保します。到着後、直接入場。</p>
          <Link href="/ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">🍾 NightFlowで予約する</Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">関連ガイド</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/ja/vip-tables">ソウルVIPルーム予約 →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/guests">ソウルクラブ ゲストリスト →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/kpop-clubs">ソウルK-POPクラブ →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/faq">ソウルクラブ FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
