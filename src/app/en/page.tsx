import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { EnHomeClient } from "./EnHomeClient";

export const revalidate = 30;

export const metadata: Metadata = {
  // absolute = root layout의 "%s | 나플" template 무시. 한글 노출 차단.
  title: {
    absolute:
      "Korea Club Booking — Gangnam, Hongdae, Itaewon VIP Tables (NightFlow Seoul)",
  },
  description:
    "Book Korea's best clubs in Seoul — Gangnam, Hongdae, Itaewon, Apgujeong. Real prices, VIP tables, no broker, no Korean needed. Top Seoul clubs send you private offers. Korea nightlife made easy for travelers.",
  keywords: [
    // Country-level (검색량 큼)
    "Korea club",
    "Korea club booking",
    "Korea nightclub",
    "Korea nightlife",
    "Korea clubbing",
    "South Korea club",
    "South Korea nightlife",
    "clubs in Korea",
    // 추천 키워드 (외국인 일반 검색)
    "best clubs in Korea",
    "best clubs in Seoul",
    "Korea club recommendation",
    "Seoul club recommendation",
    "top Seoul clubs",
    "top Korea clubs",
    "best nightclubs Seoul",
    "where to club in Seoul",
    "Korea travel club",
    "Seoul tourist clubs",
    // Seoul-level
    "Seoul club",
    "Seoul club booking",
    "Seoul nightclub",
    "Seoul nightlife",
    "Seoul VIP table",
    "Seoul party",
    "Seoul club guide",
    // Hongdae 단독
    "Hongdae club",
    "Hongdae club booking",
    "Hongdae nightclub",
    "Hongdae nightlife",
    "Hongdae bar",
    "Hongdae hip hop club",
    "best Hongdae club",
    // Gangnam 단독
    "Gangnam club",
    "Gangnam club booking",
    "Gangnam nightclub",
    "Gangnam VIP table",
    "Gangnam lounge",
    "best Gangnam club",
    // Itaewon 단독
    "Itaewon club",
    "Itaewon club booking",
    "Itaewon nightlife",
    "Itaewon nightclub",
    "best Itaewon club",
    // Apgujeong / Cheongdam 라운지
    "Apgujeong lounge",
    "Cheongdam lounge",
    "Seoul VIP lounge",
    // 지방 도시 (Busan / Daegu / Gwangju)
    "Busan club",
    "Busan nightclub",
    "Busan nightlife",
    "Busan club booking",
    "Daegu club",
    "Daegu nightlife",
    "Gwangju club",
    "Gwangju nightlife",
    "Incheon club",
    // Brand
    "NightFlow",
    "NightFlow Korea",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en",
    languages: {
      "en-US": "https://nightflow.kr/en",
      "ko-KR": "https://nightflow.kr",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    title: "NightFlow — Seoul Club Booking for Travelers",
    description:
      "Book the best clubs in Seoul without speaking Korean. Real prices, VIP tables, no broker.",
    url: "https://nightflow.kr/en",
    siteName: "NightFlow",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NightFlow — Seoul Club Booking for Travelers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NightFlow — Seoul Club Booking for Travelers",
    description:
      "Book the best clubs in Seoul without speaking Korean. Real prices, VIP tables, no broker.",
    images: ["/og-image.png"],
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function EnHomePage() {
  const supabase = createAnonClient();
  const nowIso = new Date().toISOString();

  // 깃발 캐러셀 = "🇰🇷 한국인이 올린 깃발" 소셜 프루프.
  // 테스트 유저(is_test) 제외 + 한국인(country_code NULL)만 — 외국인 본인 깃발은 My flags에 별도.
  const { data: puzzlesRaw } = await supabase
    .from("puzzles")
    .select(
      "id, area, event_date, budget_per_person, total_budget, target_count, current_count, target_male, target_female, status, gender_pref, notes, leader:users!puzzles_leader_id_fkey!inner(id, display_name, name, country_code, is_test)"
    )
    .in("status", ["open", "selecting"])
    .gt("expires_at", nowIso)
    .eq("users.is_test", false)
    .is("users.country_code", null)
    .order("created_at", { ascending: false })
    .limit(30);

  // 강남·홍대 클럽 (지역 섹션용 — 이태원 제외: MD 없음)
  // /en/clubs 와 동일한 필터: 삭제·운영자·테스트 클럽 제외 + 썸네일 있는 것만 + 이름 중복 제거
  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, address")
    .in("area", ["강남", "홍대"])
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .not("thumbnail_url", "is", null)
    .neq("thumbnail_url", "")
    .order("google_review_count", { ascending: false, nullsFirst: false })
    .limit(60);
  const seenClubNames = new Set<string>();
  const clubs = (clubsRaw ?? [])
    .filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seenClubNames.has(key)) return false;
      seenClubNames.add(key);
      return true;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      area: c.area,
      thumbnail_url: c.thumbnail_url,
      address: c.address,
    }));

  // 클럽 정렬: 누적 오퍼 많은 순 (실시간 불필요 — revalidate 30s 캐시로 충분)
  const clubIds = clubs.map((c) => c.id);
  if (clubIds.length > 0) {
    const { data: clubOfferRows } = await supabase
      .from("puzzle_offers")
      .select("club_id")
      .in("club_id", clubIds)
      .limit(5000);
    const clubOfferCount: Record<string, number> = {};
    clubOfferRows?.forEach((r: { club_id: string | null }) => {
      if (r.club_id) clubOfferCount[r.club_id] = (clubOfferCount[r.club_id] || 0) + 1;
    });
    // 동점은 기존 google_review_count 순 유지 (stable sort)
    clubs.sort((a, b) => (clubOfferCount[b.id] ?? 0) - (clubOfferCount[a.id] ?? 0));
  }

  const puzzles = puzzlesRaw ?? [];
  let offerCountMap: Record<string, number> = {};

  if (puzzles.length > 0) {
    const ids = puzzles.map((p) => p.id);
    const { data: offerRows } = await supabase
      .from("puzzle_offers")
      .select("puzzle_id")
      .in("puzzle_id", ids)
      .eq("status", "pending")
      .limit(1000);
    if (offerRows) {
      offerRows.forEach((r: { puzzle_id: string }) => {
        offerCountMap[r.puzzle_id] = (offerCountMap[r.puzzle_id] || 0) + 1;
      });
    }
  }

  const flags = puzzles.map((p) => ({
    id: p.id,
    area: p.area,
    event_date: p.event_date,
    budget_per_person: p.budget_per_person,
    total_budget: p.total_budget,
    target_count: p.target_count,
    current_count: p.current_count,
    target_male: p.target_male,
    target_female: p.target_female,
    status: p.status,
    gender_pref: p.gender_pref,
    notes: p.notes,
    leader: Array.isArray(p.leader) ? p.leader[0] ?? null : (p.leader as { display_name: string | null; name: string | null; country_code: string | null } | null) ?? null,
    offerCount: offerCountMap[p.id] ?? 0,
  }));

  const flagCount = flags.length;

  // Schema.org JSON-LD — 외국인 검색 결과 풍부 노출(별점·FAQ·검색박스).
  // Google "Korea club booking" 검색 시 우리 페이지가 일반 결과보다 큰 카드로 표시됨.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/en/#organization",
        name: "NightFlow",
        alternateName: ["NightFlow Korea", "NightFlow Seoul"],
        url: "https://nightflow.kr/en",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "Korea club booking platform for foreign travelers. Book VIP tables at Seoul's best clubs in Gangnam, Hongdae, Itaewon without speaking Korean.",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
        areaServed: { "@type": "Country", name: "South Korea" },
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/en/#website",
        url: "https://nightflow.kr/en",
        name: "NightFlow — Korea Club Booking",
        alternateName: ["NightFlow Seoul", "NightFlow Korea"],
        inLanguage: "en-US",
        publisher: { "@id": "https://nightflow.kr/en/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://nightflow.kr/en/clubs?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/en/#service",
        name: "Seoul Club Booking Service",
        provider: { "@id": "https://nightflow.kr/en/#organization" },
        areaServed: [
          { "@type": "City", name: "Seoul" },
          { "@type": "City", name: "Busan" },
        ],
        description:
          "Book VIP tables at top Seoul clubs (Gangnam, Hongdae, Itaewon, Apgujeong) without speaking Korean. Real prices, no broker, English-friendly.",
        serviceType: "Club Reservation",
      },
    ],
  };

  // SEO용 SSR sr-only 콘텐츠 — EnHomeClient는 client-side 렌더링이라 본문이 비어 보이는 문제 보완.
  // 시각엔 안 보이지만 구글봇은 영어 키워드·동네별 클럽 정보를 읽음.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>
          Korea Club Booking — Gangnam, Hongdae, Itaewon VIP Tables (NightFlow
          Seoul)
        </h1>
        <p>
          NightFlow is a Korea club booking platform for foreign travelers and
          tourists visiting Seoul. Book VIP tables at the best Korea clubs in
          Gangnam, Hongdae, Itaewon, and Apgujeong without speaking Korean.
          Real prices, no broker, no hidden fees. Top Seoul clubs send you
          private offers — you compare and pick the best one for your night
          out. Korea nightlife made easy.
        </p>

        <h2>Hongdae Club Booking — Hip-Hop &amp; Foreigner-Friendly</h2>
        <p>
          Hongdae is Seoul&apos;s hip-hop club district, packed with
          foreigner-friendly nightclubs and bars near Hongik University. Top
          Hongdae clubs include Club Dokkaebi (premium hip-hop), Sabotage,
          Attention, Club Purple, NB2 (K-pop, hip-hop), and Awesome Red. Hongdae
          club booking is the easiest entry point for travelers — most clubs
          accept walk-ins, but VIP tables and guest list access through
          NightFlow get you better seats and skip the line.
        </p>

        <h2>Gangnam Club Booking — Large EDM &amp; VIP Tables</h2>
        <p>
          Gangnam is Seoul&apos;s upscale club district, home to large EDM
          nightclubs and luxury lounges. Top Gangnam clubs include Club ACE
          (Sinsa, ex-Race), Massive, Club Pop, and Mirabaud. Gangnam club
          booking is essential for VIP tables since main tables start at
          ₩750,000+. Bottle service, prime EDM dance floor seats, and private
          VIP lounges — all bookable through NightFlow without speaking Korean.
        </p>

        <h2>Itaewon Club Booking — International &amp; English-Friendly</h2>
        <p>
          Itaewon is Seoul&apos;s international nightlife district with the
          highest concentration of foreign visitors. English-friendly Itaewon
          clubs include Soap Seoul (reopened 2026, house and groove music),
          Cakeshop, and more. Itaewon club booking is especially popular among
          travelers because most staff speak English and music spans house, EDM,
          disco, R&amp;B, and hip-hop.
        </p>

        <h2>Best Korea Clubs Recommendation by District</h2>
        <p>
          Wondering where to club in Korea? Here&apos;s the best clubs
          recommendation by district. For Hongdae hip-hop and foreigner-friendly
          vibes, try Club Dokkaebi or NB2. For Gangnam EDM and VIP tables, Club
          ACE leads the scene. For Itaewon international crowd, Soap Seoul is
          the top recommendation. For Apgujeong high-end lounges, Core Lounge
          and Club Arzu top the list. NightFlow lets you compare and book the
          best clubs in Seoul without speaking Korean.
        </p>

        <h2>Apgujeong &amp; Cheongdam VIP Lounges</h2>
        <p>
          Apgujeong and Cheongdam host Seoul&apos;s high-end VIP lounges with
          champagne service and premium bottle packages. Top venues include
          Core Lounge (EDM, opened 2026), Club Arzu (high-end), and DM Seoul
          (hip-hop lounge). Lounge tables start at ₩2,000,000+. NightFlow
          makes VIP lounge booking accessible to foreign travelers without
          requiring a Korean host or local connections.
        </p>

        <h2>Korea Beyond Seoul — Busan, Daegu, Gwangju Clubs</h2>
        <p>
          NightFlow also covers nightlife outside Seoul. Busan club booking is
          increasingly popular among travelers visiting Korea&apos;s second
          city — Haeundae and Seomyeon are the main club districts. Daegu and
          Gwangju have smaller scenes but solid local clubs. Plant a flag for
          any Korean city and local clubs will send you offers.
        </p>

        <h2>How NightFlow Korea Club Booking Works</h2>
        <p>
          Plant a flag with your date, party size, and budget. Seoul&apos;s
          hottest clubs — including Club ACE in Gangnam, Club Dokkaebi in
          Hongdae, Soap Seoul in Itaewon, Core Lounge in Apgujeong, and many
          more — send you VIP booking offers directly. You compare prices,
          table locations, and bottle packages on one screen, then book with a
          single tap. No Korean needed, no MD connections needed, no broker
          fees.
        </p>

        <h2>Current Active Club Booking Flags</h2>
        <p>
          {flagCount} active Korea club booking flag{flagCount !== 1 ? "s" : ""}{" "}
          right now from travelers planning their night in Seoul (Gangnam,
          Hongdae, Itaewon, Apgujeong). Plant your flag and get private VIP
          offers from Seoul&apos;s best clubs within hours.
        </p>

        <h2>Browse Korea Clubs by District</h2>
        <ul>
          <li>
            <a href="/en/clubs/gangnam">
              Gangnam clubs — EDM, hip-hop, Apgujeong &amp; Cheongdam lounges
            </a>
          </li>
          <li>
            <a href="/en/clubs/hongdae">
              Hongdae clubs — Hip-hop, K-pop, foreigner-friendly
            </a>
          </li>
          <li>
            <a href="/en/clubs/itaewon">
              Itaewon clubs — International, English-friendly
            </a>
          </li>
          <li>
            <a href="/en/clubs/busan">
              Busan clubs — Haeundae beach &amp; Seomyeon downtown
            </a>
          </li>
        </ul>

        <h2>Why Book Korea Clubs Through NightFlow</h2>
        <ul>
          <li>
            No Korean required — Gangnam, Hongdae, Itaewon clubs reach out to
            you with English-friendly offers.
          </li>
          <li>
            Real prices — secret offers visible only to you, no broker markup.
          </li>
          <li>
            VIP table access — bottle service, prime locations, skip the line.
          </li>
          <li>
            Zero platform fee — you pay the club directly, nothing to NightFlow.
          </li>
          <li>
            Free to plant a flag, free to receive offers, no deposit required.
          </li>
          <li>
            Covers all Seoul nightlife districts — Gangnam, Hongdae, Itaewon,
            Apgujeong, Cheongdam, Sinsa.
          </li>
        </ul>
      </div>
      <EnHomeClient flags={flags} clubs={clubs} />
    </>
  );
}
