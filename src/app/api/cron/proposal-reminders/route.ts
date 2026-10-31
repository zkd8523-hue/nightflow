// 제안서 무응답 재알림(2026-11-01) — pg_cron(Migration 701)이 5분마다 service_role_key를 Bearer로 실어 호출한다.
//
// 제안서를 보냈는데(proposal_sent_at) 담당 MD 답이 없으면
//   당일 요청(영업일 기준, 새벽 6시 경계) → 15분: 담당 MD 재알림 + 운영자 푸시 1회
//   그 외 → 3시간: 담당 MD 재알림 + 운영자 푸시 / 6시간·24시간: 운영자 푸시만 (Migration 702)
// 담당 MD 재알림은 notifyAssignedMd reminder(푸시, 없으면 문자), 운영자는 role=admin 전원 푸시.
// 몇 번 보냈는지는 proposal_admin_alerts로 센다. 제안서를 새로 보내거나 담당이 바뀌면 0으로 돌아간다.
// 다른 담당자로 넘기기는 아직 없다(2순위 미정).
//
// 같은 cron이 손님 쪽도 본다(2026-11-01): 손님에게 행동을 요청한 메일(자리 고르기·금액 안내·밀림)을 보냈는데
// 손님이 버튼을 안 눌렀으면 운영자에게 "메일을 못 보고 있을 수 있어요 — WhatsApp으로 한 번 더"를 알린다.
// 기준은 당일 30분 / 그 외 3시간, 한 건당 한 번. 메일 앱의 "열람" 기록은 믿지 않고(아이폰이 자동으로 찍는다)
// 실제로 버튼을 누른 기록(guest_responded_at)만 본다. 밀림은 답 기한이 지나면 만료로 닫고 담당자·운영자에게 알린다.
//
// GET/POST ?dry=1 → 보내지 않고 대상만 돌려준다

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssignedMd } from "@/lib/booking/notifyMd";
import { flowWho, loadClub, loadForeignReq, notifyMd, pushAdmins, respondUrl } from "@/lib/booking/guestFlows";

// 운영자 알림 단계(분). 첫 단계에서만 담당 MD에게도 다시 알린다.
const SAME_DAY_STEPS = [15];
const OTHER_DAY_STEPS = [180, 360, 1440];

type Row = {
  id: string;
  guest_name: string | null;
  event_date: string;
  group_size: number;
  assigned_md_id: string;
  proposal_sent_at: string;
  proposal_admin_alerts: number;
  club_id?: string | null;
  club_ids?: string[] | null;
};

/** 영업일(KST, 새벽 6시 경계) — 새벽 3시에 들어온 "오늘" 요청은 어젯밤 영업분이다. */
function businessToday(): string {
  return new Date(Date.now() + (9 - 6) * 3600_000).toISOString().slice(0, 10);
}

