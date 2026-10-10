// MD 정산 자동 리마인드(2026-10-10) — 매월 7일(미리 안내)·10일(기한 당일) 10:00 KST.
// pg_cron(Migration 692)이 service_role_key를 Bearer로 실어 호출한다. 대상·문구는 planSettlementReminders.
//
// GET/POST ?dry=1        → 보내지 않고 대상·문구만 돌려준다
//          ?kind=due_soon|due_today, ?month=YYYY-MM → 수동 실행·테스트용(기본: 오늘 날짜로 판단, 지난달)
// 7·10일이 아닌 날 kind 없이 부르면 아무것도 하지 않는다.
// 정산 문자는 기록이 남아야 해서 앱 푸시보다 문자가 먼저다(전화번호 없을 때만 푸시).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planSettlementReminders, type SettlementReminderKind } from "@/lib/booking/settlements";
import { sendSms } from "@/lib/notifications/alimtalk";

const KIND_BY_DAY: Record<number, SettlementReminderKind> = { 7: "due_soon", 10: "due_today" };

async function handle(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || req.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const dry = q.get("dry") === "1";
  const now = new Date(Date.now() + 9 * 3600_000); // KST 벽시계
  const todayKst = now.toISOString().slice(0, 10);
  const qKind = q.get("kind");
  const kind: SettlementReminderKind | undefined =
    qKind === "due_soon" || qKind === "due_today" ? qKind : KIND_BY_DAY[now.getUTCDate()];
  if (!kind) return NextResponse.json({ ok: true, skipped: "not_reminder_day", today: todayKst });

  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : prev.toISOString().slice(0, 7);

  const sb = createAdminClient();
  const { send, skipped } = await planSettlementReminders(sb, kind, month, todayKst);
  if (dry) {
    return NextResponse.json({
      ok: true, dry: true, kind, month, today: todayKst, skipped,
      send: send.map((s) => ({ mdId: s.mdId, mdName: s.mdName, count: s.rows.length, total: s.total, fee: s.fee, message: s.message })),
    });
  }

  const results: { mdName: string; channel: "push" | "sms" | null }[] = [];
  for (const s of send) {
    let channel: "push" | "sms" | null = null;
    const { data: md } = await sb.from("users").select("phone").eq("id", s.mdId).single();
    if (md?.phone) {
      try {
        await sendSms(md.phone, s.message);
        channel = "sms";
      } catch (e) {
        console.error("[settlement-reminders] sms 실패", s.mdId, e);
      }
    }
    if (!channel) {
      const { error } = await sb.rpc("notify_user_push", {
        p_user_id: s.mdId,
        p_title: `💰 ${Number(month.slice(5, 7))}월 정산 안내`,
        p_body: s.message,
        p_data: { type: "md_settlement", month },
        p_url: "/md/dashboard",
        p_category: "transaction",
      });
      if (!error) channel = "push";
      else console.error("[settlement-reminders] push 실패", s.mdId, error);
    }
    if (channel) {
      // sent_by NULL = 자동 발송. 같은 날 재실행 시 이 행으로 중복을 막는다.
      const { error } = await sb.from("settlement_notices").insert({
        month, md_id: s.mdId, item_count: s.rows.length, total_amount: s.total, fee_amount: s.fee, channel, message: s.message, sent_by: null,
      });
      if (error) console.error("[settlement-reminders] 발송 기록 실패", s.mdId, error);
    }
    results.push({ mdName: s.mdName, channel });
  }
  return NextResponse.json({ ok: true, kind, month, today: todayKst, results, skipped });
}

export const GET = handle;
export const POST = handle;
