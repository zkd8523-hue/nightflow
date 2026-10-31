// 운영자가 외국인/한국 요청에 담당 MD와 확정 내용을 입력해 확인서를 발급한다.
// 요청(손님 희망)과 확정(MD 합의)을 분리해 저장 — 예산과 확정가가 섞이면 구분이 사라진다.
//
// 두 트랙(foreign_requests, korean_booking_requests)이 컬럼 구조는 같지만
// 테이블이 다르다 — request_type으로 분기한다(2026-09-06, Migration 654).
// booking_confirmations은 request_type+request_id 조합으로 1:1을 보장한다.
//
// POST Body: {
//   request_type?: "foreign" | "korean" (기본 foreign, 하위호환),
//   request_id, assigned_md_id?, club_id?, table_info?, capacity_note?,
//   includes?: string[], total_price?, confirmed_group_size?, arrival_time?, guest_request?, internal_memo?
// }
// 200: { ok: true, ref_no, public_token, url }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { saveConfirmation } from "@/lib/booking/confirmations";
import { notifyConfirmationChanged } from "@/lib/booking/guestFlows";

export async function POST(req: NextRequest) {
  // 인증 — admin만
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const requestId = body.request_id as string | undefined;
  if (!requestId) return NextResponse.json({ error: "request_id_required" }, { status: 400 });

  const requestType = body.request_type === "korean" ? "korean" : "foreign";
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  // foreign_requests는 club_ids(배열, 우선순위 최대 3곳), korean_booking_requests는
  // club_id(단일) — 조회 컬럼만 분기하고 이후 로직은 배열로 통일해 다룬다.
  const clubIdColumn = requestType === "korean" ? "club_id" : "club_ids";

  const sb = createAdminClient();

  const { data: reqRow, error: reqErr } = await sb
    .from(table)
    .select(`id, ${clubIdColumn}, event_date`)
    .eq("id", requestId)
    .single();
  if (reqErr || !reqRow) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }
  const reqClubIds =
    requestType === "korean"
      ? [(reqRow as unknown as { club_id: string }).club_id]
      : ((reqRow as unknown as { club_ids: string[] | null }).club_ids ?? []);

  // 담당 MD 지정 (요청 쪽에 저장 — 도착 알림이 여기를 읽는다)
  //
  // MD를 "다른 사람으로" 바꾸면 이전 MD의 응답은 무효다. 예전엔 assigned_md_id만
  // 갈아끼워서, A가 거절한 뒤 B로 바꿔도 B가 받은 제안서에 A의 거절이 그대로
  // 떠 있었다(2026-09-06). 응답 흔적을 지우고 proposal_token도 새로 발급한다 —
  // 토큰을 유지하면 A가 예전에 받은 링크로 계속 답할 수 있어, 담당이 아닌
  // 사람의 응답이 덮어써진다.
  if (body.assigned_md_id !== undefined) {
    const nextMdId = (body.assigned_md_id as string | null) || null;

    const { data: prev } = await sb
      .from(table)
      .select("assigned_md_id")
      .eq("id", requestId)
      .single();

    const mdChanged = (prev?.assigned_md_id ?? null) !== nextMdId;

    const assignPatch: Record<string, unknown> = {
      assigned_md_id: nextMdId,
      updated_at: new Date().toISOString(),
    };

    if (mdChanged) {
      assignPatch.md_response = null;
      assignPatch.md_responded_at = null;
      assignPatch.md_reject_reason = null;
      assignPatch.md_required_amount = null;
      assignPatch.md_table_choosable = null;
      assignPatch.md_table_options = null;
      assignPatch.md_proposed_items = null;
      assignPatch.md_reject_note = null;
      // 새 담당자에게는 아직 안 보냈다 — 이전 담당자 기준 "보낸 지 N시간"이 남지 않게(Migration 700).
      assignPatch.proposal_sent_at = null;
      assignPatch.proposal_reminded_at = null;
      assignPatch.proposal_admin_alerts = 0;
      // 새 토큰 — 이전 MD가 들고 있는 링크는 그 즉시 죽는다(404).
      assignPatch.proposal_token = randomBytes(16).toString("hex");
    }

    const { data: assigned } = await sb
      .from(table)
      .update(assignPatch)
      .eq("id", requestId)
      .select("proposal_token")
      .single();

    // 제안서 카드의 "받는 MD" 지정은 확정서와 무관한 단계다 — 확정 내용이 하나도
    // 없는데 여기서 확정서를 만들면 목록이 그 건을 "완료"로 분류해 버린다.
    // MD 지정만 온 호출이면 여기서 끝낸다(2026-09-06).
    const confirmationFields = [
      "club_id", "table_info", "capacity_note", "confirmed_group_size",
      "includes", "total_price", "arrival_time", "guest_request", "internal_memo",
    ];
    const hasConfirmationInput = confirmationFields.some((k) => body[k] !== undefined);
    if (!hasConfirmationInput) {
      return NextResponse.json({
        ok: true,
        assigned_md_id: nextMdId,
        proposal_token: assigned?.proposal_token ?? null,
        md_response_reset: mdChanged,
      });
    }
  }

  // 확정 클럽 — 미지정이면 요청의 1순위를 쓴다.
  const clubId = (body.club_id as string | undefined) || reqClubIds[0] || null;

  // 저장·변경 이력·요청 완료 처리는 자동 발급과 같은 규칙(saveConfirmation, 2026-11-01).
  // 손님 알림은 여기서 보내지 않는다 — "확인서 보내기"(/api/admin/notify-md) 하나로 MD·손님 모두에게.
  // 단, 이미 보낸 확인서의 금액·자리·구성을 고치면서 "손님에게 변경 알림"을 체크했으면 변경 안내를 보낸다.
  let saved: Awaited<ReturnType<typeof saveConfirmation>>;
  try {
    saved = await saveConfirmation(sb, {
      requestType,
      requestId,
      createdBy: user.id,
      source: "admin",
      changeNote: (body.change_note as string) || null,
      changeReason: (body.change_note as string) || null,
      fields: {
        club_id: clubId,
        table_info: (body.table_info as string) || null,
        capacity_note: (body.capacity_note as string) || null,
        confirmed_group_size: (body.confirmed_group_size as string) || null,
        includes: (body.includes as string[]) ?? [],
        total_price: (body.total_price as number) || null,
        arrival_time: (body.arrival_time as string) || null,
        guest_request: (body.guest_request as string) || null,
        internal_memo: (body.internal_memo as string) || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "save_failed" }, { status: 500 });
  }

  let changeNotified = false;
  if (saved.changed && body.notify_change === true) {
    changeNotified = await notifyConfirmationChanged(sb, requestType, requestId).catch((e) => {
      console.error("[admin/booking] 변경 안내 실패", e);
      return false;
    });
  }

  return NextResponse.json({
    ok: true,
    changed: saved.changed,
    change_notified: changeNotified,
    ref_no: saved.ref_no,
    public_token: saved.public_token,
    md_token: saved.md_token,
    url: `/booking/${saved.public_token}`,
    md_url: `/booking/md/${saved.md_token}`,
  });
}
