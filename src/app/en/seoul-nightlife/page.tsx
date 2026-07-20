import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "Seoul Nightlife Guide 2026 — Where to Go, What to Book (Foreign Traveler Edition)",
  },
  description:
    "Complete Seoul nightlife guide for foreign travelers. Gangnam EDM, Hongdae hip-hop, Itaewon international, Apgujeong VIP lounges. Real prices, no broker, no Korean needed.",
  keywords: [
    "Seoul nightlife",
    "Seoul nightlife guide",
    "Seoul nightlife for foreigners",
    "Seoul nightlife 2026",
    "Korea nightlife",
    "Korea nightlife guide",
    "Korean nightlife",
    "Seoul night out",
    "Seoul party scene",
    "Seoul clubbing",
    "best Seoul nightlife",
    "Seoul nightlife tips",
    "Seoul nightlife districts",
    "Gangnam nightlife",
    "Hongdae nightlife",
    "Itaewon nightlife",
    "Apgujeong nightlife",
    "Seoul bars and clubs",
    "Korea travel nightlife",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/seoul-nightlife",
    languages: {
        "en-US": "https://nightflow.kr/en/seoul-nightlife",
        "zh-CN": "https://nightflow.kr/zh/seoul-nightlife",
        "zh-TW": "https://nightflow.kr/zh/seoul-nightlife",
        "ja-JP": "https://nightflow.kr/ja/seoul-nightlife",
        "x-default": "https://nightflow.kr/en/seoul-nightlife",
    },
  },
  openGraph: {
    title: "Seoul Nightlife Guide 2026 — Where to Go, What to Book",
    description: "Honest guide for foreign travelers. Gangnam, Hongdae, Itaewon, Apgujeong. Real prices, no broker.",
    url: "https://nightflow.kr/en/seoul-nightlife",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=Seoul+Nightlife+Guide+2026&sub=Where+to+Go%2C+What+to+Book+%E2%80%94+Honest+Guide+for+Travelers&lang=en", width: 1200, height: 630 }],
  },
};

export default function EnSeoulNightlifePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "Seoul Nightlife Guide 2026 — Where to Go, What to Book",
        description: "Complete Seoul nightlife guide for foreign travelers.",
        image: ["https://nightflow.kr/og-image.png"],
        datePublished: "2026-01-01T00:00:00+09:00",
        author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/en" },
        publisher: { "@type": "Organization", name: "NightFlow", logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" } },
        mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/en/seoul-nightlife" },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
          { "@type": "ListItem", position: 2, name: "Seoul Nightlife", item: "https://nightflow.kr/en/seoul-nightlife" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">Seoul Nightlife Guide</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Where to go, what to book, and how to actually enjoy Seoul nightlife as a foreign traveler. No broker tax, no Korean required.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">Seoul Nightlife by District</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Seoul nightlife isn&apos;t one thing — it&apos;s four different scenes in four neighborhoods, each with their own vibe, crowd, and prices.
          </p>
          <div className="space-y-3">
            {[
              { name: "Gangnam", vibe: "Luxury EDM, polished crowd, VIP table culture, ₩750K+ tables", link: "/en/clubs/gangnam" },
              { name: "Hongdae", vibe: "Hip-hop & K-pop, foreigner-friendly, walk-in OK, ₩10–30K entry", link: "/en/clubs/hongdae" },
              { name: "Itaewon", vibe: "International, English-friendly, house & electronic music", link: "/en/clubs/itaewon" },
              { name: "Apgujeong & Cheongdam", vibe: "High-end VIP lounges, champagne service, ₩2M+ tables", link: "/en/clubs/apgujeong" },
            ].map((d) => (
              <Link key={d.name} href={d.link} className="block p-5 rounded-2xl bg-card border border-border hover:border-border transition-colors">
                <p className="font-bold text-[15px] text-foreground mb-1">{d.name}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{d.vibe}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">What a Seoul Night Out Costs</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• Walk-in casual: ₩30,000–80,000 per person</li>
            <li>• Hongdae VIP table (6 ppl): ₩50,000–100,000 each</li>
            <li>• Gangnam main VIP (4–6 ppl): ₩150,000–300,000 each</li>
            <li>• Apgujeong premium lounge: ₩400,000+ each</li>
          </ul>
          <Link href="/en/vip-tables" className="text-[12px] text-blue-400 hover:underline">Full VIP table price breakdown →</Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">How to Book Without Korean</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Pick your club (or just tell us your vibe) — date, group size, and budget. We contact the club directly and lock in the best table for your budget, in English. Show up, walk in.
          </p>
          <Link href="/en" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">
            🍾 Book with NightFlow
          </Link>
        </section>

        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">More Guides</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/en/vip-tables">Seoul VIP Table Booking →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/guests">Seoul Club Guest List →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/kpop-clubs">K-Pop Clubs in Seoul →</Link></li>
            <li><Link className="hover:text-foreground" href="/en/faq">Seoul Club FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
