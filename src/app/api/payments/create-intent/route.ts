// 외국인 사용자가 깃발 매칭 오퍼 수락 시 Stripe Payment Intent 생성.
// Migration 343 payment_escrow 레코드 생성.
//
// Body: { puzzle_offer_id: string }
// 200: { client_secret, escrow_id, breakdown }
// 401/403/422: 에러
//
// 흐름:
// 1. 인증 + 외국인(lang ∈ en/zh/ja) 검증
// 2. puzzle_offer 유효성 (status='accepted' 또는 'pending', leader == user)
// 3. Stripe Payment Intent 생성 (KRW, 자동 결제 방법 활성화)
// 4. payment_escrow INSERT (status='pending')
// 5. client_secret 반환 → 프론트가 Stripe Elements로 결제

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, calculatePaymentBreakdown } from "@/lib/payments/stripe";

const FOREIGN_LANGS = new Set(["en", "zh", "ja"]);

export async function POST(req: NextRequest) {
  // 1. 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Body
  let body: { puzzle_offer_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const offerId = body.puzzle_offer_id;
  if (!offerId) {
    return NextResponse.json({ error: "puzzle_offer_id_required" }, { status: 400 });
  }

  // 3. 사용자 lang 확인 (외국인만 허용)
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, lang, country_code, stripe_customer_id, display_name, email")
    .eq("id", user.id)
    .single();
  if (userErr || !userRow) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (!FOREIGN_LANGS.has(userRow.lang ?? "")) {
    return NextResponse.json(
      { error: "foreign_users_only", hint: "한국인 사용자는 기존 Model B 직거래" },
      { status: 403 }
    );
  }

  // 4. puzzle_offer 검증 + leader == user
  const { data: offer, error: offerErr } = await supabase
    .from("puzzle_offers")
    .select(
      "id, puzzle_id, md_id, club_id, proposed_price, status, puzzle:puzzles!puzzle_offers_puzzle_id_fkey(id, leader_id, event_at)"
    )
    .eq("id", offerId)
    .single();
  if (offerErr || !offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }
  // PostgREST embed는 FK가 single이라도 타입을 array로 추론할 수 있음 — 안전하게 처리
  const puzzleEmbed = offer.puzzle as unknown as
    | { id: string; leader_id: string; event_at: string }
    | { id: string; leader_id: string; event_at: string }[]
    | null;
  const puzzle = Array.isArray(puzzleEmbed) ? (puzzleEmbed[0] ?? null) : puzzleEmbed;
  if (!puzzle || puzzle.leader_id !== user.id) {
    return NextResponse.json({ error: "not_leader" }, { status: 403 });
  }
  // 결제 가능 상태: pending(수락 전) 또는 accepted(방금 수락)
  if (!["pending", "accepted"].includes(offer.status)) {
    return NextResponse.json(
      { error: "invalid_offer_status", current: offer.status },
      { status: 422 }
    );
  }
  if (!offer.proposed_price || offer.proposed_price <= 0) {
    return NextResponse.json({ error: "invalid_price" }, { status: 422 });
  }
  if (!puzzle.event_at) {
    return NextResponse.json({ error: "event_at_missing" }, { status: 422 });
  }

  // 5. 기존 escrow 확인 (중복 결제 방지)
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payment_escrow")
    .select("id, status, stripe_payment_intent_id")
    .eq("puzzle_offer_id", offerId)
    .in("status", ["pending", "paid", "visit_confirmed"])
    .maybeSingle();
  if (existing) {
    // 이미 결제 진행 중 — Stripe PI 다시 조회해 client_secret 반환
    if (existing.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(
        existing.stripe_payment_intent_id
      );
      return NextResponse.json({
        escrow_id: existing.id,
        client_secret: pi.client_secret,
        breakdown: calculatePaymentBreakdown(offer.proposed_price),
        reused: true,
      });
    }
  }

  // 6. Stripe Customer 확보 (재사용 또는 생성)
  let customerId = userRow.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRow.email ?? undefined,
      name: userRow.display_name ?? undefined,
      metadata: {
        nightflow_user_id: user.id,
        lang: userRow.lang ?? "",
        country_code: userRow.country_code ?? "",
      },
    });
    customerId = customer.id;
    await admin
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // 7. Stripe Payment Intent 생성
  const breakdown = calculatePaymentBreakdown(offer.proposed_price);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: breakdown.amountTotal,
    currency: "krw",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    description: `NightFlow puzzle offer ${offerId}`,
    metadata: {
      puzzle_offer_id: offerId,
      puzzle_id: puzzle.id,
      user_id: user.id,
      md_id: offer.md_id,
      club_id: offer.club_id ?? "",
      lang: userRow.lang ?? "",
      country_code: userRow.country_code ?? "",
    },
  });

  // 8. payment_escrow INSERT (status='pending')
  const { data: escrow, error: escrowErr } = await admin
    .from("payment_escrow")
    .insert({
      puzzle_offer_id: offerId,
      user_id: user.id,
      md_id: offer.md_id,
      club_id: offer.club_id,
      amount_total: breakdown.amountTotal,
      amount_platform_fee: breakdown.platformFee,
      amount_stripe_fee: breakdown.stripeFee,
      amount_md_settlement: breakdown.mdSettlement,
      stripe_payment_intent_id: paymentIntent.id,
      status: "pending",
      event_at: puzzle.event_at,
      user_lang: userRow.lang,
      user_country_code: userRow.country_code,
    })
    .select("id")
    .single();

  if (escrowErr) {
    // Stripe PI는 생성됐는데 DB INSERT 실패 → PI cancel
    await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
    return NextResponse.json(
      { error: "escrow_create_failed", detail: escrowErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    escrow_id: escrow.id,
    client_secret: paymentIntent.client_secret,
    breakdown,
  });
}
