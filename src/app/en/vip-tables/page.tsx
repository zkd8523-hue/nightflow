import type { Metadata } from "next";

// 메뉴 가격이 바뀌면 1시간 내 반영. ⚠️ 컴포넌트 파일이 아니라 여기(route segment)에 있어야 동작한다.
export const revalidate = 3600;
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd, realTablePricesFaqs } from "@/components/foreign/RealTablePrices";

export const metadata: Metadata = {
  title: {
    absolute:
      "Seoul Club Table Prices 2026 — Real Menus from 23 Clubs (from ₩500,000)",
  },
  description:
    "What a Seoul club table actually costs: minimum spend ₩500,000 in Itaewon and Hongdae, ₩1,000,000 in Gangnam, filled from each club's own menu. Real set prices and what's in them. No broker fee.",
  keywords: [
    // Seoul + VIP
    "Seoul VIP table",
    "Seoul VIP booking",
    "Seoul bottle service",
    "Seoul VIP table booking",
    "Seoul VIP club",
    // Korea + VIP
    "Korea VIP table",
    "Korea VIP booking",
    "Korea bottle service",
    "Korean VIP table",
    "Korean bottle service",
    "Korean VIP club",
    // Gangnam + VIP (검색량 큼)
    "Gangnam VIP table",
    "Gangnam VIP booking",
    "Gangnam bottle service",
    "Gangnam VIP club",
    // Apgujeong + VIP
    "Apgujeong VIP",
    "Apgujeong VIP lounge",
    "Cheongdam VIP",
    "Cheongdam VIP lounge",
    // 일반
    "Korea club table",
    "Seoul club table",
    "Seoul nightclub VIP",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/vip-tables",
    languages: {
        "en-US": "https://nightflow.kr/en/vip-tables",
        "zh-CN": "https://nightflow.kr/zh/vip-tables",
        "zh-TW": "https://nightflow.kr/zh-tw/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: {
    title: "Seoul Club Table Prices 2026 — Real Menus from 23 Clubs (from ₩500,000)",
    description:
      "What a Seoul club table actually costs: minimum spend ₩500,000 in Itaewon and Hongdae, ₩1,000,000 in Gangnam, filled from each club's own menu. Real set prices and what's in them. No broker fee.",
    url: "https://nightflow.kr/en/vip-tables",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=Seoul+VIP+Table+Booking&sub=Korea+Club+Bottle+Service+%E2%80%94+Real+Prices%2C+No+Broker&lang=en", width: 1200, height: 630 }],
  },
};


export default async function EnVipTablesPage() {
  // 실가격 표(2026-09-10) — 정적 TIERS는 범위만 있어 AI·검색이 인용하지 않았다.
  const priceRows = await fetchRealTablePrices("en");
  const priceLd = realTablePricesJsonLd(priceRows, "en", "https://nightflow.kr/en/vip-tables");
  const priceFaqs = realTablePricesFaqs(priceRows, "en");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/en/vip-tables/#service",
        name: "Seoul VIP Table Booking",
        provider: {
          "@type": "Organization",
          name: "NightFlow",
          url: "https://nightflow.kr/en",
        },
        areaServed: { "@type": "City", name: "Seoul" },
        description:
          "Book VIP tables and bottle service at top Seoul clubs in Gangnam, Hongdae, Itaewon, Apgujeong. English-friendly, no broker, real Korean prices.",
        serviceType: "VIP Table Reservation"
      },
      ...(priceLd ? [priceLd] : []),
      ...(priceFaqs.length
        ? [{
            "@type": "FAQPage",
            mainEntity: priceFaqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }]
        : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
          { "@type": "ListItem", position: 2, name: "VIP Tables", item: "https://nightflow.kr/en/vip-tables" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "vip-tables" }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">Seoul Club Table Prices</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            The real way to book VIP tables and bottle service at Seoul&apos;s
            top clubs — Gangnam, Hongdae, Itaewon, Apgujeong. No broker, no
            Korean needed, no tourist tax.
          </p>
        </header>

        {/* 실제 세트 가격 — 위 티어(범위)와 달리 클럽별 실데이터. AI·검색이 인용할 사실. */}
        <RealTablePrices lang="en" rows={priceRows} />

        {priceFaqs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black">Seoul club table price — common questions</h2>
            {priceFaqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-[14px] font-bold text-foreground">{f.q}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">How VIP Booking Works</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Pick your club (or just tell us your budget and vibe) — date,
            group size, budget. We contact the club directly and lock in the
            best table for your budget — real prices, real bottle packages.
            Show up, walk straight in.
          </p>
          <Link
            data-nf-track="book_cta" href="/flags/new?lang=en"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 Book Korean Clubs
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">Browse by District</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/en/clubs/gangnam">Gangnam VIP tables →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/apgujeong">Apgujeong &amp; Cheongdam VIP lounges →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/hongdae">Hongdae VIP &amp; walk-in tables →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/itaewon">Itaewon international clubs →</Link></li>
          </ul>
        </section>

        <section className="text-center pt-4">
          <Link href="/en/faq" className="text-[12px] text-blue-400 hover:underline">
            See FAQ for prices, dress codes, broker problems →
          </Link>
        </section>
      </div>
    </div>
  );
}
