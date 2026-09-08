/**
 * 같은 인스타그램 핸들로 두 행 이상 갈린 djs 를 하나로 합친다.
 *
 * 배경(2026-09-09): merge-duplicate-djs.mjs 는 **이름 정규화 키**로 묶는다.
 * 그런데 실제 분열은 이름이 아예 다른 형태로도 난다 — 포스터에는 사람 이름,
 * 캡션에는 핸들만 적힌 경우다:
 *
 *   TWELVEY  (포스터 "TWELVEY")     @twelvey12
 *   twelvey12(캡션 "@twelvey12")    @twelvey12   ← 같은 사람, 다른 행
 *
 * 이름 키(twelvey vs twelvey12)가 달라 기존 스크립트로는 안 잡힌다. 실측 20쌍.
 * 인스타 핸들은 계정당 유일하므로 같은 핸들 = 같은 사람이라고 봐도 된다.
 *
 * 생존자 규칙(기존 스크립트와 동일):
 *   출연(lineup_sets) 많은 쪽 > 먼저 만들어진 쪽
 *   단, 이름이 핸들 그대로인 행("twelvey12")보다 사람 이름("TWELVEY")을 우선한다 —
 *   화면에 뜨는 이름이라 사람이 읽을 수 있는 쪽이 낫다.
 *
 * ⚠️ 팀/합작 이름은 제외한다. "BRIXX & HERMIT"(2인조)와 "BRIXX"(솔로)는 같은
 *    핸들을 쓰더라도 서로 다른 출연 단위다 — 합치면 2인조 공연이 솔로 이력으로
 *    둔갑한다.
 *
 * 사용: DRY_RUN=1 node scripts/merge-djs-by-instagram.mjs
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

/** 팀/합작 표기 — 합치면 안 된다 */
const TEAM_RE = /(\s&\s|\sB2B\s|\sX\s|\svs\s|\s＆\s)/i;
/** 표시 이름이 핸들을 그대로 베낀 것인가 (사람 이름 쪽을 살리기 위한 판정) */
const looksLikeHandle = (name, handle) =>
  String(name).toLowerCase().replace(/[^a-z0-9]/g, "") === String(handle).toLowerCase().replace(/[^a-z0-9]/g, "");

const djs = (await all("djs", "*")).filter((d) => !d.deleted_at && d.instagram);
const sets = await all("lineup_sets", "id,dj_id");
const favs = await all("user_favorite_djs", "id,user_id,dj_id");
const claims = await all("dj_claims", "id,dj_id");
const aliases = await all("dj_aliases", "id,dj_id,alias,normalized");

const setCount = new Map();
for (const s of sets) setCount.set(s.dj_id, (setCount.get(s.dj_id) || 0) + 1);

const groups = new Map();
for (const d of djs) {
  const k = d.instagram.toLowerCase();
  if (!groups.get(k)) groups.set(k, []);
  groups.get(k).push(d);
}

const merges = [], skipped = [];
for (const [handle, rows] of groups) {
  if (rows.length < 2) continue;
  if (rows.some((r) => TEAM_RE.test(r.display_name))) { skipped.push([handle, rows]); continue; }

  const sorted = [...rows].sort((a, b) =>
    // 사람 이름 > 핸들 복사본
    (looksLikeHandle(a.display_name, handle) ? 1 : 0) - (looksLikeHandle(b.display_name, handle) ? 1 : 0) ||
    (setCount.get(b.id) || 0) - (setCount.get(a.id) || 0) ||
    String(a.created_at).localeCompare(String(b.created_at))
  );
  merges.push({ handle, keep: sorted[0], drop: sorted.slice(1) });
}

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}합칠 그룹 ${merges.length}개 / 팀 표기라 제외 ${skipped.length}개\n`);

// ⚠️ links_checked_at 은 여기 넣지 않는다. 이건 데이터가 아니라 **조회 이력**이라
// 상속 대상이 아니다 — "저 행의 프로필을 봤다"가 survivor 의 이력이 될 수 없다.
// 물려주면 drop 행이 결함 있는 스캔(예: 8/30 사클-온리)에서 찍힌 stamp 를
// survivor 가 떠안아 90일간 재조회에서 빠진다. 한 번 더 보는 값은 $0.0023 이고,
// 안 보는 값은 영구 누락이다.
const FIELDS = ["soundcloud_url", "youtube_url", "bio", "photo_url", "resident_club_id", "claimed_by_user_id", "claimed_at"];
let movedSets = 0, movedAliases = 0, movedFavs = 0, movedClaims = 0, filled = 0;

for (const { handle, keep, drop } of merges) {
  console.log(`■ @${handle}: "${keep.display_name}" ← ${drop.map((d) => `"${d.display_name}"`).join(", ")}`);

  const patch = {};
  for (const f of FIELDS) if (!keep[f]) { const src = drop.find((d) => d[f]); if (src) patch[f] = src[f]; }
  if (Object.keys(patch).length) {
    console.log(`   보강: ${Object.keys(patch).join(", ")}`);
    filled++;
    if (!DRY_RUN) {
      const { error } = await sb.from("djs").update(patch).eq("id", keep.id);
      if (error) console.log("   ! djs 보강 실패:", error.message);
    }
  }

  for (const d of drop) {
    const mySets = sets.filter((s) => s.dj_id === d.id);
    const myAliases = aliases.filter((a) => a.dj_id === d.id);
    const myFavs = favs.filter((f) => f.dj_id === d.id);
    const myClaims = claims.filter((c) => c.dj_id === d.id);
    const keepFavUsers = new Set(favs.filter((f) => f.dj_id === keep.id).map((f) => f.user_id));

    console.log(`   ${d.display_name}: sets ${mySets.length} / aliases ${myAliases.length} / favs ${myFavs.length} / claims ${myClaims.length}`);
    if (DRY_RUN) { movedSets += mySets.length; movedAliases += myAliases.length; continue; }

    if (mySets.length) {
      const { error } = await sb.from("lineup_sets").update({ dj_id: keep.id }).eq("dj_id", d.id);
      if (error) { console.log("   ! lineup_sets 실패:", error.message); continue; }
    }
    if (myAliases.length) {
      const { error } = await sb.from("dj_aliases").update({ dj_id: keep.id }).eq("dj_id", d.id);
      if (error) console.log("   ! dj_aliases 실패:", error.message);
    }
    for (const f of myFavs) {
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

    movedSets += mySets.length; movedAliases += myAliases.length; movedFavs += myFavs.length; movedClaims += myClaims.length;
  }
}

if (skipped.length) {
  console.log(`\n⚠ 팀 표기라 자동 병합 제외 (사람이 확인):`);
  for (const [h, rows] of skipped) console.log(`   @${h}: ` + rows.map((r) => `"${r.display_name}"`).join(" vs "));
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}이동: sets ${movedSets} / aliases ${movedAliases} / favs ${movedFavs} / claims ${movedClaims} / 보강 ${filled}건`);
console.log(`소프트삭제: ${merges.reduce((a, m) => a + m.drop.length, 0)}개`);
