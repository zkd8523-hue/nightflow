/**
 * soft-delete(deleted_at)된 클럽 중 참조가 전혀 없는 행을 물리 삭제한다.
 *
 * 왜 필요한가(2026-08-30): 같은 클럽이 중복 등록됐다가 정리된 흔적이 74개 남아
 * 있었다 — bermuda 11개, 운영자테스트 7개, OCEAN 5개 등. 화면에는 안 보이지만
 * 관리자가 클럽을 조회할 때마다 같은 이름이 여러 개 나와 어느 게 정본인지
 * 헷갈린다(실제로 OCEAN 라인업을 넣을 때 5개 중 고르는 데 시간을 썼다).
 *
 * ⚠️ 참조가 하나라도 있으면 건드리지 않는다. FK 제약이 막아주긴 하지만
 *    그 전에 우리가 먼저 확인한다 — 지워도 되는지 판단은 코드가 아니라
 *    데이터가 한다. 삭제는 한 건씩 하고, 실패하면 그 건만 건너뛴다.
 *
 * 사용: DRY_RUN=1 node scripts/purge-deleted-clubs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DRY = process.env.DRY_RUN === "1";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: dead, error } = await sb
  .from("clubs").select("id,name,area,deleted_at").not("deleted_at", "is", null);
if (error) { console.error(error.message); process.exit(1); }
console.log(`soft-delete 된 클럽 ${dead.length}개 검사\n`);

// 아는 참조 테이블은 미리 걸러 실패를 줄인다. 목록에 없는 참조는 FK가 막아준다.
const REFS = [
  ["club_lineups","club_id"], ["club_events","club_id"], ["lineup_drafts","club_id"],
  ["club_partners","club_id"], ["club_name_registry","matched_club_id"],
  ["weekly_hotdeal_slots","club_id"], ["daily_hotdeals","club_id"],
  ["puzzles","club_id"], ["auctions","club_id"], ["club_reviews","club_id"],
];
const referenced = new Set();
for (const [t, col] of REFS) {
  const { data, error: e } = await sb.from(t).select(col).not(col, "is", null);
  if (e) { console.log(`  (${t} 조회 불가 — FK에 맡긴다: ${e.code})`); continue; }
  for (const r of data) if (r[col]) referenced.add(r[col]);
}

let purged = 0, kept = 0, failed = 0;
for (const c of dead) {
  if (referenced.has(c.id)) {
    kept++;
    console.log(`  보존 ${c.name} (${c.area}) — 참조 있음`);
    continue;
  }
  if (DRY) { purged++; console.log(`  [DRY] 삭제 ${c.name} (${c.area})`); continue; }
  const { error: e } = await sb.from("clubs").delete().eq("id", c.id);
  if (e) { failed++; console.log(`  ⚠️ ${c.name}: ${e.message.slice(0, 80)}`); continue; }
  purged++;
}
console.log(`\n${DRY ? "[DRY] " : ""}삭제 ${purged} / 보존 ${kept} / 실패 ${failed}`);
