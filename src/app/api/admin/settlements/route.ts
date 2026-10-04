// MD 정산 — 건별 포함/금액 수정, MD에게 정산 안내 발송(2026-10-04, Migration 682).
//
// POST { action: "item", confirmation_id, included?, amount?: number | null, note? }
//   → settlement_items upsert. amount=null이면 확정서 금액으로 되돌린다.
// POST { action: "send", month: "YYYY-MM", md_id, message }
//   → 금액은 서버에서 다시 계산한다(화면 숫자를 믿지 않는다). 앱 푸시가 있으면 푸시,
//     없으면 솔라피 문자 — 제안서·확정서 보내기(notifyAssignedMd)와 같은 원칙.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettlementRows, feeOf, loadMonthRates, rateOf } from "@/lib/booking/settlements";
import { sendSms } from "@/lib/notifications/alimtalk";

export async function POST(req: NextRequest) {
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
  const sb = createAdminClient();

  if (body.action === "item") {
    const confirmationId = body.confirmation_id as string | undefined;
    if (!confirmationId) return NextResponse.json({ error: "confirmation_id_required" }, { status: 400 });
    const rows = await loadSettlementRows(sb);
    const row = rows.find((r) => r.confirmationId === confirmationId);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const amount = body.amount === undefined ? (row.amountOverridden ? row.amount : null) : (body.amount as number | null);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    const { error } = await sb.from("settlement_items").upsert({
      confirmation_id: confirmationId,
      included: body.included === undefined ? row.included : !!body.included,
      amount: amount == null ? null : Math.round(amount),
      note: body.note === undefined ? row.note : ((body.note as string | null) || null),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send") {
    const month = body.month as string | undefined;
    const mdId = body.md_id as string | undefined;
    const message = ((body.message as string | undefined) ?? "").trim();
    if (!month || !/^\d{4}-\d{2}$/.test(month) || !mdId) return NextResponse.json({ error: "month_and_md_required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 });

    const rows = (await loadSettlementRows(sb)).filter((r) => r.month === month && r.mdId === mdId && r.included);
    if (rows.length === 0) return NextResponse.json({ error: "no_items" }, { status: 404 });
    const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const fee = feeOf(total, rateOf(await loadMonthRates(sb), month));

    const title = `💰 ${Number(month.slice(5, 7))}월 정산 안내`;
    const { count } = await sb.from("push_tokens").select("*", { count: "exact", head: true }).eq("user_id", mdId);
    let channel: "push" | "sms" | null = null;
    if ((count ?? 0) > 0) {
      const { error } = await sb.rpc("notify_user_push", {
        p_user_id: mdId,
        p_title: title,
        p_body: message,
        p_data: { type: "md_settlement", month },
        p_url: "/md/dashboard",
        p_category: "transaction",
      });
      if (!error) channel = "push";
      else console.error("[settlements] push 실패", mdId, error);
    }
    if (!channel) {
      const { data: md } = await sb.from("users").select("phone").eq("id", mdId).single();
      if (md?.phone) {
        try {
          await sendSms(md.phone, message);
          channel = "sms";
        } catch (e) {
          console.error("[settlements] sms 실패", e);
        }
      }
    }
    if (!channel) return NextResponse.json({ error: "no_channel" }, { status: 422 });

    const { data: notice, error: logErr } = await sb
      .from("settlement_notices")
      .insert({ month, md_id: mdId, item_count: rows.length, total_amount: total, fee_amount: fee, channel, message, sent_by: user.id })
      .select("sent_at")
      .single();
    if (logErr) console.error("[settlements] 발송 기록 실패", logErr);
    return NextResponse.json({ ok: true, channel, sent_at: notice?.sent_at ?? new Date().toISOString(), fee, total });
  }

  // POST { action: "paid", month, md_id, paid: boolean } — 정산 완료 체크/해제
  if (body.action === "paid") {
    const month = body.month as string | undefined;
    const mdId = body.md_id as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month) || !mdId) return NextResponse.json({ error: "month_and_md_required" }, { status: 400 });
    if (body.paid) {
      const paidAt = new Date().toISOString();
      const { error } = await sb.from("settlement_payments").upsert({ month, md_id: mdId, paid_at: paidAt, paid_by: user.id });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, paid_at: paidAt });
    }
    const { error } = await sb.from("settlement_payments").delete().eq("month", month).eq("md_id", mdId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, paid_at: null });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
