// MD용 확인서에서 "입장 완료"를 누르면 호출된다. md_token으로 본인 예약임을 확인한다
// (로그인 없이 링크만 아는 사람이 접근하는 구조라 arrival API와 동일한 인증 방식).
//
// 손님이 먼저 "I'm here"(arrival_pings, kind='arrived')를 보낸 적이 있는지 확인한다.
// 없는데 MD가 입장 완료를 누르면 — 실제로 안 왔는데 실수/허위로 눌렀을 가능성이 있어
// 저장은 하되 운영자에게 경고 푸시를 보낸다. 이건 차단이 아니라 로그다: MD가 손님을
// 직접 보고 확인했을 수도 있으니(손님이 앱 링크를 못 열었을 뿐) 입장 자체를 막지 않는다.
// MD 본인에게는 보내지 않는다 — 방금 자기가 누른 걸 다시 알려줄 필요가 없다(2026-09-06).
//
// Body: { action: "checkin" | "undo", md_token: string }
// 200: { ok: true, checked_in_at: string | null, warned: boolean }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { action?: string; md_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { action, md_token } = body;
  if (!md_token || (action !== "checkin" && action !== "undo")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: conf, error: confErr } = await sb
    .from("booking_confirmations")
    .select("request_id, ref_no, club_id, request_type")
    .eq("md_token", md_token)
    .maybeSingle();

  if (confErr || !conf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (action === "undo") {
    await sb
      .from("booking_confirmations")
      .update({ md_checked_in_at: null })
      .eq("request_id", conf.request_id);
    return NextResponse.json({ ok: true, checked_in_at: null, warned: false });
  }

  // action === "checkin"
  const now = new Date().toISOString();
  await sb
    .from("booking_confirmations")
    .update({ md_checked_in_at: now })
    .eq("request_id", conf.request_id);

  // 손님이 실제로 "도착" 신호를 보낸 적 있는지 확인
  const { data: arrivedPing } = await sb
    .from("arrival_pings")
    .select("id")
    .eq("request_id", conf.request_id)
    .eq("kind", "arrived")
    .limit(1)
    .maybeSingle();

  let warned = false;
  if (!arrivedPing) {
    // 확정서가 외국인/한국 요청 중 무엇인지에 따라 원본 테이블이 다르다
    // (2026-09-06, Migration 654).
    const { data: reqRow } = await sb
      .from(conf.request_type === "korean" ? "korean_booking_requests" : "foreign_requests")
      .select("guest_name")
      .eq("id", conf.request_id)
      .single();

    let clubName = "";
    if (conf.club_id) {
      const { data: club } = await sb.from("clubs").select("name").eq("id", conf.club_id).single();
      clubName = club?.name ?? "";
    }

    const warnBody = `${clubName} ${reqRow?.guest_name ?? "게스트"}님 (${conf.ref_no}) — 손님 도착 신호 없이 MD가 입장 완료를 처리했습니다.`;

    const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
    for (const admin of admins ?? []) {
      try {
        await sb.rpc("notify_user_push", {
          p_user_id: admin.id,
          p_title: "⚠️ 도착 신호 없이 입장 처리",
          p_body: warnBody,
          p_data: { type: "md_checkin_warning", request_id: conf.request_id },
          p_url: conf.request_type === "korean" ? "/admin/korean-bookings" : "/admin/foreign",
          p_category: "transaction",
        });
      } catch (e) {
        console.error("[md-checkin] admin 경고 push 실패", e);
      }
    }
    warned = true;
  }

  return NextResponse.json({ ok: true, checked_in_at: now, warned });
}
