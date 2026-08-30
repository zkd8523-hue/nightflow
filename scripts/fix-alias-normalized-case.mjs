/**
 * dj_aliases / artist_aliases 의 normalized 를 정본(소문자)으로 되돌린다.
 *
 * 배경: backfill-caption-lineups.mjs 가 toUpperCase() 로 정규화 키를 만들어
 * "ARKINS" 같은 대문자 키가 245개 쌓였다. 정본은 소문자라 수집기가 "arkins" 로
 * 조회하면 못 찾고 같은 DJ 를 새 행으로 또 만든다 — 8/30 하루에 11쌍 분열(실측).
 * UNIQUE(normalized) 도 대소문자를 다른 값으로 보므로 DB 가 막아주지 못한다.
 *
 * 규칙:
 *   - 소문자 짝이 이미 있으면: 대문자 행을 지운다(같은 DJ면 중복, 다른 DJ면
 *     그건 이미 분열이라 merge-duplicate-djs.mjs 가 처리할 몫)
 *   - 소문자 짝이 없으면: 그 행의 normalized 만 소문자로 고친다
 *
 * 사용: DRY_RUN=1 node scripts/fix-alias-normalized-case.mjs
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

async function all(t, c) {
  let o = [], f = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select(c).range(f, f + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    o = o.concat(data || []);
    if (!data || data.length < 1000) break;
    f += 1000;
  }
  return o;
}

for (const [table, idCol] of [["dj_aliases", "dj_id"], ["artist_aliases", "artist_id"]]) {
  const rows = await all(table, `id, ${idCol}, alias, normalized`);
  const byNorm = new Map(rows.map((r) => [r.normalized, r]));
  const bad = rows.filter((r) => r.normalized !== r.normalized.toLowerCase());
  let fixed = 0, removed = 0, conflict = 0;

  for (const r of bad) {
    const lower = r.normalized.toLowerCase();
    const twin = byNorm.get(lower);
    if (twin) {
      // 소문자 짝이 이미 있다 — 대문자 행은 잉여다
      if (twin[idCol] !== r[idCol]) conflict++; // 서로 다른 사람을 가리킴 = 이미 분열
      if (!DRY_RUN) await sb.from(table).delete().eq("id", r.id);
      removed++;
    } else {
      if (!DRY_RUN) {
        const { error } = await sb.from(table).update({ normalized: lower }).eq("id", r.id);
        if (error) { console.log(`  ❌ ${r.alias}: ${error.message}`); continue; }
      }
      byNorm.set(lower, r);
      fixed++;
    }
  }
  console.log(`${table}: 대문자 ${bad.length}건 → 소문자로 수정 ${fixed} / 중복 제거 ${removed} (그중 다른 대상 가리킴 ${conflict})`);
}
console.log(DRY_RUN ? "\n(DRY RUN — 저장하지 않음)" : "\n완료");
