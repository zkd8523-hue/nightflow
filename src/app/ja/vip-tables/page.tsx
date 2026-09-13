import type { Metadata } from "next";

// 메뉴 가격이 바뀌면 1시간 내 반영. ⚠️ 컴포넌트 파일이 아니라 여기(route segment)에 있어야 동작한다.
export const revalidate = 3600;
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd, realTablePricesFaqs } from "@/components/foreign/RealTablePrices";
import { MarketFaq, marketFaqs } from "@/components/foreign/MarketFaq";

export const metadata: Metadata = {
  title: { absolute: "ソウル クラブ テーブル料金 2026 — 実メニュー23軒（50万ウォン〜）" },
  description: "ソウルのクラブでテーブルは実際いくらか：最低金額は梨泰院・弘大50万ウォン、江南100万ウォン。各クラブの実際のメニューから選んで埋めます。セット実価格と内容つき、仲介手数料なし。",
  keywords: ["ソウルVIPルーム","ソウルVIP予約","ソウルボトルサービス","ソウルVIPクラブ","韓国VIPルーム","韓国VIP予約","韓国ボトルサービス","韓国VIPクラブ","江南VIPルーム","江南VIP予約","江南ボトルサービス","江南VIPクラブ","狎鴎亭VIP","狎鴎亭ラウンジ","清潭VIP","清潭ラウンジ","韓国クラブテーブル","ソウルクラブテーブル","ソウルナイトクラブVIP"],
  alternates: {
    canonical: "https://nightflow.kr/ja/vip-tables",
    languages: {
        "en-US": "https://nightflow.kr/en/vip-tables",
        "zh-CN": "https://nightflow.kr/zh/vip-tables",
        "zh-TW": "https://nightflow.kr/zh-tw/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: { title: "ソウルVIPルーム予約 — 韓国クラブボトルサービスガイド", description: "ソウルのクラブでテーブルは実際いくらか：最低金額は梨泰院・弘大50万ウォン、江南100万ウォン。各クラブの実際のメニューから選んで埋めます。セット実価格と内容つき、仲介手数料なし。", url: "https://nightflow.kr/ja/vip-tables", locale: "ja_JP", type: "website", images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }] },
};


export default async function JaVipTablesPage() {
  // 실가격 표(2026-09-10) — 정적 TIERS는 범위만 있어 AI·검색이 인용하지 않았다.
  const priceRows = await fetchRealTablePrices("ja");
  const priceLd = realTablePricesJsonLd(priceRows, "ja", "https://nightflow.kr/ja/vip-tables");
  const priceFaqs = realTablePricesFaqs(priceRows, "ja");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Service", name: "ソウルVIPルーム予約", provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/ja" }, areaServed: { "@type": "City", name: "ソウル" }, description: "ソウルのトップクラブVIPルームとボトルサービスを予約、江南・弘大・梨泰院・狎鴎亭。日本語フレンドリー、ブローカーなし、韓国本物の価格。", serviceType: "VIP Table Reservation" },
      ...(priceLd ? [priceLd] : []),
      ...(priceFaqs.length
        ? [{
            "@type": "FAQPage",
            mainEntity: [...priceFaqs, ...marketFaqs("ja", null, null)].map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }]
        : []),
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" }, { "@type": "ListItem", position: 2, name: "VIPルーム", item: "https://nightflow.kr/ja/vip-tables" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="ja" meta={{ page: "vip-tables" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウル クラブ テーブル料金</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">ソウルのトップクラブでVIPルームとボトルサービスを予約 — 江南・弘大・梨泰院・狎鴎亭。ブローカーなし、韓国語不要、観光客税なし。</p>
        </header>

        {/* 실제 세트 가격 — 위 티어(범위)와 달리 클럽별 실데이터. AI·검색이 인용할 사실. */}
        <RealTablePrices lang="ja" rows={priceRows} />

        <MarketFaq lang="ja" />

        {priceFaqs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black">ソウルのクラブ テーブル料金 — よくある質問</h2>
            {priceFaqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-[14px] font-bold text-foreground">{f.q}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
              </div>
            ))}
          </section>
        )}
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">VIP予約の流れ</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">行きたいクラブを選ぶ（または雰囲気だけ伝える）— 日付・人数・予算と一緒に。NightFlowが直接クラブに連絡し、予算内で一番良い席を確保 — 本物の価格、本物のボトルサービス。到着して直接入場。</p>
          <Link data-nf-track="book_cta" href="/flags/new?lang=ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">🍾 NightFlowで予約する</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">エリア別</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/ja/clubs/gangnam">江南VIPルーム →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/clubs/apgujeong">狎鴎亭 &amp; 清潭VIPラウンジ →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/clubs/hongdae">弘大VIP &amp; ウォークインルーム →</Link></li>
            <li><Link className="hover:text-foreground" href="/ja/clubs/itaewon">梨泰院国際クラブ →</Link></li>
          </ul>
        </section>
        <section className="text-center pt-4"><Link href="/ja/faq" className="text-[12px] text-blue-400 hover:underline">FAQを見る →</Link></section>
      </div>
    </div>
  );
}
