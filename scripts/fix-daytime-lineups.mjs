/**
 * 낮 시간대로 잘못 저장된 라인업 시각을 밤으로 되돌린다.
 *
 * 왜(2026-08-27): XX2 라인업이 11:30 / 12:00 / 12:30 시작으로 저장돼 있었다.
 * 클럽 영업시간은 21:00-10:00 이므로 명백히 12시간제 변환 누락이다
 * (11:30 -> 23:30, 12:30 -> 00:30 이어야 한다). 포스터 원본이 남아 있지 않아
 * 재파싱은 불가능하지만, 변환 규칙 자체가 결정적이라 계산으로 되돌릴 수 있다.
 *
 * 안전장치: 첫 셋이 09~19시인 라인업만 손댄다. 이미 정상인 것은 건드리지 않는다.
 *
 * ⚠️ start_min 은 벽시계가 아니라 "영업일 06시부터 경과한 분"이다.
 *    (22:00 -> (22-6)*60 = 960). 이걸 벽시계로 오독해서 "29건이 깨졌다"고
 *    잘못 진단한 적이 있다 — 반드시 wall()/toMin() 쌍으로 환산할 것.
 *
 * 사용: DRY_RUN=1 node scripts/fix-daytime-lineups.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY = process.env.DRY_RUN === "1";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CUTOFF = 6, NIGHT_END = 9;
/** 저장분 → 벽시계 시각(시, 분) */
const toWall = (m) => [(Math.floor(m / 60) + CUTOFF) % 24, m % 60];
/** 벽시계 시각 → 저장분 (toBusinessMinutes 와 동일 규칙) */
const toMin = (h, mi) => ((h < NIGHT_END ? h + 24 : h) - CUTOFF) * 60 + mi;
const fmt = (m) => { const [h, mi] = toWall(m); return `${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}`; };

/** 12시간제 보정: 8..11 -> +12, 12 -> 0, 나머지는 그대로 */
function fixHour(h) {
  if (h >= 8 && h <= 11) return h + 12;
  if (h === 12) return 0;
  return h;
}

async function all(t, s) {
  const o = []; let i = 0;
  for (;;) { const { data } = await sb.from(t).select(s).range(i, i + 999);
    if (!data?.length) break; o.push(...data); if (data.length < 1000) break; i += 1000; }
  return o;
}

const lus = await all("club_lineups", "id,event_date,club_id,lineup_sets(id,raw_name,start_min,end_min)");
const clubs = await all("clubs", "id,name");
const byId = new Map(clubs.map((c) => [c.id, c.name]));

let fixedLineups = 0, fixedSets = 0;
for (const l of lus) {
  const sets = (l.lineup_sets ?? []).filter((s) => s.start_min != null);
  if (!sets.length) continue;
  const first = Math.min(...sets.map((s) => s.start_min));
  const [fh] = toWall(first);
  if (fh < 9 || fh > 19) continue; // 정상

  console.log(`\n■ ${l.event_date} ${byId.get(l.club_id) ?? "?"}`);
  let touched = 0;
  for (const s of l.lineup_sets ?? []) {
    const upd = {};
    for (const key of ["start_min", "end_min"]) {
      if (s[key] == null) continue;
      const [h, mi] = toWall(s[key]);
      const nh = fixHour(h);
      if (nh === h) continue;
      upd[key] = toMin(nh, mi);
    }
    if (!Object.keys(upd).length) continue;
    console.log(`   ${s.raw_name}: ${fmt(s.start_min)}${s.end_min!=null?`-${fmt(s.end_min)}`:""} → ${upd.start_min!=null?fmt(upd.start_min):fmt(s.start_min)}${(upd.end_min??s.end_min)!=null?`-${fmt(upd.end_min??s.end_min)}`:""}`);
    if (!DRY) {
      const { error } = await sb.from("lineup_sets").update(upd).eq("id", s.id);
      if (error) { console.log(`      ⚠️ ${error.message}`); continue; }
    }
    touched++; fixedSets++;
  }
  if (touched) fixedLineups++;
}

console.log(`\n${"=".repeat(46)}`);
console.log(`📊 ${DRY ? "예상" : "완료"} — 라인업 ${fixedLineups}건 / 셋 ${fixedSets}개`);
console.log("=".repeat(46));
