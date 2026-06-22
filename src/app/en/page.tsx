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

  return <EnHomeClient flags={flags} />;
}
