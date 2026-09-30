import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // 확정서(booking_confirmations)는 admin·담당 MD만 읽는 RLS라 손님 세션으로는
  // 안 읽힌다. status='done'(확정) 건의 public_token만 service role로 따로 붙여
  // "확정서 보기" 링크를 만든다(2026-09-30) — 카드에서 바로 확정서로 넘어가게.
  const doneIds = (bookings ?? []).filter((b) => b.status === "done").map((b) => b.id);
  let confirmTokenByReqId: Record<string, string> = {};
  if (doneIds.length > 0) {
    const { data: confs } = await createAdminClient()
      .from("booking_confirmations")
      .select("request_id, public_token")
      .eq("request_type", "korean")
      .in("request_id", doneIds);
    confirmTokenByReqId = Object.fromEntries((confs ?? []).map((c) => [c.request_id, c.public_token]));
  }

  const withToken = (bookings ?? []).map((b) => ({ ...b, confirm_public_token: confirmTokenByReqId[b.id] ?? null }));

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-28">
      <MyBookingList bookings={withToken as unknown as (KoreanBookingRequest & { club: { id: string; name: string; area: string; thumbnail_url: string | null } | null; confirm_public_token: string | null })[]} />
    </div>
  );
}
