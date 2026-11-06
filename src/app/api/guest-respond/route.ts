// 손님 메일 버튼의 실제 처리(2026-11-01) — /booking/respond/{guest_token} 확인 페이지에서 한 번 더 눌러야 온다.
// (메일 서비스가 링크를 미리 열어보는 일이 있어 GET으로는 아무것도 바꾸지 않는다.)
//
//   pick   — 자리 고르기: 고른 자리를 저장하고 담당 MD에게 재확인 요청("이 자리 지금도 되나요?")
//   accept — 금액 안내: 그 금액으로 담당 MD에게 제안서를 다시 보낸다
//   keep   — 밀림: 유지 금액으로 예약 확인서를 자동 갱신(변경 이력·안내) + MD·운영자 알림
//   cancel — 금액 안내·밀림·자리 고르기 어디서든: 요청 취소 + MD·운영자 알림
//
// Body: { token, action, value? }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";
import { saveConfirmation } from "@/lib/booking/confirmations";
import { flowWho, foreignConfirmation, guestAmount, loadClub, loadForeignReq, notifyMd, pushAdmins } from "@/lib/booking/guestFlows";
import { seatOptions, seatValueLabel, seatsOfValue } from "@/lib/booking/seats";

/** 밀림으로 구성을 다시 적어도 원래 있던 테이블차지(TC) 줄은 빠지지 않게 한다 — 손님이 현장에서 더 내는 일을 막는다(2026-11-06). */
const TC = /^table charge/i;
function keepTcLine(next: string[], before: string[]): string[] {
  const tc = before.find((l) => TC.test(l));
  return tc && !next.some((l) => TC.test(l)) ? [...next, tc] : next;
}

