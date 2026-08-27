/**
 * 같은 instagram 핸들을 가진 artists 행을 하나로 병합한다.
 *
 * 배경: artist_aliases.normalized 는 한글↔영문을 자동 매칭하지 않는다
 * (djName.ts 규약과 동일). "키드밀리"와 "KID MILLI"가 각각 별도 artist 로
 * 생성되는데, 인스타 핸들이 같다면 같은 사람이라는 강한 증거다.
 *
 * 병합 규칙: 가장 먼저 생성된(created_at 오름차순) 행을 keeper 로 삼고
 *   - 나머지 행의 alias 를 keeper 로 이관 (normalized UNIQUE 라 충돌 시 스킵)
 *   - club_event_performers 의 artist_id 를 keeper 로 재지정 (중복은 삭제)
 *   - 잃어버리면 아까운 필드(soundcloud/youtube/bio/photo/label)는 keeper 가
 *     비어 있을 때만 채운다
 *   - dup 행 삭제
 *
 * 멱등: 재실행해도 이미 병합된 건 대상이 없어 아무 일도 하지 않는다.
 * 사용: DRY_RUN=1 node scripts/merge-artists-by-instagram.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: artists, error } = await sb
  .from("artists")
  .select("id, display_name, instagram, soundcloud_url, youtube_url, bio, photo_url, label, created_at")
  .not("instagram", "is", null)
  .neq("instagram", "")
  .order("created_at", { ascending: true });
if (error) { console.error("조회 실패:", error.message); process.exit(1); }

// 핸들별 그룹 (소문자 기준)
const groups = new Map();
for (const a of artists) {
  const key = a.instagram.trim().toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(a);
}

const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
console.log(DRY_RUN ? "🧪 [DRY RUN]\n" : "🚀 [병합 실행]\n");
console.log(`인스타 보유 아티스트 ${artists.length}명 / 중복 그룹 ${dupGroups.length}개\n`);

let merged = 0, aliasMoved = 0, perfMoved = 0;

/**
 * keeper 선정 — 생성 순서가 아니라 "표시명으로 쓸 만한가"로 고른다.
 * 핸들 문자열을 그대로 display_name 으로 갖고 있는 행(giriboy91, pakaowlla)보다
 * 사람이 읽는 표기(GIRIBOY, PAK)가 화면에 나가야 하기 때문.
 */
function pickKeeper(rows, handle) {
  const h = handle.toLowerCase();
  const score = (r) => {
    const n = (r.display_name ?? "").trim();
    const flat = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    let s = 0;
    if (flat === h.replace(/[^a-z0-9]/g, "")) s -= 100; // 핸들 그대로면 강한 감점
    if (/[가-힣]/.test(n)) s += 10;                      // 한글 표기 우대
    if (/[A-Z]/.test(n) && n === n.toUpperCase()) s += 3; // 아티스트명은 대문자 표기가 흔함
    if (n.length >= 2 && n.length <= 20) s += 2;
    return s;
  };
  return [...rows].sort((a, b) => score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at))[0];
}

for (const [handle, rows] of dupGroups) {
  const keeper = pickKeeper(rows, handle);
  const dups = rows.filter((r) => r.id !== keeper.id);
  console.log(`@${handle}: ${rows.map((r) => r.display_name).join(" / ")}  → keeper: ${keeper.display_name}`);

  if (DRY_RUN) { merged += dups.length; continue; }

  for (const dup of dups) {
    // 1) alias 이관 (normalized UNIQUE 충돌은 이미 keeper 쪽에 있다는 뜻이라 그냥 삭제)
    const { data: aliases } = await sb.from("artist_aliases").select("id, normalized").eq("artist_id", dup.id);
    for (const al of aliases ?? []) {
      const { error: upErr } = await sb.from("artist_aliases").update({ artist_id: keeper.id }).eq("id", al.id);
      if (upErr) await sb.from("artist_aliases").delete().eq("id", al.id);
      else aliasMoved++;
    }

    // 2) 공연 조인 재지정 (event_id+artist_id UNIQUE 충돌 시 dup 쪽 삭제)
    const { data: perfs } = await sb.from("club_event_performers").select("id, event_id").eq("artist_id", dup.id);
    for (const p of perfs ?? []) {
      const { error: upErr } = await sb.from("club_event_performers").update({ artist_id: keeper.id }).eq("id", p.id);
      if (upErr) await sb.from("club_event_performers").delete().eq("id", p.id);
      else perfMoved++;
    }

    // 3) keeper 가 비어 있는 부가 정보만 채운다
    const fill = {};
    for (const f of ["soundcloud_url", "youtube_url", "bio", "photo_url", "label"]) {
      if (!keeper[f] && dup[f]) fill[f] = dup[f];
    }
    if (Object.keys(fill).length) await sb.from("artists").update(fill).eq("id", keeper.id);

    // 4) dup 삭제
    await sb.from("artists").delete().eq("id", dup.id);
    merged++;
  }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 병합된 중복 행: ${merged}개`);
if (!DRY_RUN) {
  console.log(`   이관된 alias: ${aliasMoved} / 공연 연결: ${perfMoved}`);
  const { count } = await sb.from("artists").select("*", { count: "exact", head: true });
  const { count: withIg } = await sb.from("artists").select("*", { count: "exact", head: true }).not("instagram", "is", null);
  console.log(`   현재 아티스트: ${count}명 (인스타 보유 ${withIg}명)`);
}
console.log("=".repeat(56));
