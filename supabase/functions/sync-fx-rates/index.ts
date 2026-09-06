// Deno Edge Function: 주 1회 KRW 환율을 받아 fx_rate_snapshots에 적재
// Cron: "0 18 * * 0" (UTC 일 18:00 = KST 월 03:00) — Migration 661에서 pg_cron 등록
//
// 앱은 이 테이블의 최신 행만 읽는다(currency.ts getKrwRates). 외부 API를 치는 곳이
// 여기 하나로 줄어, 손님 요청 경로에서 외부 지연·장애가 사라진다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// currency.ts CurrencyCode와 같은 목록을 유지해야 한다.
const CODES = ["USD", "JPY", "CNY", "TWD", "HKD", "SGD", "THB", "VND"] as const;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log("💱 환율 동기화 시작");

    const res = await fetch("https://open.er-api.com/v6/latest/KRW");
    if (!res.ok) throw new Error(`API ${res.status}`);

    const json = await res.json();
    const r = json?.rates;
    if (!r) throw new Error("rates 필드 없음");

    // 일부 통화만 빠진 응답을 그대로 적재하면 그 통화가 폴백으로 조용히 떨어진다.
    // 하나라도 없으면 이번 회차를 실패로 처리하고 직전 행을 그대로 둔다.
    const missing = CODES.filter((c) => typeof r[c] !== "number");
    if (missing.length) throw new Error(`통화 누락: ${missing.join(",")}`);

    const rates: Record<string, number> = {};
    for (const c of CODES) rates[c] = r[c];

    const { error } = await supabase.from("fx_rate_snapshots").insert({
      rates,
      source: "open.er-api.com",
      is_fallback: false,
      fetched_at: json?.time_last_update_utc
        ? new Date(json.time_last_update_utc).toISOString()
        : new Date().toISOString(),
    });
    if (error) throw error;

    console.log(`✅ 환율 적재 (USD ${rates.USD}, JPY ${rates.JPY})`);
    return new Response(JSON.stringify({ success: true, rates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // 실패해도 새 행을 넣지 않는다 — 직전 성공 행이 최신으로 남아야
    // 손님이 몇 주 전 실제 환율을 계속 본다(코드 폴백값보다 정확하다).
    console.error("❌ 환율 동기화 실패:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
