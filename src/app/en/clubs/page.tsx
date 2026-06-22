import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "./ClubsClient";

export const metadata: Metadata = {
  title: "Korea Club Guide 2026 — Gangnam, Hongdae, Itaewon Nightclubs (Seoul)",
  description:
    "Browse Korea's best clubs in Seoul with real prices, Google ratings, and VIP table booking. Gangnam EDM clubs, Hongdae hip-hop clubs, Itaewon international clubs, Apgujeong VIP lounges. No Korean needed.",
  keywords: [
    // Country-level
    "Korea club",
    "Korea clubs guide",
    "Korea nightclub guide",
    "Korea nightlife guide",
    "clubs in Korea",
    "South Korea club",
    // Seoul-level
    "Seoul club booking",
    "Seoul clubs",
    "Seoul nightclub guide",
    "Seoul nightlife",
    "Seoul VIP table",
    // Hongdae
    "Hongdae club",
    "Hongdae club booking",
    "Hongdae nightclub",
    "Hongdae bar",
    // Gangnam
    "Gangnam club",
    "Gangnam club booking",
    "Gangnam nightclub",
    "Gangnam VIP table",
    "Gangnam lounge",
    // Itaewon
    "Itaewon club",
    "Itaewon club booking",
    "Itaewon nightclub",
    "Itaewon nightlife",
    // Apgujeong
    "Apgujeong lounge",
    "Cheongdam lounge",
    "Seoul VIP lounge",
    // 추천
    "best Seoul clubs",
    "best Korea clubs",
    "Korea club recommendation",
    "top Seoul clubs",
    "where to club in Seoul",
    // 지방
    "Busan club",
    "Busan nightlife",
    "Daegu club",
    "Gwangju club",
    "Incheon club",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/clubs",
  },
  openGraph: {
    title: "Seoul Club Booking 2026 — Gangnam, Hongdae, Itaewon Guide",
    description:
      "Book Seoul's best clubs with real prices and VIP table access. No broker.",
    url: "https://nightflow.kr/en/clubs",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function EnClubsPage() {
  const supabase = await createClient();

  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = clubs ?? [];
  const clubCount = clubList.length;

  // SEO용 sr-only 콘텐츠 — ClubsClient는 client component라 SSR HTML이 비어 보임.
  // 구글봇은 sr-only 텍스트를 정상적으로 인덱싱.
  return (
    <>
      <div className="sr-only">
        <h1>Seoul Club Booking Guide — Gangnam, Hongdae, Itaewon, Apgujeong</h1>
        <p>
          Browse {clubCount} of Seoul&apos;s best clubs with real prices, Google
          ratings, drink menus, and VIP table booking. Book Seoul clubs without
          speaking Korean. No broker, no hidden fees, no booking fee — you pay
          the club directly.
        </p>
        <h2>Top Seoul Clubs by District</h2>
        <ul>
          {clubList.slice(0, 30).map((c) => {
            const areaEn =
              ({ 강남: "Gangnam", 홍대: "Hongdae", 이태원: "Itaewon", 건대: "Konkuk" } as Record<string, string>)[c.area] ??
              c.area;
            return (
              <li key={c.id}>
                {c.name} — {areaEn} club
                {c.google_rating ? ` (${c.google_rating}★)` : ""}
              </li>
            );
          })}
        </ul>
        <h2>How to Book a Seoul Club Through NightFlow</h2>
        <p>
          Plant a flag on NightFlow with your date, group size, and budget.
          Clubs in Gangnam, Hongdae, Itaewon, Apgujeong, and Cheongdam send you
          private VIP offers. Compare prices, table maps, and bottle packages
          on one screen. Book your Seoul club table with one tap — no Korean
          required.
        </p>
      </div>
      <ClubsClient clubs={clubList} />
    </>
  );
}
