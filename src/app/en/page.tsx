import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { hideTestData } from "@/lib/utils/testData";
import { EnHomeClient } from "./EnHomeClient";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "NightFlow — Seoul Club Booking for Travelers (Gangnam, Hongdae, Itaewon)",
  description:
    "Book the best clubs in Seoul without speaking Korean. Gangnam, Hongdae, Itaewon — real prices, VIP tables, no broker. Top clubs compete to send you private offers.",
  keywords: [
    "Seoul club",
    "Seoul club booking",
    "Seoul nightclub",
    "Gangnam club",
    "Hongdae club",
    "Itaewon club",
    "Seoul VIP table",
    "Korea clubbing",
    "Korea nightlife",
    "Seoul party",
    "club table Seoul",
    "NightFlow",
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

  const { data: puzzlesRaw } = await hideTestData(
    supabase
      .from("puzzles")
      .select(
        "id, area, event_date, budget_per_person, total_budget, target_count, current_count, target_male, target_female, status, gender_pref, notes, leader:users!puzzles_leader_id_fkey!inner(id, display_name, name, country_code, is_test)"
      )
      .in("status", ["open", "selecting"])
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(30),
    "users"
  );

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

  // SEO용 SSR sr-only 콘텐츠 — EnHomeClient는 client-side 렌더링이라 본문이 비어 보이는 문제 보완.
  // 시각엔 안 보이지만 구글봇은 영어 키워드·동네별 클럽 정보를 읽음.
  return (
    <>
      <div className="sr-only">
        <h1>
          NightFlow — Seoul Club Booking for Foreign Travelers (Gangnam,
          Hongdae, Itaewon)
        </h1>
        <p>
          NightFlow is a Seoul club booking platform for foreign travelers and
          tourists. Book VIP tables at the best clubs in Gangnam, Hongdae,
          Itaewon, and Apgujeong without speaking Korean. Real prices, no
          broker, no hidden fees. Top Seoul clubs send you private offers — you
          compare and pick the best one for your night out in Seoul.
        </p>
        <h2>Seoul Club Booking — How NightFlow Works for Travelers</h2>
        <p>
          Plant a flag with your date, party size, and budget. Seoul's hottest
          clubs — including Club ACE in Gangnam, Club Dokkaebi in Hongdae,
          Soap Seoul in Itaewon, Core Lounge in Apgujeong, and many more —
          send you VIP booking offers directly. You compare prices, table
          locations, and bottle packages on one screen, then book with a
          single tap. No Korean needed, no MD connections needed, no broker
          fees.
        </p>
        <h2>Seoul Nightlife Districts Covered</h2>
        <ul>
          <li>
            Gangnam clubs — large EDM and hip-hop clubs, luxury lounges. Club
            ACE, Massive, Club Pop, Mirabaud, and more.
          </li>
          <li>
            Hongdae clubs — hip-hop scene, foreigner-friendly. Club Dokkaebi,
            Sabotage, Attention, Purple, NB2, Awesome Red.
          </li>
          <li>
            Itaewon clubs — international crowd, English OK. Soap Seoul (reopened
            2026), Cakeshop, and more.
          </li>
          <li>
            Apgujeong & Cheongdam lounges — high-end VIP lounges with bottle
            service. Core Lounge, Arzu, DM Seoul.
          </li>
        </ul>
        <h2>Current Active Flags</h2>
        <p>
          {flagCount} active club booking flag{flagCount !== 1 ? "s" : ""} right
          now from travelers planning their night in Seoul. Plant your flag and
          get private VIP offers from Seoul's best clubs within hours.
        </p>
        <h2>Why Book Seoul Clubs Through NightFlow</h2>
        <ul>
          <li>
            No Korean required — clubs reach out to you with English-friendly
            offers.
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
        </ul>
      </div>
      <EnHomeClient flags={flags} />
    </>
  );
}
