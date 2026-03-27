// Deno Edge Function: 미낙찰자 보증금 자동 환불
// Cron: 매 5분 (*/5 * * * *)
// 1) won/confirmed/contacted 경매의 비낙찰자 보증금 → 환불
// 2) unsold/cancelled 경매의 모든 보증금 → 환불

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY");
const TOSS_API_URL = "https://api.tosspayments.com/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getTossAuthHeader(): string {
  if (!TOSS_SECRET_KEY) throw new Error("TOSS_SECRET_KEY 미설정");
  const encoded = btoa(`${TOSS_SECRET_KEY}:`);
  return `Basic ${encoded}`;
}

async function cancelTossPayment(
  paymentKey: string,
  reason: string,
  amount?: number
): Promise<boolean> {
  const body: Record<string, unknown> = { cancelReason: reason };
  if (amount !== undefined) body.cancelAmount = amount;

  try {
    const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}/cancel`, {
      method: "POST",
      headers: {
        Authorization: getTossAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ 토스 환불 실패 (${paymentKey}):`, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ 토스 환불 예외 (${paymentKey}):`, err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();
    const results = { refunded: 0, failed: 0, errors: [] as string[] };

    // 1. 낙찰된 경매의 비낙찰자 보증금 환불
    // status=paid (held가 아닌) + 경매가 won/contacted/confirmed 상태
    const { data: outbidDeposits, error: err1 } = await supabase
      .from("deposits")
      .select("id, payment_key, amount, auction_id, user_id, auctions!inner(status, winner_id)")
      .eq("status", "paid")
      .in("auctions.status", ["won", "contacted", "confirmed"]);

    if (err1) {
      console.error("❌ 비낙찰자 보증금 조회 실패:", err1);
    } else if (outbidDeposits) {
      for (const deposit of outbidDeposits) {
        const auction = deposit.auctions as unknown as { status: string; winner_id: string };
        // 낙찰자 본인의 paid 보증금은 스킵 (held로 전환되어야 함)
        if (auction.winner_id === deposit.user_id) continue;

        // 토스 환불
        if (deposit.payment_key) {
          const ok = await cancelTossPayment(
            deposit.payment_key,
            "미낙찰 보증금 자동 환불",
            deposit.amount
          );
          if (!ok) {
            results.failed++;
            results.errors.push(`toss_cancel:${deposit.id}`);
            continue;
          }
        }

        const { error: updateErr } = await supabase
          .from("deposits")
          .update({
            status: "refunded",
            refunded_at: now,
            refund_amount: deposit.amount,
            refund_reason: "미낙찰 자동 환불",
          })
          .eq("id", deposit.id);

        if (updateErr) {
          results.failed++;
          results.errors.push(`update:${deposit.id}:${updateErr.message}`);
        } else {
          results.refunded++;
          console.log(`✅ 비낙찰자 보증금 환불: deposit ${deposit.id}`);
        }
      }
    }

    // 2. 유찰/취소 경매의 모든 보증금 환불
    const { data: endedDeposits, error: err2 } = await supabase
      .from("deposits")
      .select("id, payment_key, amount, auction_id, auctions!inner(status)")
      .in("status", ["paid", "held"])
      .in("auctions.status", ["unsold", "cancelled"]);

    if (err2) {
      console.error("❌ 유찰/취소 보증금 조회 실패:", err2);
    } else if (endedDeposits) {
      for (const deposit of endedDeposits) {
        if (deposit.payment_key) {
          const ok = await cancelTossPayment(
            deposit.payment_key,
            "경매 유찰/취소 보증금 환불",
            deposit.amount
          );
          if (!ok) {
            results.failed++;
            results.errors.push(`toss_cancel:${deposit.id}`);
            continue;
          }
        }

        const { error: updateErr } = await supabase
          .from("deposits")
          .update({
            status: "refunded",
            refunded_at: now,
            refund_amount: deposit.amount,
            refund_reason: "경매 유찰/취소 자동 환불",
          })
          .eq("id", deposit.id);

        if (updateErr) {
          results.failed++;
          results.errors.push(`update:${deposit.id}:${updateErr.message}`);
        } else {
          results.refunded++;
          console.log(`✅ 유찰/취소 보증금 환불: deposit ${deposit.id}`);
        }
      }
    }

    console.log("📊 보증금 환불 처리 완료:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Edge Function 실행 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
