import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CancelClient } from "./CancelClient";

export default async function CancelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: auctionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: auction } = await supabase
    .from("auctions")
    .select(
      `
      id, status, winner_id, winning_price, current_bid,
      event_date, contact_deadline, contact_timer_minutes, won_at, listing_type,
      club:club_id (name, area)
    `
    )
    .eq("id", auctionId)
    .single();

  if (!auction || auction.winner_id !== user.id || auction.status !== "won") {
    redirect("/my-wins");
  }

  // 유저 경고점 조회
  const { data: userData } = await supabase
    .from("users")
    .select("warning_count")
    .eq("id", user.id)
    .single();

  return (
    <CancelClient
      auction={{
        id: auction.id,
        clubName: (auction.club as { name?: string } | null)?.name || "클럽",
        clubArea: (auction.club as { area?: string } | null)?.area || "",
        eventDate: auction.event_date,
        winningPrice: auction.winning_price || auction.current_bid || 0,
        contactDeadline: auction.contact_deadline,
        wonAt: auction.won_at,
        listingType: ((auction as { listing_type?: "instant" | "auction" }).listing_type || "auction") as "instant" | "auction",
      }}
      currentWarnings={userData?.warning_count ?? 0}
    />
  );
}
