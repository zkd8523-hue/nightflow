import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "../ClubsClient";

// 동네별 단독 페이지 — 외국인 SEO 핵심 라우트.
// "Gangnam club booking", "Hongdae nightclub", "Itaewon club" 등
// 각 동네 키워드 검색에 정확히 매칭되도록 설계.

type AreaSlug = "gangnam" | "hongdae" | "itaewon" | "busan" | "apgujeong";

const AREA_CONFIG: Record<
  AreaSlug,
  {
    koreanArea: string;
    en: string;
    title: string;
    description: string;
    intro: string;
    vibe: string;
    topClubsNote: string;
    keywords: string[];
  }
> = {
  gangnam: {
    koreanArea: "강남",
    en: "Gangnam",
    title:
      "Gangnam Club Booking 2026 — VIP Tables, Apgujeong & Cheongdam Lounges (Seoul)",
    description:
      "Book Gangnam's best nightclubs and VIP lounges in Seoul. EDM clubs, hip-hop venues, Apgujeong & Cheongdam high-end lounges. Real prices, VIP tables, no broker, no Korean needed.",
    intro:
      "Gangnam is Seoul's upscale nightlife district, home to large EDM clubs, hip-hop venues, and Korea's top VIP lounges in Apgujeong and Cheongdam. NightFlow lets you book Gangnam club tables without speaking Korean — real prices, no broker.",
    vibe:
      "Gangnam clubs are known for high-energy EDM, polished crowds, and luxury bottle service. Main tables typically start at ₩750,000+, VIP tables ₩1,500,000+. Apgujeong and Cheongdam host Seoul's most exclusive lounges with champagne service.",
    topClubsNote:
      "Top Gangnam clubs include Club ACE (Sinsa, formerly Race), Massive, Club Pop, Mirabaud, Core Lounge (Apgujeong, EDM), Club Arzu (Cheongdam, high-end), and DM Seoul (Apgujeong, hip-hop lounge).",
    keywords: [
      "Gangnam club",
      "Gangnam club booking",
      "Gangnam nightclub",
      "Gangnam VIP table",
      "Gangnam lounge",
      "Gangnam EDM club",
      "best Gangnam club",
      "Apgujeong lounge",
      "Apgujeong club",
      "Cheongdam lounge",
      "Sinsa club",
      "Club ACE Seoul",
      "Seoul VIP lounge",
      "Korea VIP table",
      "Seoul club booking",
      "Korea club booking",
      "Korean club",
      "Korean clubs",
      "Korean nightlife",
      "Korean nightclub",
      "Korean bar",
    ],
  },
  hongdae: {
    koreanArea: "홍대",
    en: "Hongdae",
    title:
      "Hongdae Club Booking 2026 — Hip-Hop, K-Pop & Foreigner-Friendly Nightclubs (Seoul)",
    description:
      "Book Hongdae's best hip-hop and K-pop nightclubs near Hongik University. Foreigner-friendly, English OK, real prices, no broker. Plant a flag and clubs send you VIP offers.",
    intro:
      "Hongdae is Seoul's hip-hop and K-pop nightlife district, packed with foreigner-friendly nightclubs near Hongik University. It's the easiest entry point for travelers — most clubs accept walk-ins, but VIP tables and guest access through NightFlow get you better seats and skip the line.",
    vibe:
      "Hongdae clubs play hip-hop, K-pop, and EDM. Crowd is younger (20s), more international, and entry fees are typically ₩10,000–30,000 (free for ladies at many venues). Bar drinks ₩10,000–15,000. Way cheaper than Gangnam.",
    topClubsNote:
      "Top Hongdae clubs include Club Dokkaebi (premium hip-hop), Sabotage, Attention, Club Purple (hip-hop, beginner-friendly), NB2 (K-pop, hip-hop, K-pop tourist favorite), Awesome Red, and more.",
    keywords: [
      "Hongdae club",
      "Hongdae club booking",
      "Hongdae nightclub",
      "Hongdae nightlife",
      "Hongdae bar",
      "Hongdae hip hop club",
      "Hongdae K-pop club",
      "best Hongdae club",
      "Hongik University club",
      "Hongdae foreigner club",
      "Club Dokkaebi",
      "NB2 Seoul",
      "Seoul club booking",
      "Korea club booking",
      "Korean club",
      "Korean clubs",
      "Korean nightlife",
      "Korean nightclub",
      "Korean bar",
    ],
  },
  itaewon: {
    koreanArea: "이태원",
    en: "Itaewon",
    title:
      "Itaewon Club Booking 2026 — International Clubs, English-Friendly Nightlife (Seoul)",
    description:
      "Book Itaewon's best international nightclubs in Seoul. House, EDM, hip-hop, disco. English-friendly, foreign-friendly crowd. Real prices, VIP tables, no broker.",
    intro:
      "Itaewon is Seoul's international nightlife district with the highest concentration of foreign visitors. Music spans house, EDM, disco, R&B, and hip-hop. Most staff speak English, making it the easiest district for travelers who don't speak Korean.",
    vibe:
      "Itaewon clubs are international, smaller-scale, and music-focused (house, groove, R&B). Entry typically ₩30,000–40,000. Crowd is the most diverse in Seoul — locals, expats, tourists all mix here. Late-night vibe stretches into early morning.",
    topClubsNote:
      "Top Itaewon clubs include Soap Seoul (reopened 2026, house and groove), Cakeshop (legendary underground), and various international bars and clubs along Itaewon-ro.",
    keywords: [
      "Itaewon club",
      "Itaewon club booking",
      "Itaewon nightclub",
      "Itaewon nightlife",
      "Itaewon bar",
      "best Itaewon club",
      "Itaewon foreigner club",
      "Itaewon English club",
      "Soap Seoul",
      "Cakeshop Seoul",
      "Itaewon house club",
      "Seoul club booking",
      "Korea club booking",
      "Korean club",
      "Korean clubs",
      "Korean nightlife",
      "Korean nightclub",
      "Korean bar",
    ],
  },
  apgujeong: {
    koreanArea: "강남",
    en: "Apgujeong",
    title:
      "Apgujeong Lounge Booking 2026 — Cheongdam High-End VIP Lounges (Seoul)",
    description:
      "Book Apgujeong & Cheongdam high-end VIP lounges in Seoul. Champagne service, premium bottles, exclusive crowds. Real prices, no broker, no Korean needed.",
    intro:
      "Apgujeong and Cheongdam host Seoul's most exclusive VIP lounges. Champagne culture, premium bottle service, fashion-forward crowds. NightFlow makes Apgujeong lounge booking accessible to foreign travelers — book the same lounges Koreans book at the same prices.",
    vibe:
      "Apgujeong lounges are high-end, intimate, and curated. Tables start at ₩2,000,000+. Crowd is upscale 20s–30s, often industry/fashion. Music spans EDM, hip-hop lounge, and house depending on the venue. Dress code is strict smart-casual minimum.",
    topClubsNote:
      "Top Apgujeong & Cheongdam lounges include Core Lounge (Apgujeong, EDM, opened 2026), Club Arzu (Cheongdam, high-end hip-hop), DM Seoul (Apgujeong, hip-hop lounge), and Lion (Cheongdam, ultra high-end celebrity venue).",
    keywords: [
      "Apgujeong lounge",
      "Apgujeong lounge booking",
      "Apgujeong club",
      "Cheongdam lounge",
      "Cheongdam club",
      "Cheongdam VIP",
      "Seoul VIP lounge",
      "Seoul champagne lounge",
      "Core Lounge Seoul",
      "Club Arzu",
      "DM Seoul",
      "Apgujeong high-end club",
      "Korea VIP lounge",
      "Korea club booking",
      "Korean club",
      "Korean clubs",
      "Korean nightlife",
      "Korean nightclub",
      "Korean bar",
    ],
  },
  busan: {
    koreanArea: "부산",
    en: "Busan",
    title:
      "Busan Club Booking 2026 — Haeundae, Seomyeon Nightclubs Guide (Korea)",
    description:
      "Book Busan's best nightclubs. Haeundae beach clubs, Seomyeon nightlife. Real prices, VIP tables, no broker. Korea's second-largest city nightlife made easy.",
    intro:
      "Busan is Korea's second-largest city, with a growing nightclub scene focused around Haeundae (beach area) and Seomyeon (downtown). Increasingly popular among travelers visiting Korea beyond Seoul.",
    vibe:
      "Busan clubs are more relaxed than Seoul — beach vibes in Haeundae, downtown energy in Seomyeon. Entry fees ₩15,000–30,000. Crowd is mostly local with some tourists during summer beach season.",
    topClubsNote:
      "Busan club scene is concentrated in Haeundae (beach front clubs, summer peak) and Seomyeon (year-round downtown nightlife).",
    keywords: [
      "Busan club",
      "Busan club booking",
      "Busan nightclub",
      "Busan nightlife",
      "Haeundae club",
      "Seomyeon club",
      "Busan beach club",
      "best Busan club",
      "Busan Haeundae nightlife",
      "Korea second city nightlife",
      "Busan VIP table",
      "Korea club booking",
      "Korean club",
      "Korean clubs",
      "Korean nightlife",
      "Korean nightclub",
      "Korean bar",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(AREA_CONFIG).map((area) => ({ area }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) return {};

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: {
      canonical: `https://nightflow.kr/en/clubs/${area}`,
      languages: {
        "en-US": `https://nightflow.kr/en/clubs/${area}`,
        "zh-CN": `https://nightflow.kr/zh/clubs/${area}`,
        "zh-TW": `https://nightflow.kr/zh/clubs/${area}`,
        "ja-JP": `https://nightflow.kr/ja/clubs/${area}`,
        "x-default": `https://nightflow.kr/en/clubs/${area}`,
      },
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: `https://nightflow.kr/en/clubs/${area}`,
      locale: "en_US",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function EnClubsAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const config = AREA_CONFIG[area as AreaSlug];
  if (!config) notFound();

  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .eq("area", config.koreanArea)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = clubs ?? [];
  const clubCount = clubList.length;

  // Schema.org — Place + ItemList (Google: 별점·리스트 노출)
  // 외국인이 "Hongdae clubs" 검색 시 클럽 목록 카드로 노출.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": `https://nightflow.kr/en/clubs/${area}/#itemlist`,
        name: `${config.en} Clubs — Seoul Club Booking`,
        description: config.intro,
        numberOfItems: clubCount,
        itemListElement: clubList.slice(0, 10).map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "NightClub",
            name: c.name,
            address: c.address
              ? { "@type": "PostalAddress", addressLocality: config.en, addressCountry: "KR" }
              : undefined,
            aggregateRating: c.google_rating
              ? {
                  "@type": "AggregateRating",
                  ratingValue: c.google_rating,
                  reviewCount: c.google_review_count ?? 1,
                }
              : undefined,
            url: `https://nightflow.kr/clubs/${c.id}`,
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "NightFlow",
            item: "https://nightflow.kr/en",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Seoul Clubs",
            item: "https://nightflow.kr/en/clubs",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${config.en} Clubs`,
            item: `https://nightflow.kr/en/clubs/${area}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>
          {config.en} Club Booking — {clubCount} Nightclubs in {config.en},
          Seoul ({config.koreanArea})
        </h1>
        <p>{config.intro}</p>

        <h2>{config.en} Nightlife Vibe &amp; Prices</h2>
        <p>{config.vibe}</p>

        <h2>Top {config.en} Clubs</h2>
        <p>{config.topClubsNote}</p>

        <h2>All {config.en} Clubs on NightFlow ({clubCount})</h2>
        <ul>
          {clubList.slice(0, 30).map((c) => (
            <li key={c.id}>
              {c.name} — {config.en} club
              {c.google_rating ? ` (${c.google_rating}★)` : ""}
            </li>
          ))}
        </ul>

        <h2>How to Book a {config.en} Club Through NightFlow</h2>
        <p>
          Plant a flag with your date, party size, and budget. {config.en}{" "}
          Korean clubs send you private VIP offers within hours. Compare prices
          and table maps on one screen, then book with a single tap. No Korean
          required, no broker fees, no deposit. You pay the {config.en} Korean
          club directly when you arrive — same prices Koreans pay, no tourist
          tax. NightFlow makes {config.en} Korean nightlife accessible to
          foreign travelers and English speakers.
        </p>

        <h2>Why Book {config.en} Clubs Through NightFlow</h2>
        <ul>
          <li>
            English-friendly — {config.en} clubs reach out to you, not the other
            way around.
          </li>
          <li>
            Real prices — secret offers visible only to you, no broker markup.
          </li>
          <li>
            VIP table access at {config.en} clubs — bottle service, prime
            seating, skip the line.
          </li>
          <li>
            Zero platform fee — you pay the {config.en} club directly.
          </li>
          <li>
            Free flag, free offers, no deposit. Cancel anytime if plans change.
          </li>
        </ul>
      </div>
      <ClubsClient clubs={clubList} />
    </>
  );
}
