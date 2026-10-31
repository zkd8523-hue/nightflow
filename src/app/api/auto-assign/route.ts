// 요청 자동 지정(2026-11-01) — 요청 INSERT 트리거(Migration 703)가 service_role_key를 Bearer로 실어 호출한다.
//
// 그 클럽의 대표 담당자(clubs.representative_md_id)를 지정하고 제안서를 보낸다(notifyAssignedMd — 푸시, 없으면 문자).
// 예산·날짜 조건은 없다(사용자 결정). 대신 아래는 자동으로 보내지 않고 운영자에게 넘긴다:
//   - 같은 연락처·날짜·클럽으로 24시간 안에 이미 들어온 요청(중복) → 지정 없이 운영자 푸시
//   - 대표 담당자가 그 클럽 파트너에서 빠진 경우 → 지정 없이 운영자 푸시
//   - 담당자에게 아무 채널로도 닿지 않은 경우 → 지정은 남기고 운영자 푸시
// 이미 담당자가 있거나 취소된 요청은 건너뛴다(트리거 재호출·수동 지정과 겹쳐도 안전).
//
// Body: { request_type: "foreign" | "korean", request_id }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";

type Req = {
  id: string;
  guest_name: string | null;
  event_date: string;
  group_size: number;
  status: string;
  assigned_md_id: string | null;
  contact_value: string | null;
  created_at: string;
  club_id?: string | null;
  club_ids?: string[] | null;
};

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || req.headers.get("authorization")?.trim() !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { request_type?: string; request_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const requestType = body.request_type === "korean" ? "korean" : "foreign";
  if (!body.request_id) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const sb = createAdminClient();
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  const clubCol = requestType === "korean" ? "club_id" : "club_ids";

  const { data: raw } = await sb
    .from(table)
    .select(`id, guest_name, event_date, group_size, status, assigned_md_id, contact_value, created_at, ${clubCol}`)
    .eq("id", body.request_id)
    .maybeSingle();
  if (!raw) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = raw as unknown as Req;
  if (r.assigned_md_id || r.status === "cancelled") return NextResponse.json({ ok: true, skipped: "already_handled" });

  const clubId = requestType === "korean" ? r.club_id : r.club_ids?.[0];
  if (!clubId) return NextResponse.json({ ok: true, skipped: "no_club" });
  const { data: club } = await sb.from("clubs").select("name, representative_md_id").eq("id", clubId).maybeSingle();
  const mdId = club?.representative_md_id as string | null | undefined;
  if (!mdId) return NextResponse.json({ ok: true, skipped: "no_representative" });

  const adminUrl = requestType === "korean" ? "/admin/korean-bookings" : "/admin/foreign";
  const who = `${club?.name ?? "클럽"} · ${r.guest_name?.trim() || "게스트"}님 ${r.group_size}명 ${r.event_date.slice(5).replace("-", "/")}`;
  const pushAdmins = async (title: string, text: string) => {
    const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
    for (const a of admins ?? []) {
      const { error } = await sb.rpc("notify_user_push", {
        p_user_id: a.id, p_title: title, p_body: text,
        p_data: { type: "auto_assign", request_id: r.id }, p_url: adminUrl, p_category: "transaction",
      });
      if (error) console.error("[auto-assign] admin push 실패", a.id, error);
    }
  };

  // 대표 담당자가 아직 그 클럽 파트너인지 — 클럽을 떠난 사람에게 손님 요청이 가면 안 된다.
  const { count: partner } = await sb
    .from("club_partners").select("*", { count: "exact", head: true })
    .eq("club_id", clubId).eq("md_id", mdId);
  if (!partner) {
    await pushAdmins("⚠️ 자동 지정 안 됨", `${who} — 대표 담당자가 클럽 파트너에서 빠져 있어요. 직접 지정해주세요.`);
    return NextResponse.json({ ok: true, skipped: "representative_not_partner" });
  }

  // 중복 — 같은 연락처·날짜·클럽으로 24시간 안에 들어온 다른 요청이 있으면 담당자에게 두 번 보내지 않는다.
  const contact = r.contact_value?.trim();
  if (contact) {
    const since = new Date(new Date(r.created_at).getTime() - 24 * 3600_000).toISOString();
    let q = sb.from(table).select("id", { count: "exact", head: true })
      .neq("id", r.id).neq("status", "cancelled")
      .ilike("contact_value", contact).eq("event_date", r.event_date).gte("created_at", since);
    q = requestType === "korean" ? q.eq("club_id", clubId) : q.contains("club_ids", [clubId]);
    const { count: dup } = await q;
    if (dup) {
      await pushAdmins("⚠️ 중복 요청 · 자동 발송 안 함", `${who} — 같은 손님이 같은 날짜로 또 요청했어요. 확인 후 정리해주세요.`);
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }
  }

  // 지정 — 동시에 운영자가 수동 지정했으면 덮어쓰지 않는다(assigned_md_id IS NULL 조건).
  const { data: claimed } = await sb.from(table)
    .update({ assigned_md_id: mdId, updated_at: new Date().toISOString() })
    .eq("id", r.id).is("assigned_md_id", null)
    .select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ ok: true, skipped: "assigned_meanwhile" });

  const result = await notifyAssignedMd(sb, { requestType, requestId: r.id, kind: "proposal" });
  if (!result.ok) {
    await pushAdmins("⚠️ 자동 제안서 발송 실패", `${who} — 담당자에게 앱 알림도 문자도 안 갔어요. 직접 연락해주세요.`);
    return NextResponse.json({ ok: true, assigned: mdId, sent: false, error: "error" in result ? result.error : "failed" });
  }
  return NextResponse.json({ ok: true, assigned: mdId, sent: true, channel: result.channel });
}
