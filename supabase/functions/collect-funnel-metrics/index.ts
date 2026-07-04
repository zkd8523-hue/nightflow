// Deno Edge Function: GA4 Data API를 호출해 채널별 이탈퍼널 스냅샷을 DB에 저장한다.
//
// 트리거: pg_cron 매주 월 00:00 UTC (Migration 407)
// 저장: funnel_snapshots 테이블
//
// 인증 방식: OAuth 2.0 Refresh Token
//   조직 정책(iam.disableServiceAccountKeyCreation)으로 서비스 계정 키 생성이 막힌 환경 대응.
//   Google OAuth Playground에서 최초 1회 refresh token을 발급해 secret으로 저장 → Edge Function이
//   매 실행 시 이 refresh token으로 access token을 교환해 사용.
//
// 필요한 시크릿 (Supabase secrets set으로 등록):
//   GA4_OAUTH_CLIENT_ID       — GCP OAuth 클라이언트 ID
//   GA4_OAUTH_CLIENT_SECRET   — GCP OAuth 클라이언트 시크릿
//   GA4_OAUTH_REFRESH_TOKEN   — OAuth Playground에서 발급한 refresh token
//   GA4_PROPERTY_ID           — GA4 속성 ID (숫자, 예: "312345678")
//
// 채널 분류 규칙 (GA4의 sessionSource + sessionMedium 기반):
//   blog       : m.blog.naver.com, blog.naver.com
//   instagram  : instagram, ig, instagram.com
//   organic    : m.search.naver.com, google, google.com (organic)
//   direct     : (direct)
//   other      : 나머지 전부
//
// 이벤트 목록 (외국인 SOP + 인바운드 공통):
//   session_start, page_view, home_view, home_cta_click,
//   puzzle_form_view, puzzle_created, foreign_clubs_view

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// -------------------- GA4 인증 (OAuth Refresh Token) --------------------

async function getGA4AccessToken(): Promise<string> {
  const clientId = Deno.env.get("GA4_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GA4_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GA4_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GA4_OAUTH_CLIENT_ID / GA4_OAUTH_CLIENT_SECRET / GA4_OAUTH_REFRESH_TOKEN not all set");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 token refresh failed: ${res.status} ${text}`);
  }
  const { access_token } = await res.json();
  return access_token as string;
}

// -------------------- GA4 쿼리 --------------------

interface Ga4Row {
  eventName: string;
  sessionSource: string;
  sessionMedium: string;
  eventCount: number;
  totalUsers: number;
  averageSessionDuration: number;
}

async function fetchFunnelRows(propertyId: string, accessToken: string, periodDays: number): Promise<Ga4Row[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: `${periodDays}daysAgo`, endDate: "today" }],
    dimensions: [
      { name: "eventName" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ],
    metrics: [
      { name: "eventCount" },
      { name: "totalUsers" },
      { name: "averageSessionDuration" },
    ],
    // 관심 이벤트만 필터 (GA4 자동 이벤트 + 우리 커스텀 이벤트)
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: {
          values: [
            "session_start",
            "page_view",
            "home_view",
            "home_cta_click",
            "puzzle_form_view",
            "puzzle_created",
            "foreign_clubs_view",
            "foreign_club_card_click",
            "foreign_book_at_club_click",
            "foreign_plant_flag_click",
            "foreign_login_view",
          ],
        },
      },
    },
    limit: 10000,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: any) => ({
    eventName: r.dimensionValues[0].value,
    sessionSource: r.dimensionValues[1].value,
    sessionMedium: r.dimensionValues[2].value,
    eventCount: Number(r.metricValues[0].value),
    totalUsers: Number(r.metricValues[1].value),
    averageSessionDuration: Number(r.metricValues[2].value),
  }));
}

// -------------------- 채널 분류 --------------------

function classifyChannel(source: string, medium: string): string {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if (s.includes("blog.naver.com")) return "blog";
  if (s === "instagram" || s === "ig" || s.includes("instagram.com")) return "instagram";
  if (s.includes("search.naver.com")) return "organic";
  if (s === "google" || s === "google.com") return m === "organic" ? "organic" : "other";
  if (s === "(direct)") return "direct";
  return "other";
}

// -------------------- 집계 --------------------

interface Aggregated {
  channel: string;
  eventName: string;
  eventCount: number;
  totalUsers: number;
  weightedDurationSum: number;  // eventCount 가중 세션 duration 합
  weightedCount: number;         // 가중치 총합
}

function aggregate(rows: Ga4Row[]): Aggregated[] {
  const map = new Map<string, Aggregated>();
  for (const r of rows) {
    const channel = classifyChannel(r.sessionSource, r.sessionMedium);
    const key = `${channel}::${r.eventName}`;
    const cur = map.get(key) ?? {
      channel,
      eventName: r.eventName,
      eventCount: 0,
      totalUsers: 0,
      weightedDurationSum: 0,
      weightedCount: 0,
    };
    cur.eventCount += r.eventCount;
    cur.totalUsers += r.totalUsers;
    // 세션 duration은 이벤트 카운트 가중 평균 (row별로 다를 수 있으므로)
    cur.weightedDurationSum += r.averageSessionDuration * r.eventCount;
    cur.weightedCount += r.eventCount;
    map.set(key, cur);
  }
  return [...map.values()];
}

// -------------------- 저장 --------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const propertyId = Deno.env.get("GA4_PROPERTY_ID");
    if (!propertyId) throw new Error("GA4_PROPERTY_ID not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const periodDays = 7;

    console.log("🔑 GA4 액세스 토큰 발급 중...");
    const accessToken = await getGA4AccessToken();

    console.log(`📊 GA4 최근 ${periodDays}일 리포트 조회 중...`);
    const rows = await fetchFunnelRows(propertyId, accessToken, periodDays);
    console.log(`   → ${rows.length}개 row 수신`);

    const aggregated = aggregate(rows);
    console.log(`   → ${aggregated.length}개 (채널×이벤트) 조합으로 집계`);

    // 오늘 날짜(UTC 기준) 스냅샷으로 저장. 같은 날 재실행 시 UPSERT.
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const inserts = aggregated.map((a) => ({
      snapshot_date: snapshotDate,
      period_days: periodDays,
      channel: a.channel,
      event_name: a.eventName,
      event_count: a.eventCount,
      unique_users: a.totalUsers,
      avg_engagement_seconds: a.weightedCount > 0 ? a.weightedDurationSum / a.weightedCount : null,
      metadata: { source: "ga4_data_api" },
    }));

    if (inserts.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, message: "no data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("funnel_snapshots")
      .upsert(inserts, { onConflict: "snapshot_date,channel,event_name,period_days" });
    if (error) throw error;

    console.log(`✅ ${inserts.length}개 스냅샷 저장 완료`);
    return new Response(
      JSON.stringify({ ok: true, snapshot_date: snapshotDate, inserted: inserts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("collect-funnel-metrics 실패:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
