// 담당 MD가 "자리가 밀릴 것 같아요"를 누르면(2026-11-01) — 취소가 아니라 손님에게 "이 금액이면 유지"를 먼저 묻는다.
// 인증은 md_token(MD용 확인서 링크) — md-checkin·booking-md-cancel과 같다.
//
//   저장: booking_confirmations.bump_* (state=pending, 필요 금액, 바뀌는 구성, 답 기한)
//   손님: 메일(이 금액으로 유지 / 비용 없이 취소) — 외국인 요청만(메일이 필수라 항상 닿는다)
//   운영자: 푸시. 답이 없으면 cron(proposal-reminders)이 기한에 운영자에게 알리고 만료로 닫는다.
//
// Body: { md_token, amount, items?, within: "0.5" | "1" | "2" | "evening" }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flowWho, loadClub, loadForeignReq, pushAdmins, sendBumpEmail } from "@/lib/booking/guestFlows";

export async function POST(req: NextRequest) {
  let body: { md_token?: string; amount?: number; items?: string; within?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const amount = Math.round(Number(body.amount ?? 0));
  if (!body.md_token || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const sb = createAdminClient();
  const { data: conf } = await sb.from("booking_confirmations").select("request_id, request_type, bump_state").eq("md_token", body.md_token).maybeSingle();
  if (!conf || conf.request_type !== "foreign") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await loadForeignReq(sb, { id: conf.request_id });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });

  // 입장했거나 도착 신호가 있으면 현장 진행 중이라 밀지 않는다.
  const { count: pings } = await sb.from("arrival_pings").select("*", { count: "exact", head: true }).eq("request_id", r.id).eq("kind", "arrived");
  if ((pings ?? 0) > 0) return NextResponse.json({ error: "already_arrived" }, { status: 409 });

  // 답 기한 — 남은 시간으로 고르게 한다(손님이 어느 나라에 있어도 같은 뜻). "영업 전"은 그날 밤 22시(서울).
  const now = Date.now();
  const deadline =
    body.within === "evening"
      ? new Date(`${r.event_date}T22:00:00+09:00`)
      : new Date(now + Number(body.within === "0.5" ? 0.5 : body.within === "2" ? 2 : 1) * 3600_000);

  const items = (body.items ?? "").trim().slice(0, 500) || null;
  const { error } = await sb.from("booking_confirmations").update({
    bump_state: "pending", bump_amount: amount, bump_items: items,
    bump_deadline: deadline.toISOString(), bump_requested_at: new Date(now).toISOString(),
  }).eq("md_token", body.md_token);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  const sent = await sendBumpEmail(sb, r.id);
  const club = await loadClub(sb, r.club_ids?.[0]);
  await pushAdmins(
    sb,
    "⚠️ [외국인] 자리가 밀릴 것 같대요",
    `${flowWho(r, club)} — 유지하려면 ${amount.toLocaleString("ko-KR")}원 · ${sent ? "손님에게 유지/취소 메일 발송" : "⚠️ 손님 메일 실패, 직접 연락 필요"}`,
    r.id,
    "bump_requested",
  );
  if (!sent) return NextResponse.json({ error: "no_guest_channel" }, { status: 422 });
  return NextResponse.json({ ok: true, deadline: deadline.toISOString() });
}