function elapsedText(min: number): string {
  return min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}`;
}

async function handle(req: NextRequest) {
  // Vercel env 값 끝에 줄바꿈이 붙어 있다(settlement-reminders와 같은 이유) — trim 후 비교.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || req.headers.get("authorization")?.trim() !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const sb = createAdminClient();
  const today = businessToday();
  const now = Date.now();

  const tracks = [
    { type: "foreign" as const, table: "foreign_requests", cols: "club_ids", adminUrl: "/admin/foreign" },
    { type: "korean" as const, table: "korean_booking_requests", cols: "club_id", adminUrl: "/admin/korean-bookings" },
  ];

  const due: { type: "foreign" | "korean"; adminUrl: string; row: Row; waitedMin: number; sameDay: boolean; first: boolean }[] = [];
  for (const t of tracks) {
    const { data, error } = await sb
      .from(t.table)
      .select(`id, guest_name, event_date, group_size, assigned_md_id, proposal_sent_at, proposal_admin_alerts, ${t.cols}`)
      .not("proposal_sent_at", "is", null)
      .lt("proposal_admin_alerts", OTHER_DAY_STEPS.length)
      .is("md_response", null)
      .not("assigned_md_id", "is", null)
      .in("status", ["new", "contacted"])
      .gte("event_date", today);
    if (error) {
      console.error("[proposal-reminders] 조회 실패", t.table, error);
      continue;
    }
    for (const row of (data ?? []) as unknown as Row[]) {
      const sameDay = row.event_date === today;
      const steps = sameDay ? SAME_DAY_STEPS : OTHER_DAY_STEPS;
      const sent = row.proposal_admin_alerts ?? 0;
      const waitedMin = Math.floor((now - new Date(row.proposal_sent_at).getTime()) / 60000);
      if (sent < steps.length && waitedMin >= steps[sent]) {
        due.push({ type: t.type, adminUrl: t.adminUrl, row, waitedMin, sameDay, first: sent === 0 });
      }
    }
  }

  // ── 손님 무응답 ──
  const GUEST_SAME_DAY_MIN = 30;
  const GUEST_OTHER_MIN = 180;
  const { data: waiting } = await sb
    .from("foreign_requests")
    .select("id, event_date, guest_action_kind, guest_action_sent_at, guest_alerts")
    .not("guest_action_sent_at", "is", null)
    .is("guest_responded_at", null)
    .eq("guest_alerts", 0)
    .neq("status", "cancelled")
    .gte("event_date", today);
  const guestDue = (waiting ?? []).filter((w) => {
    const mins = Math.floor((now - new Date(w.guest_action_sent_at as string).getTime()) / 60000);
    return mins >= (w.event_date === today ? GUEST_SAME_DAY_MIN : GUEST_OTHER_MIN);
  });

  // 밀림 기한 만료 — 손님이 끝내 안 눌렀다
  const { data: bumpExpired } = await sb
    .from("booking_confirmations")
    .select("request_id")
    .eq("request_type", "foreign")
    .eq("bump_state", "pending")
    .lt("bump_deadline", new Date(now).toISOString());

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true, today,
      guest_waiting: guestDue.map((w) => ({ id: w.id, kind: w.guest_action_kind, event_date: w.event_date })),
      bump_expired: (bumpExpired ?? []).map((b) => b.request_id),
      due: due.map((d) => ({ type: d.type, id: d.row.id, guest: d.row.guest_name, event_date: d.row.event_date, waited_min: d.waitedMin, same_day: d.sameDay, alert_no: (d.row.proposal_admin_alerts ?? 0) + 1, md_reminder: d.first })),
    });
  }
  // 손님 무응답 알림 + 밀림 만료 처리 (담당자 재알림 대상이 없어도 돈다)
  const KIND_KO: Record<string, string> = { pick_seat: "자리 고르기", budget: "금액 안내", bump: "자리 유지/취소" };
  for (const w of guestDue) {
    const r = await loadForeignReq(sb, { id: w.id });
    if (!r) continue;
    const club = await loadClub(sb, r.club_ids?.[0]);
    await sb.from("foreign_requests").update({ guest_alerts: 1 }).eq("id", r.id);
    await pushAdmins(
      sb,
      "📭 [외국인] 손님이 메일을 안 눌렀어요",
      `${flowWho(r, club)} — ${KIND_KO[w.guest_action_kind as string] ?? "안내"} 메일을 보낸 지 ${elapsedText(Math.floor((now - new Date(w.guest_action_sent_at as string).getTime()) / 60000))}째 응답이 없어요. WhatsApp으로 한 번 더 보내주세요. (${respondUrl(r)})`,
      r.id,
      "guest_no_response",
    );
  }
  for (const b of bumpExpired ?? []) {
    await sb.from("booking_confirmations").update({ bump_state: "expired" }).eq("request_type", "foreign").eq("request_id", b.request_id).eq("bump_state", "pending");
    const r = await loadForeignReq(sb, { id: b.request_id });
    if (!r) continue;
    const club = await loadClub(sb, r.club_ids?.[0]);
    if (r.assigned_md_id) await notifyMd(sb, r.assigned_md_id, "⏰ 손님이 기한 안에 답하지 않았어요", `${flowWho(r, club)} — 자리 유지 여부 답이 없어요. 나플에서 손님에게 연락할게요.`, `/booking/proposal/${r.proposal_token}`);
    await pushAdmins(sb, "⏰ [외국인] 밀림 기한 지남", `${flowWho(r, club)} — 손님이 기한 안에 유지/취소를 안 눌렀어요. 직접 연락해 주세요.`, r.id, "bump_expired");
  }

  if (due.length === 0) return NextResponse.json({ ok: true, sent: 0, guest_alerts: guestDue.length, bump_expired: (bumpExpired ?? []).length });

  const { data: admins } = await sb.from("users").select("id").eq("role", "admin");
  const results: { id: string; md: string; admin: number }[] = [];

  for (const d of due) {
    const r = d.row;
    const table = d.type === "korean" ? "korean_booking_requests" : "foreign_requests";
    // ① 첫 단계에서만 담당 MD 재알림 — 성공하면 notifyAssignedMd가 proposal_reminded_at을 찍는다.
    const md = d.first ? await notifyAssignedMd(sb, { requestType: d.type, requestId: r.id, kind: "proposal", reminder: true }) : null;
    // 단계 카운트는 MD 알림 성공 여부와 무관하게 올린다 — 안 그러면 같은 단계로 5분마다 운영자를 깨운다.
    await sb.from(table).update({ proposal_admin_alerts: (r.proposal_admin_alerts ?? 0) + 1 }).eq("id", r.id);

    // ② 운영자 푸시
    const clubId = d.type === "korean" ? r.club_id : r.club_ids?.[0];
    const [{ data: club }, { data: mdUser }] = await Promise.all([
      clubId ? sb.from("clubs").select("name").eq("id", clubId).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("users").select("name, display_name").eq("id", r.assigned_md_id).maybeSingle(),
    ]);
    const mdName = mdUser?.display_name || mdUser?.name || "담당 MD";
    const dt = new Date(r.event_date + "T00:00:00");
    const body =
      `${mdName}${club?.name ? ` · ${club.name}` : ""} — ${r.guest_name?.trim() || "게스트"}님 ${r.group_size}명 ` +
      `${d.sameDay ? "오늘" : `${dt.getMonth() + 1}/${dt.getDate()}`} 요청, 보낸 지 ${elapsedText(d.waitedMin)}째 답이 없어요` +
      (md === null ? "" : md.ok ? " (담당자에게 다시 알림)" : " (담당자 알림 실패 · 직접 연락 필요)");
    let adminSent = 0;
    for (const a of admins ?? []) {
      const { error } = await sb.rpc("notify_user_push", {
        p_user_id: a.id,
        p_title: `⏰ ${d.type === "foreign" ? "[외국인] " : ""}MD 무응답`,
        p_body: body,
        p_data: { type: "proposal_no_response", request_id: r.id },
        p_url: d.adminUrl,
        p_category: "transaction",
      });
      if (error) console.error("[proposal-reminders] admin push 실패", a.id, error);
      else adminSent++;
    }
    results.push({ id: r.id, md: md === null ? "skipped" : md.ok === true ? md.channel : "error" in md ? md.error : "failed", admin: adminSent });
  }

  return NextResponse.json({ ok: true, sent: results.length, results });
}

export const GET = handle;
export const POST = handle;
