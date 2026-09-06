// 제안서(/booking/proposal/{token})에서 MD가 승인/거절을 누르면 호출된다.
// 외국인 요청(foreign_requests)과 한국 예약 요청(korean_booking_requests)
// 두 트랙 모두 이 라우트를 공유한다 — proposal_token은 두 테이블 다 UNIQUE라
// 어느 테이블에서 찾았는지로 request_type을 판별한다(2026-09-06, Migration 654).
//
// 인증: proposal_token(무작위 16바이트)을 가진 사람 = 운영자가 링크를 보낸 MD.
// 확정서(md_token)와 같은 원칙 — 로그인 없이 카톡으로 받은 링크만으로 바로 답할
// 수 있어야 회신율이 산다. 다만 예약 id를 열쇠로 쓰면 안 된다(id는 식별자지
// 비밀이 아니라, 하나를 받은 사람이 다른 예약도 열 수 있다) — Migration 648.
//
// Body:
//   { proposal_token, action: "approve", table_choosable: boolean, table_options?: string }
//   { proposal_token, action: "reject", reason: "budget"|"absent"|"expired", required_amount?: number }
// 200: { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REJECT_LABEL: Record<string, string> = {
  budget: "금액 부족",
  absent: "당일 미출근",
  expired: "예약 만료",
};

export async function POST(req: NextRequest) {
  let body: {
    proposal_token?: string;
    action?: string;
    table_choosable?: boolean;
    table_options?: string;
    reason?: string;
    required_amount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { proposal_token, action } = body;
  if (!proposal_token || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();

  let requestType: "foreign" | "korean" = "foreign";
  let reqRow = (
    await sb
      .from("foreign_requests")
      .select("id, guest_name, event_date, club_ids, selected_menu_total, budget, status, assigned_md_id")
      .eq("proposal_token", proposal_token)
      .maybeSingle()
  ).data as {
    id: string;
    guest_name: string | null;
    club_ids: string[] | null;
    selected_menu_total: number | null;
    budget: number | null;
    status: string;
    assigned_md_id: string | null;
  } | null;

  if (!reqRow) {
    requestType = "korean";
    const { data } = await sb
      .from("korean_booking_requests")
      .select("id, guest_name, event_date, club_id, selected_menu_total, status, assigned_md_id")
      .eq("proposal_token", proposal_token)
      .maybeSingle();
    reqRow = data
      ? { ...data, club_ids: data.club_id ? [data.club_id] : [], budget: null }
      : null;
  }

  if (!reqRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (reqRow.status === "cancelled") {
    return NextResponse.json({ error: "cancelled" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {
    md_response: action === "approve" ? "approved" : "rejected",
    md_responded_at: new Date().toISOString(),
  };

  if (action === "approve") {
    // 손님이 테이블을 고를 수 있는지는 승인의 핵심 조건이라 반드시 받는다.
    if (typeof body.table_choosable !== "boolean") {
      return NextResponse.json({ error: "table_choosable_required" }, { status: 400 });
    }
    patch.md_table_choosable = body.table_choosable;
    patch.md_table_options = body.table_choosable
      ? (body.table_options ?? "").trim() || null
      : null;
    // 승인했으면 이전 거절 흔적은 지운다 — 안 그러면 화면에 둘 다 남아 헷갈린다.
    patch.md_reject_reason = null;
    patch.md_required_amount = null;
  } else {
    if (!body.reason || !REJECT_LABEL[body.reason]) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }
    patch.md_reject_reason = body.reason;
    patch.md_required_amount =
      body.reason === "budget" && body.required_amount ? body.required_amount : null;
    patch.md_table_choosable = null;
    patch.md_table_options = null;
  }

  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  const { error: upErr } = await sb
    .from(table)
    .update(patch)
    // 위에서 토큰으로 찾아낸 그 행. id를 다시 받지 않는다.
    .eq("id", reqRow.id);

  if (upErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // 어드민에게 앱 푸시로 알린다 — 예전엔 여기 알림이 아예 없어서 MD가 답해도
  // 운영자가 화면을 직접 열어보기 전엔 몰랐다(2026-09-06). role='admin'인
  // 모든 계정에 보낸다 — 운영자가 여러 명일 수 있고, 누가 지금 당직인지
  // 이 라우트가 알 방법이 없다.
  try {
    const [{ data: admins }, club, md] = await Promise.all([
      sb.from("users").select("id").eq("role", "admin"),
      (async () => {
        const clubId = (reqRow.club_ids as string[] | null)?.[0];
        if (!clubId) return null;
        const { data } = await sb.from("clubs").select("name").eq("id", clubId).single();
        return data;
      })(),
      (async () => {
        if (!reqRow.assigned_md_id) return null;
        const { data } = await sb.from("users").select("name").eq("id", reqRow.assigned_md_id).single();
        return data;
      })(),
    ]);

    const approved = action === "approve";
    const guest = reqRow.guest_name?.trim() || "게스트";
    const mdName = md?.name ?? "미지정 MD";
    const clubName = club?.name ?? "";
    const bodyText = approved
      ? `${mdName}${clubName ? ` · ${clubName}` : ""} — ${guest}님 요청 승인`
      : `${mdName}${clubName ? ` · ${clubName}` : ""} — ${guest}님 요청 거절 (${REJECT_LABEL[body.reason ?? ""] ?? body.reason})`;

    for (const admin of admins ?? []) {
      await sb.rpc("notify_user_push", {
        p_user_id: admin.id,
        p_title: approved ? "✅ MD 승인" : "❌ MD 거절",
        p_body: bodyText,
        p_data: { type: "proposal_response", request_id: reqRow.id, action },
        p_url: requestType === "korean" ? "/admin/korean-bookings" : "/admin/foreign",
        p_category: "transaction",
      });
    }
  } catch (e) {
    // 알림 실패로 MD 응답 저장 자체가 실패하면 안 된다 — 이미 patch는 끝났다.
    console.error("[proposal-response] admin push 실패", e);
  }

  return NextResponse.json({ ok: true });
}
