// 제안서(/booking/proposal/{token})에서 MD가 승인/거절을 누르면 호출된다.
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

  const { data: reqRow } = await sb
    .from("foreign_requests")
    .select("id, guest_name, event_date, club_ids, selected_menu_total, budget, status")
    .eq("proposal_token", proposal_token)
    .maybeSingle();

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

  const { error: upErr } = await sb
    .from("foreign_requests")
    .update(patch)
    // 위에서 토큰으로 찾아낸 그 행. id를 다시 받지 않는다.
    .eq("id", reqRow.id);

  if (upErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
