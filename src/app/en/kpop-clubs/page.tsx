import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "K-Pop Clubs in Seoul — Where to Hear K-Pop Live (Foreign Traveler Guide 2026)",
  },
  description:
    "The best K-pop clubs and nightlife in Seoul for foreign travelers. Hongdae NB2, K-pop dance parties, idol hits all night. Real prices, no broker, English-friendly.",
  keywords: [
    // K-pop 핵심
    "K-pop club",
    "K-pop clubs",
    "K-pop nightclub",
    "K-pop club Seoul",
    "K-pop bar",
    "K-pop dance club",
    "K-pop party Seoul",
    // 외국인 + Korea
    "Korea K-pop club",
    "Korean K-pop club",
    "Korea K-pop nightlife",
    "Seoul K-pop nightlife",
    // 클럽명
    "NB2 Seoul",
    "NB2 Hongdae",
    "Hongdae K-pop club",
    // 일반
    "Hongdae club for tourists",
    "Seoul K-pop tourism",
    "K-pop fan club Seoul",
    "BTS club Seoul",
    "K-pop dance party",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/kpop-clubs",
    languages: {
        "en-US": "https://nightflow.kr/en/kpop-clubs",
        "zh-CN": "https://nightflow.kr/zh/kpop-clubs",
        "zh-TW": "https://nightflow.kr/zh/kpop-clubs",
        "ja-JP": "https://nightflow.kr/ja/kpop-clubs",
        "x-default": "https://nightflow.kr/en/kpop-clubs",
    },
  },
  openGraph: {
    title: "K-Pop Clubs in Seoul — Foreign Traveler Guide",
    description:
      "The best K-pop nightclubs in Seoul. Real prices, English-friendly. The places K-pop fans actually go.",
    url: "https://nightflow.kr/en/kpop-clubs",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=K-Pop+Clubs+in+Seoul&sub=Where+K-Pop+Fans+Actually+Go+%E2%80%94+Foreign+Traveler+Guide&lang=en", width: 1200, height: 630 }],
  },
};

const KPOP_VENUES = [
  {
    name: "NB2 (Noise Basement 2)",
    district: "Hongdae",
    vibe: "Iconic K-pop nightclub. YG-owned, hip-hop + K-pop bangers all night. Highest international tourist concentration in Seoul.",
    bestFor: "First-time K-pop fan tourists",
  },
  {
    name: "Club Purple",
    district: "Hongdae",
    vibe: "Hip-hop heavy but plenty of K-pop drops. Beginner-friendly, no strict door policy.",
    bestFor: "Casual K-pop + hip-hop night",
  },
  {
    name: "Club ACE",
    district: "Gangnam",
    vibe: "Large EDM club with K-pop floor on busy nights. Polished crowd, dress code applies.",
    bestFor: "EDM + K-pop combined night",
  },
  {
    name: "Club Dokkaebi",
    district: "Hongdae",
    vibe: "Hip-hop focused but spins K-pop hits regularly. Premium production, lively crowd.",
    bestFor: "K-pop fans who also like hip-hop",
  },
];

export default function EnKpopClubsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": "https://nightflow.kr/en/kpop-clubs/#itemlist",
        name: "K-Pop Clubs in Seoul",
        numberOfItems: KPOP_VENUES.length,
        itemListElement: KPOP_VENUES.map((v, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "NightClub",
            name: v.name,
            address: { "@type": "PostalAddress", addressLocality: v.district, addressCountry: "KR" },
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
          { "@type": "ListItem", position: 2, name: "K-Pop Clubs", item: "https://nightflow.kr/en/kpop-clubs" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            K-Pop Clubs in Seoul
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Where K-pop fans actually go in Seoul. Honest guide to the
            nightclubs spinning idol hits all night — Hongdae, Gangnam, real
            prices, English-friendly venues.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">Top K-Pop Clubs in Seoul</h2>
          <div className="space-y-3">
            {KPOP_VENUES.map((v) => (
              <div
                key={v.name}
                className="p-5 rounded-2xl bg-card border border-border space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-[15px] text-foreground">{v.name}</p>
                  <p className="text-[12px] text-muted-foreground">{v.district}</p>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{v.vibe}</p>
                <p className="text-[12px] text-brand-amber">Best for: {v.bestFor}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">Booking Tips for K-Pop Tourists</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Most K-pop tourists head to NB2 in Hongdae. It works — but the line
            on weekends can be 90 minutes. If you want guaranteed entry and a
            table, book with NightFlow and we contact Hongdae K-pop clubs
            directly for you, in English.
          </p>
          <Link
            href="/en"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 Book with NightFlow
          </Link>
        </section>

        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">Related Guides</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/en/hiphop-clubs">Hip-Hop Clubs in Seoul →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/hongdae">Hongdae Clubs — Full guide →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/gangnam">Gangnam Clubs — Full guide →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/vip-tables">Seoul VIP Table Booking →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/faq">Seoul Club FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
