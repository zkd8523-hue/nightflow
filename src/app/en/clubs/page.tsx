import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "./ClubsClient";

export const metadata: Metadata = {
  title: "Seoul Club Booking 2026 — Gangnam, Hongdae, Itaewon Guide",
  description:
    "Browse Seoul's best clubs with real prices, Google ratings, and VIP table booking. Book Gangnam, Hongdae, Itaewon clubs without speaking Korean. No broker.",
  keywords: [
    "Seoul club booking",
    "Seoul clubs",
    "Seoul nightclub guide",
    "Gangnam club booking",
    "Hongdae club booking",
    "Itaewon club booking",
    "Seoul VIP table",
    "book club Seoul",
    "Korea clubbing guide",
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
