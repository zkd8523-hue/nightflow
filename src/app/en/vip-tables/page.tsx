import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "Seoul VIP Table Booking — Korea Club Bottle Service Guide (2026)",
  },
  description:
    "Book VIP tables at Seoul's top clubs in Gangnam, Hongdae, Itaewon, Apgujeong. Real prices, bottle service, no broker, no Korean needed. The actual way Koreans book VIP tables.",
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
        "zh-TW": "https://nightflow.kr/zh/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: {
    title: "Seoul VIP Table Booking — Korea Club Bottle Service Guide",
    description:
      "Book VIP tables at Seoul's top clubs without speaking Korean. Real prices, no broker.",
    url: "https://nightflow.kr/en/vip-tables",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=Seoul+VIP+Table+Booking&sub=Korea+Club+Bottle+Service+%E2%80%94+Real+Prices%2C+No+Broker&lang=en", width: 1200, height: 630 }],
  },
};

const TIERS = [
  {
    name: "Hongdae walk-in friendly",
    price: "₩300,000–600,000",
    perPerson: "₩50,000–100,000 (6 ppl)",
    desc: "Smaller clubs, hip-hop/K-pop focus, no strict door policy. Club Dokkaebi, Sabotage, Purple.",
  },
  {
    name: "Gangnam main VIP",
    price: "₩750,000–1,500,000",
    perPerson: "₩150,000–300,000 (4–6 ppl)",
    desc: "EDM mega-clubs, prime tables, full bottle service. Club ACE, Massive, Club Pop.",
  },
  {
    name: "Apgujeong premium lounge",
    price: "₩2,000,000+",
    perPerson: "₩400,000+ (4–6 ppl)",
    desc: "High-end lounges, champagne culture, exclusive crowds. Core Lounge, Club Arzu, DM Seoul.",
  },
];

export default function EnVipTablesPage() {
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
        serviceType: "VIP Table Reservation",
        offers: TIERS.map((t) => ({
          "@type": "Offer",
          name: t.name,
          description: t.desc,
          priceRange: t.price,
        })),
      },
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
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-neutral-500 hover:text-white">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            Seoul VIP Table Booking
          </h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            The real way to book VIP tables and bottle service at Seoul&apos;s
            top clubs — Gangnam, Hongdae, Itaewon, Apgujeong. No broker, no
            Korean needed, no tourist tax.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">VIP Table Tiers in Seoul</h2>
          <div className="space-y-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className="p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800 space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="font-bold text-[15px] text-neutral-100">{t.name}</p>
                  <p className="font-black text-[14px] text-amber-400 whitespace-nowrap">
                    {t.price}
                  </p>
                </div>
                <p className="text-[12px] text-neutral-500">{t.perPerson}</p>
                <p className="text-[13px] text-neutral-400 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">How VIP Booking Works</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            Pick your club (or just tell us your budget and vibe) — date,
            group size, budget. We contact the club directly and lock in the
            best table for your budget — real prices, real bottle packages.
            Show up, walk straight in.
          </p>
          <Link
            href="/en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors"
          >
            🍾 Book with NightFlow
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">Browse by District</h2>
          <ul className="space-y-2 text-[13px] text-neutral-400">
            <li><Link className="hover:text-white" href="/en/clubs/gangnam">Gangnam VIP tables →</Link></li>
            <li><Link className="hover:text-white" href="/en/clubs/apgujeong">Apgujeong &amp; Cheongdam VIP lounges →</Link></li>
            <li><Link className="hover:text-white" href="/en/clubs/hongdae">Hongdae VIP &amp; walk-in tables →</Link></li>
            <li><Link className="hover:text-white" href="/en/clubs/itaewon">Itaewon international clubs →</Link></li>
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
