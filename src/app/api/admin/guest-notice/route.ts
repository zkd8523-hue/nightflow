// 파트너가 제안서를 거절한 한국 예약에, 운영자가 손님용 안내 문장을 보낸다(Migration 678).
//
// 거절 즉시 손님에게 자동으로 보내지 않는 이유 — 운영자가 다른 파트너로 돌려 다시 물을
// 수 있고(그 사이 손님이 "거절" 알림을 받으면 다른 데로 가버린다), 파트너 사유는
// 운영자에게 하는 말이라 손님에게 그대로 보이면 안 된다("당일 미출근" 등).
// 손님은 "내 예약"에서 이 문장과 함께 [N원으로 다시 주문]/[수정해서 다시 주문]/[취소]를 본다.
//
// 채널: 손님 앱 푸시(→ /my-bookings). 푸시가 없고 전화번호로 신청했으면 문자.
// 둘 다 없어도 문장은 저장된다(손님이 앱을 열면 보인다) — channel: "none"으로 알려
// 운영자가 인스타·오픈채팅으로 직접 연락하게 한다.
//
// Body: { request_id, message }
// 200: { ok: true, channel: "push" | "sms" | "none", guest_notice_at }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/notifications/alimtalk";

const SITE = "https://nightflow.kr";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { request_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = (body.message ?? "").trim().slice(0, 300);
  if (!body.request_id || !message) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const sb = createAdminClient();
  const { data: r } = await sb
    .from("korean_booking_requests")
    .select("id, user_id, status, md_response, contact_type, contact_value")
    .eq("id", body.request_id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });
  // 손님 화면의 "다시 주문" 버튼은 거절 상태에서만 동작한다 — 그 밖엔 안내를 막는다.
  if (r.md_response !== "rejected") return NextResponse.json({ error: "not_rejected" }, { status: 409 });

  const sentAt = new Date().toISOString();
  const { error: upErr } = await sb
    .from("korean_booking_requests")
    .update({ guest_notice: message, guest_notice_at: sentAt, updated_at: sentAt })
    .eq("id", r.id);
  if (upErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  const { count } = await sb
    .from("push_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", r.user_id);
  if ((count ?? 0) > 0) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: r.user_id,
      p_title: "📋 예약 답변이 도착했어요",
      p_body: message,
      p_data: { type: "booking_guest_notice", request_id: r.id },
      p_url: "/my-bookings",
      p_category: "transaction",
    });
    if (!error) return NextResponse.json({ ok: true, channel: "push", guest_notice_at: sentAt });
    console.error("[guest-notice] push 실패", r.user_id, error);
  }

  if (r.contact_type === "phone" && r.contact_value) {
    try {
      await sendSms(
        r.contact_value,
        `[나이트플로우] ${message}\n내 예약에서 바로 다시 주문할 수 있어요: ${SITE}/my-bookings`
      );
      return NextResponse.json({ ok: true, channel: "sms", guest_notice_at: sentAt });
    } catch (e) {
      console.error("[guest-notice] sms 실패", e);
    }
  }
  return NextResponse.json({ ok: true, channel: "none", guest_notice_at: sentAt });
}