export async function POST(req: NextRequest) {
  let body: { token?: string; action?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.token || !["pick", "accept", "keep", "cancel", "backup"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();
  const r = await loadForeignReq(sb, { guestToken: body.token });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });
  const club = await loadClub(sb, r.club_ids?.[0]);
  const zones = club?.seat_zones ?? [];
  const now = new Date().toISOString();
  const proposalPath = `/booking/proposal/${r.proposal_token}`;

  // ── 취소 ──
  if (body.action === "cancel") {
    await sb.from("foreign_requests").update({ status: "cancelled", guest_responded_at: now, updated_at: now }).eq("id", r.id);
    await sb.from("booking_confirmations").update({ bump_state: "cancelled" }).eq("request_type", "foreign").eq("request_id", r.id).eq("bump_state", "pending");
    if (r.assigned_md_id) await notifyMd(sb, r.assigned_md_id, "❌ 손님이 예약을 취소했어요", `${flowWho(r, club)} — 자리를 풀어주세요.`, proposalPath);
    await pushAdmins(sb, "❌ [외국인] 손님 취소", `${flowWho(r, club)} — 손님이 메일에서 취소했어요 (${r.guest_action_kind ?? "-"})`, r.id, "guest_cancel");
    return NextResponse.json({ ok: true, done: "cancelled" });
  }

  // 예약 확인서가 나간 뒤엔 예전 메일의 자리 버튼·금액 버튼이 다시 먹히지 않는다 — 바꾸려면 밀림 흐름이나 운영자를 거친다.
  if ((body.action === "pick" || body.action === "accept" || body.action === "backup") && (await foreignConfirmation(sb, r.id))) {
    return NextResponse.json({ error: "confirmed" }, { status: 409 });
  }

  // ── 자리 고르기 ──
  if (body.action === "pick") {
    const opts = ((r.guest_action_payload?.options as string[] | undefined) ?? []);
    // 보낸 선택지 그대로이거나, 구역 묶음 안의 번호 하나(손님이 묶음에서 원하는 번호를 고른 경우)
    const inZone = !!body.value && opts.some((o) => o.startsWith("zone:") && seatsOfValue(zones, o).includes(body.value as string));
    if (r.guest_action_kind !== "pick_seat" || !body.value || !(opts.includes(body.value) || inZone)) {
      return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
    }
    await sb.from("foreign_requests").update({
      guest_choice: body.value, guest_responded_at: now, md_reconfirm_state: "pending", md_reconfirm_at: null,
    }).eq("id", r.id);
    const label = seatValueLabel(zones, body.value, true);
    if (r.assigned_md_id) {
      await notifyMd(sb, r.assigned_md_id, "👆 손님이 자리를 골랐어요", `${flowWho(r, club)} · ${label} — 이 자리 지금도 되나요?`, proposalPath);
    }
    return NextResponse.json({ ok: true, done: "picked", label: seatValueLabel(zones, body.value) });
  }

  // ── 2순위 자리 — 고른 자리가 안 될 때 담당자가 바로 쓸 수 있게 저장(새 컬럼 없이 guest_action_payload에 담는다) ──
  if (body.action === "backup") {
    if (r.guest_action_kind !== "pick_seat" || !r.guest_choice) return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
    const mine = new Set(seatsOfValue(zones, r.guest_choice));
    const allowed = new Set(seatOptions(zones, r.md_seats ?? []).flatMap((o) => (seatsOfValue(zones, o.value).length ? seatsOfValue(zones, o.value) : [o.value])).filter((x) => !mine.has(x)));
    const v = body.value ?? "";
    if (v !== "any" && !allowed.has(v)) return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
    await sb.from("foreign_requests").update({ guest_action_payload: { ...(r.guest_action_payload ?? {}), backup: v } }).eq("id", r.id);
    return NextResponse.json({ ok: true, done: "backup" });
  }

  // ── 금액 안내 → 이 금액으로 진행 ──
  if (body.action === "accept") {
    const amount = Number((r.guest_action_payload?.amount as number | undefined) ?? r.md_required_amount ?? 0);
    if (r.guest_action_kind !== "budget" || !amount) return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
    const menu = r.selected_menu?.md_recommend ? { ...r.selected_menu, md_recommend: { ...r.selected_menu.md_recommend, budget: amount } } : r.selected_menu;
    // 두 번 눌려도 한 번만 — MD가 금액 부족으로 거절한 상태(rejected)일 때만 처리하고, 처리하면 같은 업데이트에서 응답을 비운다.
    const { data: claimed } = await sb.from("foreign_requests").update({
      budget: amount,
      selected_menu: menu,
      // 담은 술이 있는 요청은 합계를 새 금액으로 맞춘다 — 담당자가 그 금액에 맞춰 구성을 더한다.
      selected_menu_total: r.selected_menu_total ? amount : null,
      md_response: null, md_responded_at: null, md_reject_reason: null, md_required_amount: null, md_conditions: null, md_reject_note: null,
      guest_responded_at: now,
    }).eq("id", r.id).eq("md_response", "rejected").select("id").maybeSingle();
    if (!claimed) return NextResponse.json({ ok: true, done: "accepted", already: true });
    const sent = r.assigned_md_id ? await notifyAssignedMd(sb, { requestType: "foreign", requestId: r.id, kind: "proposal", revised: true }) : null;
    await pushAdmins(sb, "✅ [외국인] 손님이 금액 수락", `${flowWho(r, club)} — ₩${amount.toLocaleString("en-US")}로 진행 · ${sent?.ok ? "담당자에게 제안서 다시 보냄" : "⚠️ 담당자 알림 실패"}`, r.id, "guest_accept", !!sent?.ok);
    return NextResponse.json({ ok: true, done: "accepted" });
  }

  // ── 밀림 → 유지 ──
  const { data: conf } = await sb.from("booking_confirmations").select("club_id, table_info, confirmed_group_size, includes, total_price, arrival_time, guest_request, internal_memo, bump_state, bump_amount, bump_items, bump_deadline").eq("request_type", "foreign").eq("request_id", r.id).maybeSingle();
  if (!conf || conf.bump_state !== "pending" || !conf.bump_amount) return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
  if (conf.bump_deadline && new Date(conf.bump_deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  const prevTotal = conf.total_price;
  const newItems = (conf.bump_items ?? "").split("\n").map((l: string) => l.trim()).filter(Boolean);
  await saveConfirmation(sb, {
    requestType: "foreign",
    requestId: r.id,
    createdBy: null,
    source: "bump_kept",
    changeNote: `Price changed${prevTotal ? ` from ₩${prevTotal.toLocaleString("en-US")}` : ""} to ₩${conf.bump_amount.toLocaleString("en-US")} — you chose to keep your table on a busy night.`,
    changeReason: "밀림 · 손님 유지 선택",
    fields: {
      club_id: conf.club_id, table_info: conf.table_info, confirmed_group_size: conf.confirmed_group_size,
      includes: keepTcLine(newItems.length ? newItems : conf.includes ?? [], conf.includes ?? []), total_price: conf.bump_amount,
      arrival_time: conf.arrival_time, guest_request: conf.guest_request, internal_memo: conf.internal_memo,
    },
  });
  await sb.from("booking_confirmations").update({ bump_state: "kept" }).eq("request_type", "foreign").eq("request_id", r.id);
  await sb.from("foreign_requests").update({ guest_responded_at: now }).eq("id", r.id);
  if (r.assigned_md_id) {
    await notifyMd(sb, r.assigned_md_id, "✅ 손님이 자리를 유지했어요", `${flowWho(r, club)} — ${conf.bump_amount.toLocaleString("ko-KR")}원으로 예약 확인서가 갱신됐어요.`, proposalPath);
  }
  await pushAdmins(sb, "✅ [외국인] 밀림 → 손님 유지", `${flowWho(r, club)} — ${(prevTotal ?? guestAmount(r) ?? 0).toLocaleString("ko-KR")}원 → ${conf.bump_amount.toLocaleString("ko-KR")}원 확인서 자동 갱신`, r.id, "bump_kept", true);
  return NextResponse.json({ ok: true, done: "kept" });
}
