// 손님이 확정서(/booking/{token})를 처음 열었을 때 시각을 남긴다(Migration 680).
// 어드민 확정서 카드에 "열람 10/1 13:02 / 미열람"으로 보여서, 운영자가 손님이
// 실제로 봤는지 따로 묻지 않아도 알 수 있다(2026-10-01).
//
// 서버 렌더에서 찍지 않고 브라우저 비콘(BookingViewBeacon)으로 받는 이유:
// 인스타 DM·카톡에 링크를 붙이면 미리보기 크롤러가 페이지를 먼저 가져가는데,
// 크롤러는 JS를 실행하지 않으니 비콘을 안 보낸다 — 서버에서 찍으면 손님이
// 열기도 전에 "열람"으로 잘못 표시된다.
//
// 어드민("손님용 확인서 열기")과 담당 MD가 연 건 손님 열람이 아니므로 세지 않는다.
// 첫 열람만 남긴다(guest_viewed_at IS NULL일 때만 UPDATE).
//
// Body: { token: string }
// 200: { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const token = body.token;
  if (!token || !/^[0-9a-f]{16,64}$/i.test(token)) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("id, request_id, request_type, guest_viewed_at")
    .eq("public_token", token)
    .maybeSingle();
  if (!conf) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (conf.guest_viewed_at) return NextResponse.json({ ok: true });

  // 로그인한 사람이 어드민이거나 이 건의 담당 MD면 손님 열람이 아니다.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const reqTable = conf.request_type === "korean" ? "korean_booking_requests" : "foreign_requests";
    const [{ data: me }, { data: reqRow }] = await Promise.all([
      sb.from("users").select("role").eq("id", user.id).maybeSingle(),
      sb.from(reqTable).select("assigned_md_id").eq("id", conf.request_id).maybeSingle(),
    ]);
    if (me?.role === "admin" || reqRow?.assigned_md_id === user.id) {
      return NextResponse.json({ ok: true, skipped: "staff" });
    }
  }

  await sb
    .from("booking_confirmations")
    .update({ guest_viewed_at: new Date().toISOString() })
    .eq("id", conf.id)
    .is("guest_viewed_at", null);

  return NextResponse.json({ ok: true });
}
