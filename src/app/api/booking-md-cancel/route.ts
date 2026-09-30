// 파트너(MD)가 MD용 확정서(/booking/md/[token])에서 "예약 취소"를 누르면 호출된다.
// 예전엔 클럽 쪽에서 확정된 예약을 취소할 방법이 아예 없어서, 사정이 생기면 운영자에게
// 따로 연락해야 했다(2026-09-30). md_token으로 본인 예약임을 확인한다 — 입장 완료
// (/api/md-checkin)와 같은 인증 방식(로그인 없이 링크만 아는 담당자가 접근하는 구조).
//
// 알림:
//   - 손님: 앱 푸시 + 벨 알림. 파트너가 적은 사유는 보여주지 않고 "클럽 사정으로
//     취소됐다"는 안내만 보낸다 — 운영자에게 하는 말이라 표현이 거칠 수 있다.
//     푸시가 없고 전화번호로 신청한 한국 손님이면 문자로 대신 보낸다.
//   - 운영자: 사유를 포함해 푸시(없으면 문자). 대체 클럽 안내 등 후속 응대를 한다.
//
// 이미 손님이 "도착"을 눌렀거나 입장 완료된 예약은 취소하지 않는다(현장에서 진행 중).
//
// Body: { md_token: string, reason: string }
// 200: { ok: true } | { ok: true, already: true }
// 409: already_arrived

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/notifications/alimtalk";

const SITE = "https://nightflow.kr";
const DOW = "일월화수목금토";
// 운영자 문자 대체 수신 번호 — 도착 알림·손님 취소(/api/booking-cancel)와 같은 환경변수.
const ADMIN_PHONES = (process.env.ARRIVAL_ADMIN_PHONES ?? "01022051052")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function POST(req: NextRequest) {
  let body: { md_token?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const reason = (body.reason ?? "").trim().slice(0, 200);
  if (!body.md_token || !reason) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const sb = createAdminClient();
  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("request_id, request_type, ref_no, club_id, confirmed_group_size, public_token, md_checked_in_at")
    .eq("md_token", body.md_token)
    .maybeSingle();
  if (!conf) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requestType = conf.request_type === "korean" ? "korean" : "foreign";
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  const { data: rawReq } = await sb
    .from(table)
    .select(`id, user_id, guest_name, event_date, group_size, status, contact_type, contact_value, ${requestType === "korean" ? "club_id" : "club_ids"}`)
    .eq("id", conf.request_id)
    .single();
  if (!rawReq) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = rawReq as unknown as {
    id: string;
    user_id: string;
    guest_name: string | null;
    event_date: string;
    group_size: number;
    status: string;
    contact_type: string;
    contact_value: string | null;
    club_id?: string | null;
    club_ids?: string[] | null;
  };
  if (r.status === "cancelled") return NextResponse.json({ ok: true, already: true });

  // 이미 현장에서 진행 중인 예약(입장 완료 또는 손님 "도착")은 취소 대상이 아니다.
  const { count: arrived } = await sb
    .from("arrival_pings")
    .select("*", { count: "exact", head: true })
    .eq("request_type", requestType)
    .eq("request_id", r.id)
    .eq("kind", "arrived");
  if (conf.md_checked_in_at || (arrived ?? 0) > 0) {
    return NextResponse.json({ error: "already_arrived" }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from(table)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", r.id)
    .neq("status", "cancelled")
    .select("id");
  if (updErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  // 동시에 두 번 눌렸으면 먼저 처리된 쪽만 알림을 보낸다.
  if (!updated || updated.length === 0) return NextResponse.json({ ok: true, already: true });

  const clubId = conf.club_id ?? (requestType === "korean" ? r.club_id : r.club_ids?.[0]) ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };
  const d = new Date(r.event_date + "T00:00:00");
  const dateText = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const rawSize = (conf.confirmed_group_size ?? String(r.group_size)).trim();
  const sizeText = /^\d+$/.test(rawSize) ? `${rawSize}명` : rawSize;
  const clubName = club?.name ?? "클럽";
  const guest = r.guest_name?.trim() || "게스트";

  const hasPush = async (userId: string) => {
    const { count } = await sb
      .from("push_tokens")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    return (count ?? 0) > 0;
  };

  // 손님 — 사유는 빼고 안내만.
  const guestTitle = "예약이 취소됐어요";
  const guestText = `${clubName} ${dateText} ${sizeText} 예약이 클럽 사정으로 취소됐어요. 나플에서 곧 연락드릴게요. (${conf.ref_no})`;
  const guestPath = `/booking/${conf.public_token}`;
  try {
    // 벨 알림 — 'cancellation_confirmed'는 in_app_notifications.type CHECK에 이미 있는 값.
    await sb.from("in_app_notifications").insert({
      user_id: r.user_id,
      type: "cancellation_confirmed",
      title: guestTitle,
      message: guestText,
      action_url: requestType === "korean" ? "/my-bookings" : guestPath,
    });
  } catch (e) {
    console.error("[booking-md-cancel] 손님 인앱 알림 실패", e);
  }
  let guestNotified = false;
  if (await hasPush(r.user_id)) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: r.user_id,
      p_title: `❌ ${guestTitle}`,
      p_body: guestText,
      p_data: { type: "booking_cancelled_by_md", request_id: r.id },
      p_url: requestType === "korean" ? "/my-bookings" : guestPath,
      p_category: "transaction",
    });
    guestNotified = !error;
    if (error) console.error("[booking-md-cancel] 손님 push 실패", error);
  }
  if (!guestNotified && requestType === "korean" && r.contact_type === "phone" && r.contact_value) {
    try {
      await sendSms(r.contact_value, `[나이트플로우] ${guest}님, ${guestText}\n${SITE}/my-bookings`);
    } catch (e) {
      console.error("[booking-md-cancel] 손님 sms 실패", e);
    }
  }

  // 운영자 — 사유 포함, 대체 클럽 안내 등 후속 응대용.
  const adminText = `${requestType === "foreign" ? "[외국인] " : ""}${clubName} ${guest}님 ${sizeText} ${dateText} 예약을 파트너가 취소했어요 — 사유: ${reason} (${conf.ref_no})`;
  let adminNotified = false;
  const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
  for (const a of admins ?? []) {
    if (!(await hasPush(a.id))) continue;
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: a.id,
      p_title: "❌ 파트너 예약 취소",
      p_body: adminText,
      p_data: { type: "booking_cancelled_by_md", request_id: r.id },
      p_url: requestType === "korean" ? "/admin/korean-bookings" : "/admin/foreign",
      p_category: "transaction",
    });
    if (!error) adminNotified = true;
  }
  if (!adminNotified) {
    for (const phone of ADMIN_PHONES) {
      try {
        await sendSms(phone, `[나이트플로우] ${adminText}`);
      } catch (e) {
        console.error("[booking-md-cancel] 운영자 sms 실패", phone, e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
