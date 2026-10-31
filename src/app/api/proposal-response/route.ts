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
//   { proposal_token, action: "approve", table_choosable: boolean, table_options?: string, proposed_items?: string }
//     proposed_items — 주류 제안(MD 추천, selected_menu.md_recommend) 요청이면 필수(Migration 676)
//   { proposal_token, action: "reject", reason: "budget"|"absent"|"expired"|"other", required_amount?: number, reason_text?: string }
//     reason_text — reason이 "other"(직접 입력)면 필수(Migration 677)
// 200: { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoIssueConfirmation, sendBudgetEmail, sendSeatChoiceEmail } from "@/lib/booking/guestFlows";

const REJECT_LABEL: Record<string, string> = {
  budget: "금액 부족",
  absent: "당일 미출근",
  expired: "예약 만료",
  other: "기타",
};

export async function POST(req: NextRequest) {
  let body: {
    proposal_token?: string;
    action?: string;
    table_choosable?: boolean;
    table_options?: string;
    reason?: string;
    required_amount?: number;
    proposed_items?: string;
    reason_text?: string;
    /** 자리 목록에서 고른 자리(Migration 704) — 자리 목록이 없는 클럽은 table_options 글 */
    seats?: string[];
    /** 더 높은 금액이 오면 밀릴 수 있나 — 예약 가능 답변엔 필수 */
    bump_risk?: boolean;
    /** 금액 부족일 때 "이 조건이면 가능해요" */
    conditions?: string;
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
      .select("id, guest_name, event_date, club_ids, selected_menu, selected_menu_total, budget, status, assigned_md_id")
      .eq("proposal_token", proposal_token)
      .maybeSingle()
  ).data as {
    id: string;
    guest_name: string | null;
    club_ids: string[] | null;
    selected_menu: { md_recommend?: { budget: number } } | null;
    selected_menu_total: number | null;
    budget: number | null;
    status: string;
    assigned_md_id: string | null;
  } | null;

  if (!reqRow) {
    requestType = "korean";
    const { data } = await sb
      .from("korean_booking_requests")
      .select("id, guest_name, event_date, club_id, selected_menu, selected_menu_total, status, assigned_md_id")
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
    if (typeof body.bump_risk !== "boolean") {
      return NextResponse.json({ error: "bump_risk_required" }, { status: 400 });
    }
    const seats = Array.isArray(body.seats) ? body.seats.filter((x) => typeof x === "string" && x.trim()).slice(0, 80) : [];
    const options = (body.table_options ?? "").trim();
    if (body.table_choosable && seats.length === 0 && !options) {
      return NextResponse.json({ error: "seats_required" }, { status: 400 });
    }
    patch.md_table_choosable = body.table_choosable;
    patch.md_seats = body.table_choosable && seats.length ? seats : null;
    patch.md_table_options = body.table_choosable ? (seats.length ? seats.join(", ") : options) || null : null;
    patch.md_bump_risk = body.bump_risk;
    patch.md_conditions = null;
    // 새로 답하면 이전 손님 선택·재확인은 무효
    patch.guest_choice = null;
    patch.md_reconfirm_state = null;
    // 주류 제안 요청은 구성이 비어서 온다 — MD가 예산 안에서 드릴 구성을 적어야만
    // 승인된다. 안 그러면 손님은 뭘 받는지 모른 채 확정으로 넘어간다(Migration 676).
    const proposedItems = (body.proposed_items ?? "").trim();
    if (reqRow.selected_menu?.md_recommend && !proposedItems) {
      return NextResponse.json({ error: "proposed_items_required" }, { status: 400 });
    }
    patch.md_proposed_items = proposedItems || null;
    // 승인했으면 이전 거절 흔적은 지운다 — 안 그러면 화면에 둘 다 남아 헷갈린다.
    patch.md_reject_reason = null;
    patch.md_required_amount = null;
    patch.md_reject_note = null;
  } else {
    if (!body.reason || !REJECT_LABEL[body.reason]) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }
    // 직접 입력은 문장이 있어야 한다 — "기타"만 오면 운영자가 손님에게 전할 말이 없다.
    const rejectNote = (body.reason_text ?? "").trim().slice(0, 200);
    if (body.reason === "other" && !rejectNote) {
      return NextResponse.json({ error: "reason_text_required" }, { status: 400 });
    }
    patch.md_reject_reason = body.reason;
    patch.md_required_amount =
      body.reason === "budget" && body.required_amount ? body.required_amount : null;
    patch.md_reject_note = body.reason === "other" ? rejectNote : null;
    patch.md_conditions = body.reason === "budget" ? (body.conditions ?? "").trim().slice(0, 500) || null : null;
    patch.md_table_choosable = null;
    patch.md_table_options = null;
    patch.md_proposed_items = null;
    patch.md_seats = null;
    patch.md_bump_risk = null;
    patch.guest_choice = null;
    patch.md_reconfirm_state = null;
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

  // 외국인 요청은 담당자 답에 따라 손님 흐름을 바로 시작한다(2026-11-01) — 운영자가 옮겨 적지 않게.
  //   예약 가능 + 자리 → 자리 고르기 메일 / 예약 가능 + 당일 배정 → 예약 확인서 자동 발급
  //   받기 어려워요 · 금액 부족 → 금액 안내 메일(이 금액으로 진행 / WhatsApp / 취소)
  // 금액 부족이 아닌 거절은 손님에게 바로 보내지 않는다 — 운영자가 다른 담당자·클럽을 먼저 알아본다.
  let flowNote = "";
  if (requestType === "foreign") {
    try {
      if (action === "approve") {
        if (patch.md_table_choosable === false) {
          const r = await autoIssueConfirmation(sb, reqRow.id, "Assigned on the night (당일 배정)");
          flowNote = r.ok ? ` · 확인서 자동 발급 ${r.refNo}` : " · ⚠️ 확인서 자동 발급 실패";
        } else if ((patch.md_seats as string[] | null)?.length) {
          flowNote = (await sendSeatChoiceEmail(sb, reqRow.id)) ? " · 손님에게 자리 고르기 메일 발송" : " · ⚠️ 자리 고르기 메일 실패";
        } else {
          flowNote = " · 자리 목록이 없어 손님 안내는 직접";
        }
      } else if (patch.md_reject_reason === "budget" && patch.md_required_amount) {
        flowNote = (await sendBudgetEmail(sb, reqRow.id)) ? " · 손님에게 금액 안내 메일 발송" : " · ⚠️ 금액 안내 메일 실패";
      } else {
        flowNote = " · 손님 안내는 관리자 화면에서";
      }
    } catch (e) {
      console.error("[proposal-response] 손님 흐름 실패", e);
      flowNote = " · ⚠️ 손님 자동 안내 실패";
    }
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
    // 주류 제안 요청이면 MD가 적은 구성을 한 줄로 붙인다 — 알림만 보고도 손님에게 전달할 수 있게.
    const proposed = (patch.md_proposed_items as string | null)?.split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
    const bodyText = approved
      ? `${mdName}${clubName ? ` · ${clubName}` : ""} — ${guest}님 요청 예약 가능${proposed ? ` · 제안: ${proposed}` : ""}`
      : `${mdName}${clubName ? ` · ${clubName}` : ""} — ${guest}님 요청 받기 어려움 (${
          body.reason === "other" ? (patch.md_reject_note as string) : REJECT_LABEL[body.reason ?? ""] ?? body.reason
        })`;
    const bodyWithFlow = bodyText + flowNote;

    for (const admin of admins ?? []) {
      await sb.rpc("notify_user_push", {
        p_user_id: admin.id,
        p_title: approved ? "✅ MD 예약 가능" : "❌ MD 받기 어려움",
        p_body: bodyWithFlow,
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
