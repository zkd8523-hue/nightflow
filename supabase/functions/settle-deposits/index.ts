// Deno Edge Function: 보증금 정산 처리
// Cron: 매일 06:00 (0 6 * * *)
// confirmed(settled) + 7일 경과 → settlement_logs INSERT
// forfeited + 7일 경과 → settlement_logs INSERT (노쇼 몰수금 MD 지급)
//
// settlement_logs 스키마 (Migration 018):
//   md_id, period_start, period_end, total_sales, commission_amt,
//   settlement_amt, bank_name, bank_account, status, note

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// PG 수수료율 3.5%
const PG_FEE_RATE = 0.035;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const results = { settled: 0, skipped: 0, errors: [] as string[] };

    // MD 은행 정보 캐시
    const mdBankCache: Record<string, { bank_name: string; bank_account: string }> = {};

    async function getMdBank(mdId: string): Promise<{ bank_name: string; bank_account: string } | null> {
      if (mdBankCache[mdId]) return mdBankCache[mdId];
      const { data } = await supabase
        .from("users")
        .select("bank_name, bank_account")
        .eq("id", mdId)
        .single();
      if (data?.bank_name && data?.bank_account) {
        mdBankCache[mdId] = { bank_name: data.bank_name, bank_account: data.bank_account };
        return mdBankCache[mdId];
      }
      return null;
    }

    async function processDeposit(
      deposit: { id: string; auction_id: string; md_id: string; amount: number },
      type: "settled" | "forfeited"
    ): Promise<boolean> {
      const mdBank = await getMdBank(deposit.md_id);
      if (!mdBank) {
        console.warn(`⚠️ MD 계좌 미등록: ${deposit.md_id}, deposit ${deposit.id} 건너뜀`);
        results.skipped++;
        return false;
      }

      const pgFee = Math.round(deposit.amount * PG_FEE_RATE);
      const settlementAmount = deposit.amount - pgFee;
      const noteText = type === "settled"
        ? `보증금 정산 (deposit: ${deposit.id}, auction: ${deposit.auction_id})`
        : `노쇼 몰수금 정산 (deposit: ${deposit.id}, auction: ${deposit.auction_id})`;

      const { data: log, error: logErr } = await supabase
        .from("settlement_logs")
        .insert({
          md_id: deposit.md_id,
          period_start: today,
          period_end: today,
          total_sales: deposit.amount,
          commission_amt: pgFee,
          settlement_amt: settlementAmount,
          bank_name: mdBank.bank_name,
          bank_account: mdBank.bank_account,
          status: "pending",
          note: noteText,
        })
        .select("id")
        .single();

      if (logErr) throw logErr;

      await supabase
        .from("deposits")
        .update({ settlement_id: log.id })
        .eq("id", deposit.id);

      console.log(`✅ ${type} 정산: deposit ${deposit.id} → ${settlementAmount}원 (MD: ${deposit.md_id})`);
      return true;
    }

    // 1. settled 보증금: settled_at + 7일 경과, settlement_id IS NULL
    const { data: settledDeposits, error: err1 } = await supabase
      .from("deposits")
      .select("id, auction_id, md_id, amount, settled_at")
      .eq("status", "settled")
      .is("settlement_id", null)
      .lt("settled_at", sevenDaysAgo);

    if (err1) {
      console.error("❌ settled 보증금 조회 실패:", err1);
    } else if (settledDeposits) {
      for (const deposit of settledDeposits) {
        try {
          const ok = await processDeposit(deposit, "settled");
          if (ok) results.settled++;
        } catch (err) {
          results.errors.push(`settled:${deposit.id}:${String(err)}`);
        }
      }
    }

    // 2. forfeited 보증금: forfeited_at + 7일 경과, settlement_id IS NULL
    const { data: forfeitedDeposits, error: err2 } = await supabase
      .from("deposits")
      .select("id, auction_id, md_id, amount, forfeited_at")
      .eq("status", "forfeited")
      .is("settlement_id", null)
      .lt("forfeited_at", sevenDaysAgo);

    if (err2) {
      console.error("❌ forfeited 보증금 조회 실패:", err2);
    } else if (forfeitedDeposits) {
      for (const deposit of forfeitedDeposits) {
        try {
          const ok = await processDeposit(deposit, "forfeited");
          if (ok) results.settled++;
        } catch (err) {
          results.errors.push(`forfeited:${deposit.id}:${String(err)}`);
        }
      }
    }

    console.log("📊 정산 처리 완료:", results);

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
