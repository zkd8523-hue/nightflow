// 손님이 고른 자리를 담당 MD가 한 번 더 확인한다(2026-11-01) — 제안서(/booking/proposal/{token})의 "이 자리 지금도 되나요?".
// 인증은 proposal_token(제안서를 받은 담당 MD) — proposal-response와 같다.
//
//   yes       → 예약 확인서 자동 발급(손님 금액 그대로) + 손님·담당자 전달 + 운영자 확인용 푸시
//   alt       → 대신 가능한 자리로 손님에게 자리 고르기 메일을 다시 보낸다("고르신 자리가 방금 찼어요")
//   condition → 다른 조건(금액+구성)으로 손님에게 금액 안내 메일(진행 / WhatsApp / 취소)
//   none      → 손님에게 바로 안 보내고 운영자에게 알린다 — 사장님이 다른 클럽을 대안으로 제안할 기회
//
// Body: { proposal_token, action, seats?, amount?, conditions? }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoIssueConfirmation, flowWho, loadClub, loadForeignReq, pushAdmins, sendBudgetEmail, sendSeatChoiceEmail } from "@/lib/booking/guestFlows";
import { seatValueLabel, seatsOfValue } from "@/lib/booking/seats";

export async function POST(req: NextRequest) {
  let body: { proposal_token?: string; action?: string; seats?: string[]; amount?: number; conditions?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.proposal_token || !["yes", "alt", "condition", "none"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();
  const r = await loadForeignReq(sb, { proposalToken: body.proposal_token });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });
  if (!r.guest_choice) return NextResponse.json({ error: "no_choice" }, { status: 409 });

  const club = await loadClub(sb, r.club_ids?.[0]);
  const zones = club?.seat_zones ?? [];
  const now = new Date().toISOString();
  const choice = r.guest_choice;

  if (body.action === "yes") {
    // 동시에 두 번 눌려도 한 번만 발급 — pending일 때만 yes로 옮긴다.
    const { data: claimed } = await sb.from("foreign_requests").update({ md_reconfirm_state: "yes", md_reconfirm_at: now }).eq("id", r.id).eq("md_reconfirm_state", "pending").select("id").maybeSingle();
    if (!claimed) return NextResponse.json({ ok: true, already: true });
    const issued = await autoIssueConfirmation(sb, r.id, seatValueLabel(zones, choice));
    if (!issued.ok) return NextResponse.json({ error: "issue_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, ref_no: issued.refNo });
  }

  // 안 돼요 — 이 자리는 다시 못 고르게 상태를 닫는다.
  await sb.from("foreign_requests").update({ md_reconfirm_state: "no", md_reconfirm_at: now }).eq("id", r.id);

  if (body.action === "alt") {
    // 손님이 고른(안 되는) 자리는 빼고 담당자가 새로 고른 자리만.
    const gone = new Set(seatsOfValue(zones, choice));
    const seats = (body.seats ?? []).filter((s) => typeof s === "string" && !gone.has(s)).slice(0, 80);
    if (seats.length === 0) return NextResponse.json({ error: "seats_required" }, { status: 400 });
    await sb.from("foreign_requests").update({ md_seats: seats, guest_choice: null, md_reconfirm_state: null }).eq("id", r.id);
    const sent = await sendSeatChoiceEmail(sb, r.id, choice);
    await pushAdmins(sb, "🔁 [외국인] 자리 다시 안내", `${flowWho(r, club)} — ${seatValueLabel(zones, choice, true)} 불가 → ${seats.join(", ")} ${sent ? "손님에게 다시 안내" : "⚠️ 메일 실패, 직접 연락 필요"}`, r.id, "seat_realt");
    return NextResponse.json({ ok: true, sent });
  }

  if (body.action === "condition") {
    const amount = Number(body.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "amount_required" }, { status: 400 });
    await sb.from("foreign_requests").update({
      md_response: "rejected", md_reject_reason: "budget", md_required_amount: amount,
      md_conditions: (body.conditions ?? "").trim().slice(0, 500) || null, md_responded_at: now,
      guest_choice: null, md_reconfirm_state: null,
    }).eq("id", r.id);
    const sent = await sendBudgetEmail(sb, r.id);
    await pushAdmins(sb, "🔁 [외국인] 다른 조건 안내", `${flowWho(r, club)} — ${seatValueLabel(zones, choice, true)} 불가 → ₩${amount.toLocaleString("en-US")} 조건 ${sent ? "손님에게 안내" : "⚠️ 메일 실패, 직접 연락 필요"}`, r.id, "seat_condition");
    return NextResponse.json({ ok: true, sent });
  }

  // none — 운영자에게 먼저
  await pushAdmins(sb, "⚠️ [외국인] 대신 가능한 자리 없음", `${flowWho(r, club)} — 손님이 고른 ${seatValueLabel(zones, choice, true)}이 안 되고 대신 가능한 자리도 없대요. 다른 클럽을 제안해주세요.`, r.id, "seat_none");
  return NextResponse.json({ ok: true });
}
