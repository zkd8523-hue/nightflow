import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "Hip-Hop Clubs in Seoul — Where to Hear Hip-Hop & R&B (Foreign Traveler Guide 2026)",
  },
  description:
    "The best hip-hop and R&B clubs in Seoul for foreign travelers. Hongdae, Itaewon, Gangnam — real venues, real prices, English-friendly. The places hip-hop fans actually go.",
  keywords: [
    // hip-hop 핵심
    "hip-hop club Seoul",
    "hip hop club Seoul",
    "hip-hop clubs Seoul",
    "Seoul hip-hop nightclub",
    "R&B club Seoul",
    "hip-hop bar Seoul",
    "hip-hop party Seoul",
    // 외국인 + Korea
    "Korea hip-hop club",
    "Korean hip-hop club",
    "Korea hip-hop nightlife",
    "Seoul hip-hop nightlife",
    "K-hip-hop club",
    // 지역
    "Hongdae hip-hop club",
    "Itaewon hip-hop club",
    "Gangnam hip-hop club",
    // 일반
    "Seoul club for tourists",
    "hip-hop tourism Seoul",
    "best hip-hop club Korea",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/hiphop-clubs",
    languages: {
      "en-US": "https://nightflow.kr/en/hiphop-clubs",
      "x-default": "https://nightflow.kr/en/hiphop-clubs",
    },
  },
  openGraph: {
    title: "Hip-Hop Clubs in Seoul — Foreign Traveler Guide",
    description:
      "The best hip-hop & R&B nightclubs in Seoul. Real prices, English-friendly. The places hip-hop fans actually go.",
    url: "https://nightflow.kr/en/hiphop-clubs",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=Hip-Hop+Clubs+in+Seoul&sub=Where+Hip-Hop+Fans+Actually+Go+%E2%80%94+Foreign+Traveler+Guide&lang=en", width: 1200, height: 630 }],
  },
};

// 실제 승인 클럽(genre:hiphop 태그) 중 리뷰 상위 — 지역 다양성 고려. 설명은 장르·지역 기준으로 정직하게.
const HIPHOP_VENUES = [
  {
    name: "NB2 (Noise Basement 2)",
    district: "Hongdae",
    vibe: "Iconic Hongdae hip-hop basement. Hip-hop + K-pop bangers all night, one of the highest foreign-tourist concentrations in Seoul.",
    bestFor: "First-time hip-hop tourists",
  },
  {
    name: "AURA",
    district: "Hongdae",
    vibe: "Large, high-energy Hongdae hip-hop club. Packed on weekends, big-room sound and a young crowd.",
    bestFor: "Big weekend nights out",
  },
  {
    name: "Gathering",
    district: "Itaewon",
    vibe: "One of Itaewon's busiest hip-hop & R&B floors. International crowd, easygoing door.",
    bestFor: "Itaewon hip-hop & R&B nights",
  },
  {
    name: "Soap Seoul",
    district: "Itaewon",
    vibe: "Well-known Itaewon club with a hip-hop/R&B lean. Mixed local and foreign crowd, reliable weekend energy.",
    bestFor: "Tourists who want a local crowd",
  },
  {
    name: "The Mansion",
    district: "Itaewon",
    vibe: "Premium Itaewon club, hip-hop focus with polished production and a dressed-up crowd.",
    bestFor: "An upscale hip-hop night",
  },
  {
    name: "Orgasm Valley",
    district: "Gangnam",
    vibe: "Highly-rated Gangnam hip-hop lounge-club. Stylish crowd, strong sound, Gangnam pricing.",
    bestFor: "Gangnam hip-hop & lounge vibe",
  },
];

export default function EnHiphopClubsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": "https://nightflow.kr/en/hiphop-clubs/#itemlist",
        name: "Hip-Hop Clubs in Seoul",
        numberOfItems: HIPHOP_VENUES.length,
        itemListElement: HIPHOP_VENUES.map((v, i) => ({
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
          { "@type": "ListItem", position: 2, name: "Hip-Hop Clubs", item: "https://nightflow.kr/en/hiphop-clubs" },
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
            Hip-Hop Clubs in Seoul
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Where hip-hop and R&B fans actually go in Seoul. Honest guide to the
            clubs spinning hip-hop all night — Hongdae, Itaewon, Gangnam, real
            prices, English-friendly venues.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">Top Hip-Hop Clubs in Seoul</h2>
          <div className="space-y-3">
            {HIPHOP_VENUES.map((v) => (
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
          <h2 className="text-[20px] font-black">Booking Tips for Hip-Hop Nights</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Itaewon and Hongdae have the deepest hip-hop scene, but weekend lines
            get long and the best tables go early. If you want guaranteed entry
            and a table, book with NightFlow — we contact the clubs directly for
            you, in English, with no broker fees.
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
            <li><Link className="hover:text-foreground" href="/en/kpop-clubs">K-Pop Clubs in Seoul →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/hongdae">Hongdae Clubs — Full guide →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/clubs/itaewon">Itaewon Clubs — Full guide →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/vip-tables">Seoul VIP Table Booking →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/faq">Seoul Club FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
