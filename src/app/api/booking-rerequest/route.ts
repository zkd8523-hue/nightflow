// 손님이 "내 예약"에서 거절 안내를 보고 조건을 바꿔 다시 주문한다(Migration 678).
// 담당 파트너는 그대로 두고 — 운영자가 이미 지정한 담당이라 새로 고를 필요가 없다 —
// MD의 이전 응답만 지우고 제안서 알림을 다시 보낸다. 운영자에게도 알림이 간다.
//
// 로그인 필수(본인 예약만). status='cancelled'거나 md_response가 'rejected'가
// 아니면(아직 거절 안 됐거나 이미 승인/확정) 다시 주문할 수 없다 — 진행 중인
// 제안서를 덮어쓰면 파트너가 뭘 보고 있는지 꼬인다.
//
// Body: { request_id, event_date?, group_size?, budget? }
//   필드를 생략하면 기존 값을 유지한 채 그대로 재전송(=금액 제안 그대로 수락 버튼용).
// 200: { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { request_id?: string; event_date?: string; group_size?: number; budget?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.request_id) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const sb = createAdminClient();
  const { data: r } = await sb
    .from("korean_booking_requests")
    .select("id, user_id, status, md_response, assigned_md_id, selected_menu, selected_menu_total")
    .eq("id", body.request_id)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (r.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });
  if (r.md_response !== "rejected") return NextResponse.json({ error: "not_rejected" }, { status: 409 });

  const patch: Record<string, unknown> = {
    md_response: null,
    md_responded_at: null,
    md_table_choosable: null,
    md_table_options: null,
    md_reject_reason: null,
    md_reject_note: null,
    md_required_amount: null,
    md_proposed_items: null,
    guest_notice: null,
    guest_notice_at: null,
    // 파트너가 예전 링크로 옛 거절을 다시 보내는 걸 막는다 — MD 재지정과 같은 원칙
    // (/api/admin/booking assignPatch.proposal_token).
    proposal_token: randomBytes(16).toString("hex"),
    updated_at: new Date().toISOString(),
  };
  if (body.event_date) patch.event_date = body.event_date;
  if (body.group_size) patch.group_size = Math.max(1, Math.min(20, body.group_size));
  // 예산(MD 추천 요청)만 다시 협상 대상이다 — 손님이 직접 고른 구성(selected_menu.items)은
  // 이 화면에서 바꾸지 않는다. 예산 갱신은 md_recommend 스냅샷에만 반영.
  if (body.budget && r.selected_menu?.md_recommend) {
    patch.selected_menu = { ...r.selected_menu, md_recommend: { budget: body.budget } };
    patch.selected_menu_total = null;
  }

  const { error: upErr } = await sb.from("korean_booking_requests").update(patch).eq("id", r.id);
  if (upErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  if (r.assigned_md_id) {
    const result = await notifyAssignedMd(sb, {
      requestType: "korean",
      requestId: r.id,
      kind: "proposal",
      revised: true,
    });
    if (result.ok === false) console.error("[booking-rerequest] MD 알림 실패", result.error);
  }

  // 운영자에게도 알림 — 손님이 조건을 바꿨으니 다시 지켜봐야 한다.
  try {
    const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
    for (const a of admins ?? []) {
      await sb.rpc("notify_user_push", {
        p_user_id: a.id,
        p_title: "🔁 손님이 다시 주문했어요",
        p_body: "조건을 바꿔 같은 파트너에게 다시 제안서를 보냈어요.",
        p_data: { type: "booking_rerequest", request_id: r.id },
        p_url: "/admin/korean-bookings",
        p_category: "transaction",
      });
    }
  } catch (e) {
    console.error("[booking-rerequest] admin push 실패", e);
  }

  return NextResponse.json({ ok: true });
}
