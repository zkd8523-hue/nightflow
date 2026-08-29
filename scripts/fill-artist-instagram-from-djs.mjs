/**
 * djs 에 이미 있는 핸들을 artists 의 빈 instagram 에 옮겨 담는다.
 *
 * 배경: 같은 사람이 포스터 종류에 따라 DJ 로도 아티스트로도 수집된다. 한쪽만
 * 채워져 있으면 다른 쪽은 미확보로 남아 검색 대상이 되는데, 답은 이미 DB 안에 있다.
 *
 * 안전장치 (오연결이 미입력보다 나쁘다 — @ash.island 사고 전례):
 *   - 정규화 이름 **정확 일치**만. 부분·유사 일치 금지.
 *   - 후보 DJ 들의 핸들이 하나로 모일 때만. 두 개 이상이면 건너뛴다.
 *   - 짧은 이름(정규화 3~5자)은 동명이인 위험이 커서, **같은 클럽에 함께 출연한
 *     기록이 있을 때만** 인정한다. 겹침이 없으면 보류 목록으로만 출력한다.
 *   - 이미 instagram 이 있는 아티스트는 건드리지 않는다.
 *
 * 사용: DRY_RUN=1 node scripts/fill-artist-instagram-from-djs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** src/lib/lineups/djName.ts normalizeDjName() 정본과 동일 */
function norm(raw) {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}
async function all(t, c) {
  let o = [], f = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select(c).range(f, f + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    o = o.concat(data);
    if (data.length < 1000) break;
    f += 1000;
  }
  return o;
}

const djs = (await all("djs", "id,display_name,instagram,deleted_at")).filter((d) => !d.deleted_at && d.instagram);
const arts = (await all("artists", "id,display_name,instagram,deleted_at")).filter((a) => !a.deleted_at && !a.instagram);

// 클럽 연결 — DJ: lineup_sets → club_lineups.club_id / 아티스트: club_event_performers → club_events.club_id
const [sets, lineups, ceps, evs] = await Promise.all([
  all("lineup_sets", "dj_id,lineup_id"),
  all("club_lineups", "id,club_id"),
  all("club_event_performers", "artist_id,event_id"),
  all("club_events", "id,club_id"),
]);
const lc = new Map(lineups.map((l) => [l.id, l.club_id]));
const ec = new Map(evs.map((e) => [e.id, e.club_id]));
const djClubs = new Map(), arClubs = new Map();
for (const s of sets) { const c = lc.get(s.lineup_id); if (!c) continue; if (!djClubs.has(s.dj_id)) djClubs.set(s.dj_id, new Set()); djClubs.get(s.dj_id).add(c); }
for (const p of ceps) { const c = ec.get(p.event_id); if (!c) continue; if (!arClubs.has(p.artist_id)) arClubs.set(p.artist_id, new Set()); arClubs.get(p.artist_id).add(c); }

const byKey = new Map();
for (const d of djs) { const k = norm(d.display_name); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(d); }

const apply = [], hold = [];
for (const a of arts) {
  const cands = byKey.get(norm(a.display_name));
  if (!cands) continue;
  const handles = new Set(cands.map((c) => c.instagram.toLowerCase()));
  if (handles.size !== 1) continue;
  const ac = arClubs.get(a.id) ?? new Set();
  const dc = new Set();
  for (const c of cands) for (const x of djClubs.get(c.id) ?? []) dc.add(x);
  const overlap = [...ac].filter((x) => dc.has(x)).length;
  const row = { id: a.id, name: a.display_name, handle: [...handles][0], overlap };
  if (overlap > 0 || norm(a.display_name).length >= 6) apply.push(row); else hold.push(row);
}

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}채울 대상 ${apply.length}건 / 보류 ${hold.length}건\n`);
for (const r of apply) {
  console.log(`  ${r.name} -> @${r.handle} (클럽겹침 ${r.overlap})`);
  if (!DRY_RUN) {
    const { error } = await sb.from("artists").update({ instagram: r.handle }).eq("id", r.id).is("instagram", null);
    if (error) console.log("   ! 실패:", error.message);
  }
}
if (hold.length) {
  console.log(`\n보류 — 짧은 이름인데 같은 클럽 출연 기록이 없어 동명이인 배제 불가 (사람이 확인):`);
  for (const r of hold) console.log(`  ${r.name} -> @${r.handle}`);
}
