// 손님이 예약 확인서(/booking/[token])에서 "예약 취소"를 누르면 호출된다.
// 비로그인 링크라 public_token을 아는 사람만 취소할 수 있다(확인서 조회와 같은 기준).
//
// 한국 예약(korean_booking_requests)과 외국인 요청(foreign_requests) 둘 다 받는다.
// 외국인 요청은 원래 운영자 전담이라 본인 취소가 없었지만(Migration 653 주석),
// 확인서에서 손님이 직접 취소하고 운영자·MD가 즉시 알림을 받게 넓혔다(2026-09-30).
//
// Migration 653은 운영자가 연락하기 전(status='new')까지만 본인 취소를 허용하고
// 그 뒤로는 고객센터 안내였다 — MD와 이미 얘기가 오간 뒤 조용히 취소되면 MD만
// 모르고 자리를 잡아두기 때문. 확인서에서 취소를 여는 대신 담당 MD와 운영자에게
// 즉시 푸시를 보내 그 문제를 막는다(2026-09-30). 푸시 토큰이 없는 사람에게만
// SMS로 대신 보낸다 — 아무 채널도 없으면 취소가 조용히 묻히기 때문.
//
// 취소 사유(Migration 686): 손님이 고른 코드(cancel_reason)와 '기타' 직접 입력
// (cancel_note)을 원본 요청에 같이 남긴다 — 취소 이유 데이터 수집용. 사유는 MD·운영자
// 알림 문구에도 붙인다. 옛 화면에서 사유 없이 들어오는 요청도 취소는 막지 않는다.
//
// Body: { public_token: string, reason?: string, note?: string }
// 200: { ok: true, notified: { admin, md } } | { ok: true, already: true }
// 409: 지난 예약 · 이미 입장한 예약

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/notifications/alimtalk";
import { isGuestCancelReason, cancelReasonLabel } from "@/lib/booking/cancelReasons";

// 운영자 SMS 대체 수신 번호 — 도착 알림(/api/arrival)과 같은 환경변수.
const ADMIN_PHONES = (process.env.ARRIVAL_ADMIN_PHONES ?? "01022051052")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DOW = "일월화수목금토";

export async function POST(req: NextRequest) {
  let body: { public_token?: string; reason?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const token = body.public_token;
  if (!token) return NextResponse.json({ error: "bad_params" }, { status: 400 });
  const reason = isGuestCancelReason(body.reason) ? body.reason : null;
  const note = (body.note ?? "").trim().slice(0, 300) || null;

  const sb = createAdminClient();

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("request_id, request_type, ref_no, club_id, confirmed_group_size, md_token")
    .eq("public_token", token)
    .maybeSingle();
  if (!conf) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 원본 테이블 분기 — 한국은 club_id(단일), 외국인은 club_ids(배열).
  const requestType = conf.request_type === "korean" ? "korean" : "foreign";
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  const { data: rawReq } = await sb
    .from(table)
    .select(`id, guest_name, event_date, group_size, status, assigned_md_id, ${requestType === "korean" ? "club_id" : "club_ids"}`)
    .eq("id", conf.request_id)
    .single();
  if (!rawReq) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const reqRow = rawReq as unknown as {
    id: string;
    guest_name: string | null;
    event_date: string;
    group_size: number;
    status: string;
    assigned_md_id: string | null;
    club_id?: string | null;
    club_ids?: string[] | null;
  };
  if (reqRow.status === "cancelled") return NextResponse.json({ ok: true, already: true });

  // 지난 예약은 취소 대상이 아니다(클럽은 한국에 있으니 KST 기준).
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  if (reqRow.event_date < todayKst) {
    return NextResponse.json({ error: "past_event" }, { status: 409 });
  }
  // 입구에서 "도착"까지 누른 예약은 이미 진행 중이다.
  const { count: arrived } = await sb
    .from("arrival_pings")
    .select("*", { count: "exact", head: true })
    .eq("request_type", requestType)
    .eq("request_id", reqRow.id)
    .eq("kind", "arrived");
  if ((arrived ?? 0) > 0) {
    return NextResponse.json({ error: "already_arrived" }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from(table)
    .update({
      status: "cancelled",
      cancelled_by: "guest",
      cancel_reason: reason,
      cancel_note: note,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reqRow.id)
    .neq("status", "cancelled")
    .select("id");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  // 동시에 두 번 눌렸으면 먼저 처리된 쪽이 알림을 보낸다.
  if (!updated || updated.length === 0) return NextResponse.json({ ok: true, already: true });

  // 알림 문구 — 도착 알림과 같은 틀.
  const clubId = conf.club_id ?? (requestType === "korean" ? reqRow.club_id : reqRow.club_ids?.[0]) ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };
  const d = new Date(reqRow.event_date + "T00:00:00");
  const dateText = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const rawSize = (conf.confirmed_group_size ?? String(reqRow.group_size)).trim();
  const sizeText = /^\d+$/.test(rawSize) ? `${rawSize}명` : rawSize;
  const guest = reqRow.guest_name?.trim() || "게스트";
  const reasonText = reason ? ` 사유: ${reason === "other" && note ? note : cancelReasonLabel(reason)}` : "";
  const text =
    `${requestType === "foreign" ? "[외국인] " : ""}${club?.name ? `${club.name} ` : ""}${guest}님 ${sizeText} ${dateText} 예약을 손님이 취소했어요.${reasonText} (${conf.ref_no})`;

  const hasPush = async (userId: string) => {
    const { count } = await sb
      .from("push_tokens")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    return (count ?? 0) > 0;
  };
  const push = async (userId: string, url: string) => {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: userId,
      p_title: "❌ 예약 취소",
      p_body: text,
      p_data: { type: "booking_cancel", request_id: reqRow.id },
      p_url: url,
      p_category: "transaction",
    });
    if (error) console.error("[booking-cancel] push 실패", userId, error);
    return !error;
  };

  // 담당 MD
  let notifiedMd = false;
  if (reqRow.assigned_md_id) {
    const mdId = reqRow.assigned_md_id;
    if (await hasPush(mdId)) {
      notifiedMd = await push(mdId, conf.md_token ? `/booking/md/${conf.md_token}` : "/md/dashboard");
    }
    if (!notifiedMd) {
      const { data: md } = await sb.from("users").select("phone").eq("id", mdId).single();
      if (md?.phone) {
        try {
          await sendSms(md.phone, `[나이트플로우] ${text}`);
          notifiedMd = true;
        } catch (e) {
          console.error("[booking-cancel] md sms 실패", e);
        }
      }
    }
  }

  // 운영자 — 앱 푸시가 연결된 관리자 계정 전부. 운영 계정도 is_test로 표시돼
  // 있어서 is_test로 거르지 않는다.
  let notifiedAdmin = false;
  const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
  for (const a of admins ?? []) {
    if (await hasPush(a.id)) {
      if (await push(a.id, requestType === "korean" ? "/admin/korean-bookings" : "/admin/foreign")) notifiedAdmin = true;
    }
  }
  if (!notifiedAdmin) {
    for (const phone of ADMIN_PHONES) {
      try {
        await sendSms(phone, `[나이트플로우] ${text}`);
        notifiedAdmin = true;
      } catch (e) {
        console.error("[booking-cancel] admin sms 실패", phone, e);
      }
    }
  }

  return NextResponse.json({ ok: true, notified: { admin: notifiedAdmin, md: notifiedMd } });
}
