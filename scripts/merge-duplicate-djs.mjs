/**
 * 정규화 키가 같은데 두 행으로 갈린 djs 를 하나로 합친다.
 *
 * 배경: dj_aliases.normalized 에 UNIQUE 가 걸려 있어서 원래는 분열이 불가능한데,
 * 일부 일회성 백필 스크립트(backfill-caption-lineups.mjs 등)가 정본
 * normalizeDjName(소문자) 대신 **대문자 + MC/LIVE/GUEST 접두 제거** 버전을 자체
 * 구현해 쓰는 바람에 "MCCOL"이 정본 키 `mccol` 과 별개로 `COL` 이라는 키를 만들었고,
 * 그 결과 같은 DJ가 두 행으로 갈렸다(2026-08-26 백필 때 33쌍 발생).
 *
 * 합치는 규칙:
 *   - 생존자: instagram 이 있는 쪽 > 출연(lineup_sets) 많은 쪽 > 먼저 만들어진 쪽
 *   - 서로 다른 instagram 이 둘 다 있으면 **손대지 않고 보고만** 한다(동명이인일 수 있음)
 *   - 별칭은 지우지 않고 생존자로 옮긴다. 잘못된 키(`COL`)도 살려두면 그 스크립트를
 *     또 돌려도 새 행을 만들지 않고 생존자로 붙으므로 재발 방어가 된다.
 *   - 패자는 hard delete 하지 않고 deleted_at 소프트 삭제(참조 무결성 규약)
 *
 * 사용: DRY_RUN=1 node scripts/merge-duplicate-djs.mjs
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

/** src/lib/lineups/djName.ts normalizeDjName() 정본과 동일해야 한다 */
function normalizeDjName(raw) {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}

async function all(table, cols) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const djs = (await all("djs", "*")).filter((d) => !d.deleted_at);
const sets = await all("lineup_sets", "id,dj_id");
const favs = await all("user_favorite_djs", "id,user_id,dj_id");
const claims = await all("dj_claims", "id,dj_id");
const aliases = await all("dj_aliases", "id,dj_id,alias,normalized");

const setCount = new Map();
for (const s of sets) setCount.set(s.dj_id, (setCount.get(s.dj_id) || 0) + 1);

const groups = new Map();
for (const d of djs) {
  const k = normalizeDjName(d.display_name);
  if (!groups.get(k)) groups.set(k, []);
  groups.get(k).push(d);
}

const merges = [], conflicts = [];
for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  const handles = new Set(rows.filter((r) => r.instagram).map((r) => r.instagram.toLowerCase()));
  if (handles.size > 1) { conflicts.push([key, rows]); continue; }
  const sorted = [...rows].sort((a, b) =>
    (b.instagram ? 1 : 0) - (a.instagram ? 1 : 0) ||
    (setCount.get(b.id) || 0) - (setCount.get(a.id) || 0) ||
    String(a.created_at).localeCompare(String(b.created_at))
  );
  merges.push({ key, keep: sorted[0], drop: sorted.slice(1) });
}

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}합칠 그룹 ${merges.length}개 / 수동 확인 필요 ${conflicts.length}개\n`);

const FIELDS = ["instagram", "soundcloud_url", "bio", "photo_url", "resident_club_id", "claimed_by_user_id", "claimed_at"];
let movedSets = 0, movedAliases = 0, movedFavs = 0, movedClaims = 0, filled = 0;

for (const { key, keep, drop } of merges) {
  const names = drop.map((d) => `"${d.display_name}"`).join(", ");
  console.log(`■ ${key}: "${keep.display_name}"(${keep.instagram ? "@" + keep.instagram : "핸들없음"}) ← ${names}`);

  // 생존자에 비어 있는 필드를 패자에서 채운다
  const patch = {};
  for (const f of FIELDS) if (!keep[f]) { const src = drop.find((d) => d[f]); if (src) patch[f] = src[f]; }
  if (Object.keys(patch).length) {
    console.log(`   보강: ${Object.keys(patch).join(", ")}`);
    filled++;
    if (!DRY_RUN) {
      const { error } = await sb.from("djs").update(patch).eq("id", keep.id);
      if (error) { console.log("   ! djs 보강 실패:", error.message); }
    }
  }

  for (const d of drop) {
    const mySets = sets.filter((s) => s.dj_id === d.id);
    const myAliases = aliases.filter((a) => a.dj_id === d.id);
    const myFavs = favs.filter((f) => f.dj_id === d.id);
    const myClaims = claims.filter((c) => c.dj_id === d.id);
    const keepFavUsers = new Set(favs.filter((f) => f.dj_id === keep.id).map((f) => f.user_id));

    console.log(`   ${d.display_name}: sets ${mySets.length} / aliases ${myAliases.length}(${myAliases.map((a) => a.normalized).join(",")}) / favs ${myFavs.length} / claims ${myClaims.length}`);

    if (!DRY_RUN) {
      if (mySets.length) {
        const { error } = await sb.from("lineup_sets").update({ dj_id: keep.id }).eq("dj_id", d.id);
        if (error) { console.log("   ! lineup_sets 실패:", error.message); continue; }
      }
      if (myAliases.length) {
        const { error } = await sb.from("dj_aliases").update({ dj_id: keep.id }).eq("dj_id", d.id);
        if (error) console.log("   ! dj_aliases 실패:", error.message);
      }
      for (const f of myFavs) {
        // UNIQUE(user_id, dj_id) 충돌이면 옮기지 않고 버린다(이미 생존자를 찜한 유저)
        if (keepFavUsers.has(f.user_id)) { await sb.from("user_favorite_djs").delete().eq("id", f.id); continue; }
        const { error } = await sb.from("user_favorite_djs").update({ dj_id: keep.id }).eq("id", f.id);
        if (error) console.log("   ! favorite 실패:", error.message);
      }
      if (myClaims.length) {
        const { error } = await sb.from("dj_claims").update({ dj_id: keep.id }).eq("dj_id", d.id);
        if (error) console.log("   ! dj_claims 실패:", error.message);
      }
      const { error: delErr } = await sb.from("djs").update({ deleted_at: new Date().toISOString() }).eq("id", d.id);
      if (delErr) console.log("   ! 소프트삭제 실패:", delErr.message);
    }
    movedSets += mySets.length; movedAliases += myAliases.length; movedFavs += myFavs.length; movedClaims += myClaims.length;
  }
}

if (conflicts.length) {
  console.log(`\n⚠ 서로 다른 instagram 이라 자동 병합 제외 (사람이 확인):`);
  for (const [key, rows] of conflicts) console.log(`   ${key}: ` + rows.map((r) => `"${r.display_name}"@${r.instagram || "-"}`).join(" vs "));
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}이동: sets ${movedSets} / aliases ${movedAliases} / favs ${movedFavs} / claims ${movedClaims} / 필드보강 ${filled}건`);
console.log(`소프트삭제 대상 djs: ${merges.reduce((a, m) => a + m.drop.length, 0)}개`);
