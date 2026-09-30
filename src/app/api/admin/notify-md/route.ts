// 운영자가 어드민에서 "제안서 보내기" / "확정서 보내기"를 누르면 담당 MD에게 앱 푸시를 보낸다.
//
// 예전엔 제안서·확정서 링크를 복사해 카톡/인스타 DM으로 직접 붙여 보내야 했고, MD는
// 그 링크를 받아야만 내용을 볼 수 있었다(2026-09-30). 푸시를 누르면 앱 안에서 바로
// 제안서(/booking/proposal/{token})나 MD용 확정서(/booking/md/{token})가 열린다.
// 같은 건은 파트너 페이지 "예약관리"에도 떠서 푸시를 놓쳐도 거기서 찾을 수 있다.
//
// 푸시 토큰이 없는 MD(앱 미설치·알림 거부)에게만 링크를 SMS로 보낸다 — 아무 채널도
// 없으면 운영자가 "보냈다"고 믿는 사이 MD만 모르게 된다. booking-cancel과 같은 원칙.
// 실제 발송은 notifyAssignedMd(손님 "다시 요청"과 공용).
//
// Body: { request_type: "foreign" | "korean", request_id, kind: "proposal" | "confirmation" }
// 200: { ok: true, channel: "push" | "sms" }
// 400: md_required · 404: not_found / no_confirmation · 409: cancelled · 422: no_channel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { request_type?: string; request_id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { request_id: requestId, kind } = body;
  if (!requestId || (kind !== "proposal" && kind !== "confirmation")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const result = await notifyAssignedMd(createAdminClient(), {
    requestType: body.request_type === "korean" ? "korean" : "foreign",
    requestId,
    kind,
  });
  if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, channel: result.channel });
}
