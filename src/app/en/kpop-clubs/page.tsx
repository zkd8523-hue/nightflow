import type { Metadata } from "next";
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { AgodaStrip } from "@/components/affiliate/AgodaStrip";
import { StickyBookBar } from "@/components/foreign/StickyReveal";
import { fetchClubsByName, approxLocal } from "@/lib/foreign/premiumMenu";
import { clubFloor } from "@/lib/clubs/tablePricing";
import { getKrwRates } from "@/lib/utils/currency";

// 예약 가능 여부·시작가가 DB에서 오므로 하루 한 번 다시 만든다.
export const revalidate = 86400;

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
        "zh-TW": "https://nightflow.kr/zh-tw/kpop-clubs",
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
    dbName: "NB2",
    district: "Hongdae",
    vibe: "Iconic K-pop nightclub. YG-owned, hip-hop + K-pop bangers all night. Highest international tourist concentration in Seoul.",
    bestFor: "First-time K-pop fan tourists",
  },
  {
    name: "Club Purple",
    dbName: "Purple",
    district: "Hongdae",
    vibe: "Hip-hop heavy but plenty of K-pop drops. Beginner-friendly, no strict door policy.",
    bestFor: "Casual K-pop + hip-hop night",
  },
  {
    name: "Club ACE",
    dbName: "Club Ace",
    district: "Gangnam",
    vibe: "Large EDM club with K-pop floor on busy nights. Polished crowd, dress code applies.",
    bestFor: "EDM + K-pop combined night",
  },
  {
    name: "Club Dokkaebi",
    dbName: "Dokkebi",
    district: "Hongdae",
    vibe: "Hip-hop focused but spins K-pop hits regularly. Premium production, lively crowd.",
    bestFor: "K-pop fans who also like hip-hop",
  },
];

export default async function EnKpopClubsPage() {
  // 카드 → 클럽 페이지 링크, 예약 가능한 곳엔 Book 버튼(2026-10-24). 유입 1위 정보성 글인데 카드를 눌러도
  // 아무 데도 안 갔고(클럽 링크 0개), 예약 버튼은 63% 지점에 하나뿐이었다 — 나갈 때 스크롤 중앙값 0%.
  const [clubs, fx] = await Promise.all([fetchClubsByName("en", KPOP_VENUES.map((v) => v.dbName)), getKrwRates()]);
  const venues = KPOP_VENUES.map((v) => ({ ...v, club: clubs.get(v.dbName.toLowerCase()) }));
  const bookable = venues.filter((v) => v.club?.bookable);
  const fromOf = (v: (typeof venues)[number]) => approxLocal(clubFloor(v.club!.id, v.club!.area), "en", fx.rates);
  const fromMin = bookable.length
    ? approxLocal(Math.min(...bookable.map((v) => clubFloor(v.club!.id, v.club!.area))), "en", fx.rates)
    : null;
  const bookHref = "/flags/new?lang=en";
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
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "kpop-clubs" }} />
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

        {bookable.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <p className="text-[14px] text-foreground leading-relaxed">
              Want a table on a K-pop night? We book {bookable.map((v) => v.name).join(" and ")} in English — from {fromMin} per table, real menu prices.
            </p>
            <Link id="book-cta" rel="nofollow" data-nf-track="book_cta" href={bookHref}
              className="inline-block px-5 py-2.5 rounded-full border border-amber-500/70 text-brand-amber font-black text-[14px] hover:bg-amber-500/10 transition-colors">
              Book a table
            </Link>
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">Top K-Pop Clubs in Seoul</h2>
          <div className="space-y-3">
            {venues.map((v) => (
              <div
                key={v.name}
                className="p-5 rounded-2xl bg-card border border-border space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  {v.club?.href ? (
                    <Link href={v.club.href} data-nf-track="info_club_link" className="font-bold text-[15px] text-foreground hover:text-brand-amber">{v.name} →</Link>
                  ) : (
                    <p className="font-bold text-[15px] text-foreground">{v.name}</p>
                  )}
                  <p className="text-[12px] text-muted-foreground">{v.district}</p>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{v.vibe}</p>
                <p className="text-[12px] text-brand-amber">Best for: {v.bestFor}</p>
                {v.club?.bookable && (
                  <Link rel="nofollow" data-nf-track="info_club_book"
                    href={`/flags/new?lang=en&area=${encodeURIComponent(v.club.area)}&club=${v.club.id}`}
                    className="inline-flex items-center gap-2 mt-1 px-4 py-2 rounded-full border border-amber-500/70 text-brand-amber text-[13px] font-black hover:bg-amber-500/10">
                    Book · from {fromOf(v)}
                  </Link>
                )}
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
          <Link rel="nofollow"
            data-nf-track="book_cta" href={bookHref}
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            Book a table
          </Link>
        </section>

        {/* 본문 마지막 섹션 위 */}
        <AgodaStrip lang="en" placement="foreign_info" area={null} />

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
      <StickyBookBar href={bookHref} label="Book a table" />
    </div>
  );
}
