// 손님 메일 버튼의 확인 페이지(2026-11-01). 열기만 해서는 아무것도 처리하지 않는다 —
// 메일 서비스가 링크를 미리 열어보는 일이 있어, 여는 것만으로 취소·선택이 되면 안 된다.
// 여기서 한 번 더 누르면 /api/guest-respond가 처리한다. guest_token(무작위 16바이트)을 가진 사람 = 메일을 받은 손님.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { GuestRespond, type RespondView } from "@/components/booking/GuestRespond";
import { guestAmount, loadClub, loadForeignReq } from "@/lib/booking/guestFlows";
import { seatOptions, seatValueLabel } from "@/lib/booking/seats";

export const dynamic = "force-dynamic";

export default async function GuestRespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pick?: string; a?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const sb = createAdminClient();
  const r = await loadForeignReq(sb, { guestToken: token });
  if (!r) notFound();
  const club = await loadClub(sb, r.club_ids?.[0]);
  const zones = club?.seat_zones ?? [];

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("public_token, bump_state, bump_amount, bump_items, bump_deadline, total_price")
    .eq("request_type", "foreign")
    .eq("request_id", r.id)
    .maybeSingle();

  const kind = r.guest_action_kind;
  const view: RespondView = {
    token,
    lang: (r.lang ?? "en").toLowerCase(),
    clubName: club?.name_en || club?.name || "the club",
    eventDate: r.event_date,
    guests: r.group_size,
    cancelled: r.status === "cancelled",
    passUrl: conf?.public_token ? `/booking/${conf.public_token}` : null,
    floorPlanUrls: club?.floorPlanUrls ?? [],
    // 어떤 메일에서 왔는지 — 쿼리가 있어도 서버에 기록된 현재 요청 종류와 맞을 때만 보여준다.
    mode:
      q.a === "cancel"
        ? "cancel"
        : q.pick && kind === "pick_seat"
        ? "pick"
        : q.a === "accept" && kind === "budget"
        ? "accept"
        : q.a === "keep" && conf?.bump_state === "pending"
        ? "keep"
        : "none",
    pickValue: q.pick ?? null,
    pickLabel: q.pick ? seatValueLabel(zones, q.pick) : null,
    alreadyPicked: r.guest_choice ? seatValueLabel(zones, r.guest_choice) : null,
    pickValid: q.pick ? seatOptions(zones, r.md_seats ?? []).some((o) => o.value === q.pick) : false,
    amount:
      kind === "budget" ? Number(r.guest_action_payload?.amount ?? r.md_required_amount ?? 0) || null
      : conf?.bump_amount ?? null,
    currentTotal: conf?.total_price ?? guestAmount(r),
    bumpExpired: !!conf?.bump_deadline && new Date(conf.bump_deadline).getTime() < Date.now(),
    bumpItems: (conf?.bump_items ?? "").split("\n").map((l: string) => l.trim()).filter(Boolean),
  };
  return <GuestRespond v={view} />;
}
