/**
 * ensure_dj/ensure_artist 경합으로 갈라진 동일인을 병합한다(Migration 610 이전 데이터).
 *
 * 증상: 이름이 완전히 같은데 djs 행이 둘. 하나는 dj_aliases 에 별칭이 있고,
 * 다른 하나는 별칭 없는 고아다(경합에서 진 쪽). 고아는 다음 호출에서도 안 잡혀
 * 라인업이 두 사람에게 쪼개진다.
 *
 * 병합 규칙: 별칭이 있는 쪽을 정본(keeper)으로 삼고, 고아의 참조를 옮긴 뒤 지운다.
 * 인스타 핸들은 keeper 가 비어 있을 때만 고아 것을 가져온다.
 *
 * 사용: DRY_RUN=1 node scripts/merge-split-djs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DRY = process.env.DRY_RUN === "1";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const norm = (s) => String(s ?? "").toUpperCase().replace(/^(DJ|MC)\s*/i, "").replace(/[^\p{L}\p{N}]/gu, "");

const { data: djs } = await sb.from("djs").select("id,display_name,instagram,created_at");
const { data: aliases } = await sb.from("dj_aliases").select("dj_id");
const hasAlias = new Set((aliases ?? []).map((a) => a.dj_id));

const byNorm = {};
for (const d of djs) {
  const k = norm(d.display_name);
  if (k.length < 2) continue;
  (byNorm[k] ??= []).push(d);
}

let merged = 0, skipped = 0;
for (const [k, group] of Object.entries(byNorm)) {
  if (group.length < 2) continue;
  // 별칭이 있는 쪽이 정본. 둘 다 있거나 둘 다 없으면 먼저 만들어진 쪽.
  const withAlias = group.filter((d) => hasAlias.has(d.id));
  const keeper = (withAlias.length ? withAlias : group)
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  const losers = group.filter((d) => d.id !== keeper.id);
  if (!losers.length) continue;

  console.log(`${DRY ? "[DRY] " : ""}${k}: keeper=${keeper.display_name} ← ${losers.map((l) => l.display_name).join(", ")} (${losers.length}건)`);
  if (DRY) { merged += losers.length; continue; }

  for (const loser of losers) {
    // 라인업 셋의 참조를 keeper 로 옮긴다.
    const { error: e1 } = await sb.from("lineup_sets").update({ dj_id: keeper.id }).eq("dj_id", loser.id);
    if (e1) { console.log(`  ⚠️ sets 이관 실패(${loser.id}): ${e1.message}`); skipped++; continue; }

    // 핸들은 keeper 가 비어 있을 때만 승계한다.
    if (!keeper.instagram && loser.instagram) {
      await sb.from("djs").update({ instagram: loser.instagram }).eq("id", keeper.id);
      keeper.instagram = loser.instagram;
    }
    // 고아의 별칭이 있다면 keeper 로 옮긴다(UNIQUE 충돌 시 그냥 버린다 — 이미 keeper 것이다).
    await sb.from("dj_aliases").update({ dj_id: keeper.id }).eq("dj_id", loser.id);

    const { error: e3 } = await sb.from("djs").delete().eq("id", loser.id);
    if (e3) { console.log(`  ⚠️ 삭제 실패(${loser.id}): ${e3.message}`); skipped++; continue; }
    merged++;
  }
}
console.log(`\n${DRY ? "[DRY] " : ""}병합 ${merged}건 / 실패 ${skipped}건`);
