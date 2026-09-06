import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyBookingList } from "@/components/clubs/MyBookingList";
import type { KoreanBookingRequest } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "내 예약 — NightFlow",
};

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/my-bookings");

  const { data: bookings } = await supabase
    .from("korean_booking_requests")
    .select(`*, club:clubs(id, name, area, thumbnail_url)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-28">
      <MyBookingList bookings={(bookings ?? []) as unknown as (KoreanBookingRequest & { club: { id: string; name: string; area: string; thumbnail_url: string | null } | null })[]} />
    </div>
  );
}
