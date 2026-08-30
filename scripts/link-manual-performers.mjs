/**
 * 수동 입력한 club_events 의 lineup(문자열 배열)을 club_event_performers 로 연결한다.
 *
 * 왜 필요한가:
 *   수동 입력 시 lineup 배열에 이름만 넣었더니 상세 페이지에서 출연자가
 *   그냥 텍스트로만 뜨고 클릭이 안 됐다(실측: MADLY MEDLEY 나플라·쿠기…).
 *   자동 수집 경로는 ensure_artist() 로 artists 행을 만들고
 *   club_event_performers 에 artist_id 를 걸어주는데, 수동 입력은 그 단계가 없었다.
 *
 * 사용: DRY_RUN=1 node scripts/link-manual-performers.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DRY = process.env.DRY_RUN === "1";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 자동 수집 경로와 동일한 정규화 규칙
/**
 * ⚠️ src/lib/lineups/djName.ts 의 normalizeDjName() 정본과 반드시 같아야 한다.
 *
 * 전에는 toUpperCase() 를 써서 "ARKINS" 같은 대문자 키를 만들었다. 정본은
 * 소문자라 수집기가 "arkins" 로 조회하면 그 별칭을 못 찾아 같은 DJ 를 새 행으로
 * 또 만든다 — 8/30 하루에만 11쌍이 이렇게 갈라졌다(실측).
 * dj_aliases.normalized UNIQUE 도 대소문자를 다른 값으로 보므로 DB 가 못 막는다.
 */
const normalizeDjName = (s) => {
  const stripped = String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
  const noLead = stripped.startsWith("dj") ? stripped.slice(2) : stripped;
  const noTrail = noLead.endsWith("dj") ? noLead.slice(0, -2) : noLead;
  return noTrail || stripped;
};

const { data: rows } = await sb.from("club_events")
  .select("id,event_date,title,lineup")
  .eq("source_account","khhcalendar_manual").order("event_date");

let linked=0, skipped=0;
for (const r of rows) {
  const names = (r.lineup ?? []).filter(n => String(n??"").trim());
  if (!names.length) { skipped++; continue; }
  const { count } = await sb.from("club_event_performers")
    .select("*",{count:"exact",head:true}).eq("event_id", r.id);
  if (count) { console.log(`  건너뜀 ${r.event_date} ${r.title?.slice(0,30)} (이미 ${count}건)`); skipped++; continue; }

  for (const [i, raw] of names.entries()) {
    const norm = normalizeDjName(raw);
    if (!norm) continue;
    if (DRY) { console.log(`  [DRY] ${r.event_date} ${r.title?.slice(0,26)} ← ${raw}`); linked++; continue; }
    const { data: artistId, error: e1 } = await sb.rpc("ensure_artist", { p_raw_name: raw, p_normalized: norm });
    if (e1 || !artistId) { console.log(`  ensure_artist 실패 ${raw}: ${e1?.message}`); continue; }
    const { error: e2 } = await sb.from("club_event_performers")
      .insert({ event_id: r.id, artist_id: artistId, raw_name: raw, sort_order: i });
    if (e2) { console.log(`  연결 실패 ${raw}: ${e2.message}`); continue; }
    console.log(`  연결 ${r.event_date} ${r.title?.slice(0,26)} ← ${raw}`);
    linked++;
  }
}
console.log(`\n${DRY?"[DRY] ":""}연결 ${linked}명 / 라인업 없어 건너뜀 ${skipped}건`);
