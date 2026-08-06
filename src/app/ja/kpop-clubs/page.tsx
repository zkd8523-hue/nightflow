import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "ソウルのK-POPクラブ — K-POPライブが聴ける場所 (日本人旅行者ガイド 2026)" },
  description: "ソウルのベストK-POPクラブとナイトライフガイド、日本人K-POPファン向け。弘大NB2、K-POPダンスパーティー、アイドル名曲を一晩中。本物の価格、ブローカーなし、日本語フレンドリー。",
  keywords: ["K-POPクラブ","ソウルK-POPクラブ","K-POPナイトクラブ","ソウルK-POPナイトライフ","韓国K-POPクラブ","韓国K-POPナイトライフ","弘大K-POPクラブ","NB2 ソウル","NB2 弘大","K-POPバー","K-POPダンスクラブ","ソウルアイドルクラブ","BTSクラブソウル","K-POPファンクラブ","K-POP旅行ソウル"],
  alternates: {
    canonical: "https://nightflow.kr/ja/kpop-clubs",
    languages: {
        "en-US": "https://nightflow.kr/en/kpop-clubs",
        "zh-CN": "https://nightflow.kr/zh/kpop-clubs",
        "zh-TW": "https://nightflow.kr/zh/kpop-clubs",
        "ja-JP": "https://nightflow.kr/ja/kpop-clubs",
        "x-default": "https://nightflow.kr/en/kpop-clubs",
    },
  },
  openGraph: { title: "ソウルのK-POPクラブ — 日本人旅行者ガイド", description: "ソウルのベストK-POPナイトクラブ。本物の価格、日本語フレンドリー。K-POPファンが実際に行く場所。", url: "https://nightflow.kr/ja/kpop-clubs", locale: "ja_JP", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

const KPOP_VENUES = [
  { name: "NB2 (Noise Basement 2)", district: "弘大", vibe: "象徴的なK-POPナイトクラブ。YG所有、ヒップホップ+K-POPの名曲を一晩中。ソウル最高の国際観光客集中度。", bestFor: "初めての韓国旅行のK-POPファン" },
  { name: "Club Purple", district: "弘大", vibe: "ヒップホップ中心だが、K-POPドロップも頻繁。初心者フレンドリー、厳格なドアポリシーなし。", bestFor: "ヒップホップ + K-POPカジュアル夜" },
  { name: "Club ACE", district: "江南", vibe: "大型EDMクラブで、混雑する夜にはK-POPフロアあり。洗練された客層、ドレスコードあり。", bestFor: "EDM + K-POP組み合わせ夜" },
  { name: "Club Dokkaebi", district: "弘大", vibe: "ヒップホップフォーカスだが、K-POPヒットを定期的に。プレミアム制作、活気ある客層。", bestFor: "ヒップホップも好きなK-POPファン" },
];

export default function JaKpopClubsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ItemList", name: "ソウルK-POPクラブ", numberOfItems: KPOP_VENUES.length, itemListElement: KPOP_VENUES.map((v, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "NightClub", name: v.name, address: { "@type": "PostalAddress", addressLocality: v.district, addressCountry: "KR" } } })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" }, { "@type": "ListItem", position: 2, name: "K-POPクラブ", item: "https://nightflow.kr/ja/kpop-clubs" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウルのK-POPクラブ</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">K-POPファンが実際にソウルで行く場所。アイドルヒットを一晩中流すナイトクラブの正直なガイド — 弘大、江南、本物の価格、日本語フレンドリーな場所。</p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">ソウルトップK-POPクラブ</h2>
          <div className="space-y-3">
            {KPOP_VENUES.map((v) => (
              <div key={v.name} className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-[15px] text-foreground">{v.name}</p>
                  <p className="text-[12px] text-muted-foreground">{v.district}</p>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{v.vibe}</p>
                <p className="text-[12px] text-brand-amber">最適: {v.bestFor}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">K-POP観光客向け予約のヒント</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">ほとんどのK-POP観光客は弘大NB2に直行。可能ですが、週末は90分待ちもあります。入場保証とテーブル予約を希望する場合、NightFlowで予約すれば弘大K-POPクラブに直接連絡し、日本語で席を確保します。</p>
          <Link href="/flags/new?lang=ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">🍾 NightFlowで予約する</Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">関連ガイド</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/ja/clubs/hongdae">弘大クラブ — 完全ガイド →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/clubs/gangnam">江南クラブ — 完全ガイド →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/vip-tables">ソウルVIPルーム予約 →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/faq">ソウルクラブ FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
