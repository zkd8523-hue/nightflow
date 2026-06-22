import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "./ClubsClient";

export const metadata: Metadata = {
  title: "Seoul Clubs Guide 2026 — NightFlow",
  description:
    "Browse Seoul's best clubs with real prices, Google ratings, and VIP table access. Gangnam, Hongdae, Itaewon and more.",
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
