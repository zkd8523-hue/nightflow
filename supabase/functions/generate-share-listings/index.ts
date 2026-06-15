// Deno Edge Function — 조각(share) 요일표 기반 이번 주치 자동 생성
// Runs: 매주 월 18:05 KST + 매일 06:10 KST (Migration 305 cron)
//
// 동작:
//   share_weekday_plan(요일→옵션 배정)이 있는 (MD,클럽) 중,
//   "그 주 그 클럽 조각 슬롯을 본인이 선점"(weekly_share_slots 존재)한 경우만,
//   이번 주(월~일) 각 배정 요일 날짜로 auctions(listing_type='share') row를 생성.
//   각 row: event_date=그 요일 날짜, share_deadline=익일 deadline_hour시 KST(기본 새벽3시),
//           status='active', share_option_id=옵션 id (멱등 키).
//           ※ share_date(GENERATED, -6h)는 익일 새벽 마감이어도 행사 당일 유지(Mig 306).
//   이미 그 (md,club,share_date,option) 조각이 있으면 skip (멱등).
//
// 참조: AuctionForm.tsx:563-601 (shareData 컬럼셋), expire-puzzles/index.ts (골격)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type Dow = (typeof DOW_KEYS)[number];

// KST 기준 "오늘"부터 이번 주 일요일까지의 날짜를 dow 키와 함께 반환.
// 주 경계는 월요일 시작. (이미 지난 요일은 제외 — 오늘 이후만 생성)
function thisWeekRemainingDays(): Array<{ dow: Dow; dateISO: string }> {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayDow = kstNow.getUTCDay(); // 0=일~6=토 (KST)
  // 이번 주 일요일까지 남은 일수 (일요일이면 0)
  const daysToSunday = todayDow === 0 ? 0 : 7 - todayDow;
  const out: Array<{ dow: Dow; dateISO: string }> = [];
  for (let i = 0; i <= daysToSunday; i++) {
    const d = new Date(kstNow);
    d.setUTCDate(kstNow.getUTCDate() + i);
    out.push({ dow: DOW_KEYS[d.getUTCDay()], dateISO: d.toISOString().slice(0, 10) });
  }
  return out;
}

// 그 주 월요일(week_start) ISO — 슬롯 선점 조회용. (getWeekStartForDate와 동일 규약)
function weekStartOf(dateISO: string): string {
  const base = new Date(`${dateISO}T00:00:00Z`);
  const dow = base.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  base.setUTCDate(base.getUTCDate() - daysFromMonday);
  return base.toISOString().slice(0, 10);
}

