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

  return <ClubsClient clubs={clubs ?? []} />;
}
