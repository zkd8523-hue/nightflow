// 손님 메일 버튼의 확인 페이지(2026-11-01). 열기만 해서는 아무것도 처리하지 않는다 —
// 메일 서비스가 링크를 미리 열어보는 일이 있어, 여는 것만으로 취소·선택이 되면 안 된다.
// 여기서 한 번 더 누르면 /api/guest-respond가 처리한다. guest_token(무작위 16바이트)을 가진 사람 = 메일을 받은 손님.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { GuestRespond, type RespondView } from "@/components/booking/GuestRespond";
import { guestAmount, loadClub, loadForeignReq, resolveItems } from "@/lib/booking/guestFlows";
import { seatOptions, seatValueLabel, seatsOfValue } from "@/lib/booking/seats";
import { menuToIncludes } from "@/lib/booking/mdMenu";
import { fmtGuestDate, normLang } from "@/lib/email/foreignGuest";
import { guestTableText } from "@/lib/booking/guestText";

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
    .select("public_token, table_info, bump_state, bump_amount, bump_items, bump_deadline, total_price")
    .eq("request_type", "foreign")
    .eq("request_id", r.id)
    .maybeSingle();

  const kind = r.guest_action_kind;
  const lang = normLang(r.lang);
  const pickValid = q.pick ? seatOptions(zones, r.md_seats ?? []).some((o) => o.value === q.pick) : false;

  // 어떤 메일에서 왔는지 — 쿼리가 있어도 서버에 기록된 현재 요청 종류와 맞을 때만 보여준다.
  let mode: RespondView["mode"] | "none" =
    q.a === "cancel"
      ? "cancel"
      : q.pick && kind === "pick_seat"
      ? "pick"
      : q.a === "accept" && kind === "budget"
      ? "accept"
      : q.a === "keep" && conf?.bump_state === "pending"
      ? "keep"
      : "none";
  // 예약 확인서가 나간 뒤엔 예전 자리·금액 버튼이 아니라 "예약 내용이 나왔어요"를 보여준다(밀림 유지·취소는 그대로).
  if (conf && (mode === "pick" || mode === "accept" || mode === "none")) mode = "confirmed";
  // 금액 수락을 이미 눌렀으면(MD 응답이 비워진 상태) "이미 클럽에 보냈어요"
  else if (mode === "accept" && r.md_response !== "rejected") mode = "sent";
  // 유효한 버튼이 아니거나 열어만 본 경우엔 지금 진행 상태를 보여준다.
  else if (mode === "none" || (mode === "pick" && !pickValid)) mode = "status";
  const finalMode = ((mode as string) === "none" ? "status" : mode) as RespondView["mode"];

  // 진행 상태 — 이미 저장된 값으로만 만든다.
  const hasSeats = (r.md_seats?.length ?? 0) > 0;
  const rows: { key: string; done: boolean; arg?: string }[] = [{ key: "received", done: true }];
  if (r.md_response === "rejected") rows.push({ key: r.md_required_amount ? "club_other" : "club_no", done: true });
  else if (r.md_response === "approved") rows.push({ key: "club_ok", done: true });
  else rows.push({ key: "club_wait", done: false });
  if (r.md_response === "approved" && hasSeats && !conf) {
    if (r.guest_choice) {
      rows.push({ key: "picked", done: true, arg: seatValueLabel(zones, r.guest_choice) });
      rows.push({ key: "recheck", done: false, arg: seatValueLabel(zones, r.guest_choice) });
    } else rows.push({ key: "pick", done: false });
  }
  rows.push({ key: "details", done: !!conf });
  const firstOpen = rows.findIndex((x) => !x.done);
  const steps = rows.map((x, i) => ({ key: x.key, arg: x.arg ?? null, state: x.done ? ("done" as const) : i === firstOpen ? ("active" as const) : ("todo" as const) }));

  // 자리를 고르는 화면에 "뭘 받는지" — 확인서가 나갈 때와 같은 구성·합계(autoIssueConfirmation과 같은 규칙).
  const menu = r.md_menu ?? null;
  const incLines = menu ? menuToIncludes(menu) : resolveItems(r);
  const incTotal = menu ? menu.total : guestAmount(r);

  const flat = Array.from(new Set(seatOptions(zones, r.md_seats ?? []).flatMap((o) => seatsOfValue(zones, o.value).length ? seatsOfValue(zones, o.value) : [o.value]))).slice(0, 40);
  const view: RespondView = {
    token,
    lang: (r.lang ?? "en").toLowerCase(),
    clubName: club?.name_en || club?.name || "the club",
    eventDate: r.event_date,
    dateLabel: fmtGuestDate(r.event_date, lang),
    guests: r.group_size,
    cancelled: r.status === "cancelled",
    passUrl: conf?.public_token ? `/booking/${conf.public_token}` : null,
    floorPlanUrls: club?.floorPlanUrls ?? [],
    mode: finalMode,
    pickValue: q.pick ?? null,
    pickLabel: q.pick ? seatValueLabel(zones, q.pick) : null,
    alreadyPicked: r.guest_choice ? seatValueLabel(zones, r.guest_choice) : null,
    // 구역 묶음(T1–T12)을 골랐으면 그 안에서 원하는 번호를 고를 수 있게 번호 목록을 준다.
    zoneSeats: q.pick?.startsWith("zone:") ? seatsOfValue(zones, q.pick) : [],
    pickValid,
    allSeats: flat,
    amount:
      kind === "budget" ? Number(r.guest_action_payload?.amount ?? r.md_required_amount ?? 0) || null
      : conf?.bump_amount ?? null,
    currentTotal: conf?.total_price ?? guestAmount(r),
    included: incLines.length ? { lines: incLines, total: incTotal } : null,
    confirmedTable: conf?.table_info ? guestTableText(conf.table_info) : null,
    steps,
    bumpExpired: !!conf?.bump_deadline && new Date(conf.bump_deadline).getTime() < Date.now(),
    bumpItems: (conf?.bump_items ?? "").split("\n").map((l: string) => l.trim()).filter(Boolean),
  };
  return <GuestRespond v={view} />;
}
