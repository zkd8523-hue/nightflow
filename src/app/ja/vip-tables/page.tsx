import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "ソウルVIPルーム予約 — 韓国クラブボトルサービスガイド (2026)" },
  description: "ソウルのトップクラブVIPルーム予約 — 江南・弘大・梨泰院・狎鴎亭。本物の価格、ボトルサービス、ブローカーなし、韓国語不要。韓国人と同じ予約方法。",
  keywords: ["ソウルVIPルーム","ソウルVIP予約","ソウルボトルサービス","ソウルVIPクラブ","韓国VIPルーム","韓国VIP予約","韓国ボトルサービス","韓国VIPクラブ","江南VIPルーム","江南VIP予約","江南ボトルサービス","江南VIPクラブ","狎鴎亭VIP","狎鴎亭ラウンジ","清潭VIP","清潭ラウンジ","韓国クラブテーブル","ソウルクラブテーブル","ソウルナイトクラブVIP"],
  alternates: { canonical: "https://nightflow.kr/ja/vip-tables" },
  openGraph: { title: "ソウルVIPルーム予約 — 韓国クラブボトルサービスガイド", description: "韓国語不要でソウルのトップクラブを予約。本物の価格、ブローカーなし。", url: "https://nightflow.kr/ja/vip-tables", locale: "ja_JP", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

const TIERS = [
  { name: "弘大ウォークインフレンドリー", price: "₩300,000–600,000", perPerson: "一人 ₩50,000–100,000 (6人)", desc: "小規模クラブ、ヒップホップ/K-POPフォーカス、厳格なドアポリシーなし。Club Dokkaebi、Sabotage、Purple。" },
  { name: "江南メインVIP", price: "₩750,000–1,500,000", perPerson: "一人 ₩150,000–300,000 (4–6人)", desc: "EDMメガクラブ、プライムテーブル、フルボトルサービス。Club ACE、Massive、Club Pop。" },
  { name: "狎鴎亭プレミアムラウンジ", price: "₩2,000,000+", perPerson: "一人 ₩400,000+ (4–6人)", desc: "高級ラウンジ、シャンパン文化、独占的な客層。Core Lounge、Club Arzu、DM Seoul。" },
];

export default function JaVipTablesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Service", name: "ソウルVIPルーム予約", provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/ja" }, areaServed: { "@type": "City", name: "ソウル" }, description: "ソウルのトップクラブVIPルームとボトルサービスを予約、江南・弘大・梨泰院・狎鴎亭。日本語フレンドリー、ブローカーなし、韓国本物の価格。", serviceType: "VIP Table Reservation", offers: TIERS.map((t) => ({ "@type": "Offer", name: t.name, description: t.desc, priceRange: t.price })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" }, { "@type": "ListItem", position: 2, name: "VIPルーム", item: "https://nightflow.kr/ja/vip-tables" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-neutral-500 hover:text-white">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウルVIPルーム予約</h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">ソウルのトップクラブでVIPルームとボトルサービスを予約 — 江南・弘大・梨泰院・狎鴎亭。ブローカーなし、韓国語不要、観光客税なし。</p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">ソウルVIPルームのレベル</h2>
          <div className="space-y-3">
            {TIERS.map((t) => (
              <div key={t.name} className="p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800 space-y-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="font-bold text-[15px] text-neutral-100">{t.name}</p>
                  <p className="font-black text-[14px] text-amber-400 whitespace-nowrap">{t.price}</p>
                </div>
                <p className="text-[12px] text-neutral-500">{t.perPerson}</p>
                <p className="text-[13px] text-neutral-400 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">VIP予約の流れ</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">旗を立てて、日付・人数・予算を入力。ソウルのトップクラブがプライベートVIPオファーを送信 — 本物の価格、本物のボトルセット。選んで到着、直接入場。</p>
          <Link href="/ja" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors">🚩 旗を立てる — VIPオファー獲得</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">エリア別</h2>
          <ul className="space-y-2 text-[13px] text-neutral-400">
            <li><Link className="hover:text-white" href="/ja/clubs/gangnam">江南VIPルーム →</Link></li>
            <li><Link className="hover:text-white" href="/ja/clubs/apgujeong">狎鴎亭 &amp; 清潭VIPラウンジ →</Link></li>
            <li><Link className="hover:text-white" href="/ja/clubs/hongdae">弘大VIP &amp; ウォークインルーム →</Link></li>
            <li><Link className="hover:text-white" href="/ja/clubs/itaewon">梨泰院国際クラブ →</Link></li>
          </ul>
        </section>
        <section className="text-center pt-4"><Link href="/ja/faq" className="text-[12px] text-blue-400 hover:underline">FAQを見る →</Link></section>
      </div>
    </div>
  );
}
