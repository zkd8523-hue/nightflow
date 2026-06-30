// Stripe Webhook 이벤트 처리.
// 환경변수: STRIPE_WEBHOOK_SECRET (Stripe Dashboard → Webhooks 등록 후 받음)
//
// 처리 이벤트:
// - payment_intent.succeeded     → escrow.status = 'paid'
// - payment_intent.payment_failed → escrow.status = 'failed'
// - payment_intent.canceled       → escrow.status = 'failed'
// - charge.refunded               → escrow.amount_refunded 업데이트 + status 갱신
//
// Stripe Webhook 등록 URL: https://nightflow.kr/api/payments/webhook

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export const runtime = "nodejs";
// Next.js App Router: body 원본 그대로 받기 위해 force-dynamic
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET 누락");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  // Stripe 서명 검증 — 원본 body 필요
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] 서명 검증 실패:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const chargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id;
        await admin
          .from("payment_escrow")
          .update({
            status: "paid",
            stripe_charge_id: chargeId ?? null,
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("payment_escrow")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!piId) break;

        const refundedAmount = charge.amount_refunded; // 누적 환불액
        // 환불액이 결제 총액과 같으면 cancelled_refunded, 아니면 부분 환불 유지
        const { data: esc } = await admin
          .from("payment_escrow")
          .select("id, amount_total, status")
          .eq("stripe_payment_intent_id", piId)
          .single();
        if (!esc) break;

        const newStatus =
          refundedAmount >= esc.amount_total ? "cancelled_refunded" : esc.status;
        await admin
          .from("payment_escrow")
          .update({
            amount_refunded: refundedAmount,
            status: newStatus,
          })
          .eq("id", esc.id);
        break;
      }
      default:
        // 미처리 이벤트는 무시 (정상)
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] 처리 실패:", err, "event:", event.type);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
