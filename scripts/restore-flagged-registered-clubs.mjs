/**
 * isHipHopVenue 순환 참조로 묻혔던 flagged 공연을 되살린다.
 *
 * 배경(2026-08-30): 예전 수집기는 "힙합플레이야가 다룬 적 있는 클럽인가"로
 * 자동 승인 여부를 갈랐다. 그 계정이 안 다룬 클럽은 공식 계정이 직접 올려도
 * 전부 flagged 로 숨었고, 그렇게 묻힌 31건이 사실상 전부 진짜 공연이었다 —
 * NAFLA 프리리스닝(Grain Haus), Colde·Khakii 릴리즈 파티, PALOALTO @CLUB LOOPY,
 * BE'O @Round Lounge, CAMO @Waikiki.
 *
 * 게이트는 "등록 클럽인가"로 바꿨다(index.ts). 이 스크립트는 과거 데이터에
 * 같은 기준을 소급 적용한다. 사람이 rejected/confirmed 로 판단한 행은 건드리지 않는다.
 *
 * 사용: DRY_RUN=1 node scripts/restore-flagged-registered-clubs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DRY = process.env.DRY_RUN === "1";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 수집기(index.ts)의 OVERSEAS 와 같은 목록
const OVERSEAS = ["도쿄","타이페이","하노이","홍콩","상하이","방콕","오사카","TOKYO","TAIPEI","HANOI","HONG KONG","BANGKOK"];

const { data, error } = await sb.from("club_events")
  .select("id,event_date,title,club_name_raw,club_id,lineup,venue_area")
  .eq("status","flagged").order("event_date",{ascending:false});
if (error) { console.error(error.message); process.exit(1); }

let restored=0, kept=0;
for (const r of data) {
  // 현행 decideEventStatus 와 동일한 판정
  let reason = null;
  if (!r.event_date) reason = "no_date";
  else if ((r.lineup ?? []).length === 0) reason = "no_lineup";
  else if (OVERSEAS.some(k => (r.venue_area ?? "").toUpperCase().includes(k.toUpperCase()))) reason = "overseas";
  else if (!r.club_id) reason = "unregistered_venue";
  // 과거 공연(past)은 여기서 되살린다 — 아티스트 페이지의 "지난 공연" 이력이 된다.
  // 수집 시점 기준으로 미래였는데 지금 과거인 것뿐이라 묻어둘 이유가 없다.

  if (reason) {
    kept++;
    if (!DRY) await sb.from("club_events").update({ status_reason: reason }).eq("id", r.id);
    console.log(`  유지 [${reason}] ${r.event_date ?? "날짜없음"} ${r.club_name_raw} | ${String(r.title ?? "").slice(0,38)}`);
    continue;
  }
  restored++;
  const label = `${r.event_date} ${r.club_name_raw} | ${String(r.title ?? "").slice(0,42)}`;
  if (DRY) { console.log(`  [DRY] 복구 ${label}`); continue; }
  const { error: e } = await sb.from("club_events")
    .update({ status: "approved", status_reason: null }).eq("id", r.id);
  console.log(e ? `  실패 ${label}: ${e.message}` : `  복구 ${label}`);
}
console.log(`\n${DRY?"[DRY] ":""}복구 ${restored}건 / 유지 ${kept}건`);