// share_deadline = 행사일(dateISO) "익일 deadlineHour시" KST → UTC ISO.
// deadlineHour=3 → 익일 새벽 3시 마감. share_date(GENERATED, -6h)는 행사 당일 유지(Mig 306).
// deadlineHour=0 → 익일 0시 = 당일 자정.
function deadlineKstISO(dateISO: string, deadlineHour: number): string {
  const hh = String(Math.max(0, Math.min(8, deadlineHour | 0))).padStart(2, "0");
  // 행사일(dateISO) 익일 = dateISO + 1일. KST 자정 기준으로 더해야 UTC 날짜에 휘둘리지 않음.
  // (dateISO+T12:00:00Z 같은 정오 기준으로 +1 후 날짜만 취하면 타임존 경계 안전)
  const next = new Date(`${dateISO}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextISO = next.toISOString().slice(0, 10);
  return new Date(`${nextISO}T${hh}:00:00.000+09:00`).toISOString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const days = thisWeekRemainingDays();
    if (days.length === 0) {
      return new Response(JSON.stringify({ success: true, created: 0, message: "생성할 날짜 없음" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 1) 요일표 배정 전체 + 옵션 + 클럽명 조인
    const { data: plans, error: planErr } = await supabase
      .from("share_weekday_plan")
      .select("md_id, club_id, dow, option_id, share_options!inner(*), clubs!inner(name)");
    if (planErr) throw planErr;
    if (!plans || plans.length === 0) {
      return new Response(JSON.stringify({ success: true, created: 0, message: "요일표 없음" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 2) 슬롯 선점 캐시: 이번 주(들)의 weekly_share_slots
    const weekStarts = Array.from(new Set(days.map((d) => weekStartOf(d.dateISO))));
    const { data: slots } = await supabase
      .from("weekly_share_slots")
      .select("md_id, club_id, week_start")
      .in("week_start", weekStarts);
    const slotKey = (md: string, club: string, ws: string) => `${md}|${club}|${ws}`;
    const ownedSlots = new Set((slots ?? []).map((s: { md_id: string; club_id: string; week_start: string }) =>
      slotKey(s.md_id, s.club_id, s.week_start)));

    // 2-b) 오픈채팅 보유 MD 집합 — 미등록 MD는 유저가 참여(claim) 자체를 못 하므로 생성 안 함.
    //      (수동 등록과 동일 정책: /api/auctions/create 의 오픈채팅 게이트와 일관)
    const planMdIds = Array.from(new Set((plans as Array<{ md_id: string }>).map((p) => p.md_id)));
    const { data: mdRows } = planMdIds.length
      ? await supabase.from("users").select("id, kakao_open_chat_url").in("id", planMdIds)
      : { data: [] };
    const mdsWithChat = new Set(
      (mdRows ?? [])
        .filter((u: { kakao_open_chat_url: string | null }) => (u.kakao_open_chat_url ?? "").trim())
        .map((u: { id: string }) => u.id)
    );

    let created = 0;
    let skipped = 0;

    for (const plan of plans as Array<{
      md_id: string;
      club_id: string;
      dow: Dow;
      option_id: string;
      share_options: {
        is_active: boolean;
        table_info: string;
        total_seats: number;
        price_per_seat: number;
        includes: string[] | null;
        md_message: string | null;
        deadline_hour: number | null;
      };
      clubs: { name: string };
    }>) {
      const opt = plan.share_options;
      if (!opt?.is_active) continue;
      // 오픈채팅 미등록 MD는 생성 건너뜀 (유저가 참여 못 하는 조각이 됨)
      if (!mdsWithChat.has(plan.md_id)) { skipped++; continue; }

      // 이 요일이 이번 주 남은 날짜에 있나
      const matchDays = days.filter((d) => d.dow === plan.dow);
      for (const day of matchDays) {
        // 슬롯 선점 체크 (그 주 그 클럽을 본인이 선점했나)
        const ws = weekStartOf(day.dateISO);
        if (!ownedSlots.has(slotKey(plan.md_id, plan.club_id, ws))) { skipped++; continue; }

        // 멱등: 이미 그 (md,club,share_date,option) 조각이 있으면 skip
        const { count } = await supabase
          .from("auctions")
          .select("id", { count: "exact", head: true })
          .eq("md_id", plan.md_id)
          .eq("club_id", plan.club_id)
          .eq("listing_type", "share")
          .eq("share_option_id", plan.option_id)
          .eq("share_date", day.dateISO)
          .not("status", "in", '("cancelled","unsold")');
        if ((count ?? 0) > 0) { skipped++; continue; }

        const deadline = deadlineKstISO(day.dateISO, opt.deadline_hour ?? 3);
        const nowIso = new Date().toISOString();
        const clubName = plan.clubs?.name ?? "";

        // AuctionForm.tsx:563-601 컬럼셋 복제 (주류 제외 → main_alcohol NULL)
        const row: Record<string, unknown> = {
          md_id: plan.md_id,
          listing_type: "share",
          club_id: plan.club_id,
          title: `${clubName} ${opt.table_info}`.trim(),
          table_info: opt.table_info,
          event_date: day.dateISO,
          total_seats: opt.total_seats,
          price_per_seat: opt.price_per_seat,
          main_alcohol: null,
          share_deadline: deadline,
          share_option_id: plan.option_id,
          includes: opt.includes ?? [],
          md_comment: null,
          md_message: opt.md_message ?? null,
          status: "active",
          // 레거시 경매 필수 컬럼 기본값
          table_type: "Standard",
          min_people: opt.total_seats,
          max_people: opt.total_seats,
          target_male: 0,
          target_female: 0,
          start_price: opt.price_per_seat,
          original_price: opt.price_per_seat,
          reserve_price: 0,
          current_bid: 0,
          bid_count: 0,
          bidder_count: 0,
          auction_start_at: nowIso,
          auction_end_at: deadline,
          duration_minutes: 0,
          auto_extend_min: 0,
          max_extensions: 0,
          bid_increment: 0,
          seats_claimed: 0,
          external_attendees: 0,
          external_male: 0,
          external_female: 0,
        };

        const { error: insErr } = await supabase.from("auctions").insert(row);
        if (insErr) {
          // 23505(UNIQUE) = 경합 시 이미 생성됨 → 무시. 그 외는 로그.
          if (insErr.code !== "23505") console.error("⚠️ 조각 INSERT 실패:", insErr, { plan: plan.option_id, day: day.dateISO });
          skipped++;
        } else {
          created++;
        }
      }
    }

    console.log(`✅ 조각 자동생성: created=${created}, skipped=${skipped}`);
    return new Response(JSON.stringify({ success: true, created, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    console.error("❌ generate-share-listings 오류:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
