/**
 * DJ 의 사운드클라우드 주소를 인스타 핸들에서 역추적해 채운다.
 *
 * 왜 필요한가: 뉴스레터에서 "이 DJ 가 무슨 음악을 트는가"를 보여주려면 미리듣기가
 * 있어야 한다. 그런데 이번 주 출연 54명 중 미리듣기 보유는 9명(17%)뿐이었다.
 *
 * 왜 이 방법인가: MusicBrainz 를 먼저 시도했으나 **매칭률 7%** 였다(2026-10-05 실측).
 * 겉보기 80% 는 전부 동명이인이었다 — JASON→Jason Graves(미국 게임음악),
 * THEO→Theo Parrish(디트로이트), PEBBLE→Pebble(벨기에). 클럽 레귤러 DJ 는 국제
 * 음악 DB 에 없다. 반면 인스타 핸들은 수집기가 캡션에서 뽑아 이미 83% 를 갖고 있고,
 * 사운드클라우드 주소가 그 핸들과 같거나 거의 같은 경우가 많다(실측 29/31).
 *
 * ⚠️ 동명이인 위험. `/jason` `/theo` `/pebble` 같은 짧은 주소는 전 세계에 흔하다.
 *    그래서 **후보 주소가 짧고 흔할수록 보수적으로** 판정한다:
 *      - 인스타 핸들과 글자가 많이 겹칠수록 신뢰 (edit distance 가 아니라 포함 관계)
 *      - 계정 제목이 DJ 이름과 맞아야 한다
 *      - 둘 다 애매하면 넣지 않는다. 틀린 음악을 "이 DJ 의 사운드" 라고 소개하는 건
 *        저널에서 치명적이다
 *
 * 사운드클라우드 oEmbed 는 키도 등록도 필요 없다(공개 엔드포인트).
 *
 * 사용:
 *   DRY_RUN=1 node scripts/match-dj-soundcloud.mjs
 *   node scripts/match-dj-soundcloud.mjs
 *   WEEK=1 node scripts/match-dj-soundcloud.mjs   # 이번 주 출연자만
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const WEEK_ONLY = process.env.WEEK === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

/** 인스타 핸들에서 사운드클라우드 후보 주소를 만든다. 앞쪽일수록 신뢰도가 높다. */
function candidates(ig, name) {
  const a = String(ig).toLowerCase();
  const n = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const list = [
    a,                                  // 그대로 (가장 신뢰)
    a.replace(/_+$/, ""),               // 뒤 밑줄만 제거
    a.replace(/[._]/g, ""),             // 구분자 제거
    a.replace(/^dj[._]?/, ""),          // dj 접두 제거
    n,                                  // 활동명 (가장 약함 — 짧고 흔하다)
  ];
  return [...new Set(list)].filter((x) => x && x.length >= 3);
}

/**
 * 이 후보를 믿어도 되는가.
 * 짧은 주소일수록 동명이인 확률이 높으므로 근거를 더 요구한다.
 */
function trustworthy({ handle, igHandle, djName, scTitle }) {
  const h = norm(handle), ig = norm(igHandle), t = norm(scTitle), d = norm(djName);
  if (!h) return false;

  // 1) 인스타 핸들과 **완전히 같으면** 믿는다. 본인이 양쪽에 같은 이름을 쓴 것이다.
  if (h === ig) return true;

  // 2) 인스타 핸들에서 **장식만** 떼어낸 형태도 믿는다 (dj. 접두, 밑줄 꼬리 등).
  //    ⚠️ 단순 포함(includes)으로는 안 된다. @aster_djofficial 이 /aster 를 포함한다고
  //       받아주면 전혀 다른 계정("Laster")이 들어온다(실측 오탐).
  //       ig 에서 h 를 뺀 나머지가 장식 단어일 때만 인정한다.
  //    ⚠️ 2026-10-05: 이 완화 규칙을 세 번 고쳤지만 @aster_djofficial → /aster
  //       ("Laster", 전혀 다른 계정)를 끝내 못 걸렀다. 규칙을 더 조이면 맞는 것까지
  //       떨어진다. **추측으로는 여기가 천장**이라 판단하고 이 경로를 닫았다.
  //       정답은 인스타 프로필의 externalUrl — 본인이 직접 적어둔 주소다.
  //       scripts/enrich-dj-from-instagram.mjs 를 쓴다.

  // 3) 그 외에는 계정 제목이 DJ 이름과 맞아야 한다.
  //    ⚠️ 제목이 사클 주소를 그대로 복창하는 경우가 많아(/jason → "jason") 그것만으로는
  //       근거가 못 된다. 제목이 **주소와 다르면서** DJ 이름과 맞을 때만 받는다.
  //       실측 오탐: ASTER @aster_djofficial → /aster 제목 "Laster" (다른 사람)
  if (!t || !d) return false;
  if (t === h) return false;                 // 제목이 주소 복창이면 정보가 없다
  return t.includes(d) || d.includes(t);
}

// ── 대상 ──────────────────────────────────────────────────────────────────
let targetIds = null;
if (WEEK_ONLY) {
  const today = new Date();
  const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const { data: cl } = await sb.from("club_lineups").select("id")
    .gte("event_date", mon.toISOString().slice(0, 10))
    .lte("event_date", sun.toISOString().slice(0, 10));
  const { data: st } = await sb.from("lineup_sets").select("dj_id").in("lineup_id", (cl ?? []).map((x) => x.id));
  targetIds = [...new Set((st ?? []).map((s) => s.dj_id).filter(Boolean))];
  console.log(`이번 주 출연 DJ ${targetIds.length}명으로 범위를 좁힙니다`);
}

let q = sb.from("djs").select("id,display_name,instagram,soundcloud_url")
  .not("instagram", "is", null).is("soundcloud_url", null).is("deleted_at", null);
if (targetIds) q = q.in("id", targetIds);
const { data: djs, error } = await q;
if (error) { console.log("❌", error.message); process.exit(1); }

console.log(`대상 ${djs.length}명 (인스타 있음 · 사운드클라우드 없음)\n`);

let hit = 0, rejected = 0;
const found = [];
for (const d of djs) {
  const ig = String(d.instagram).replace(/^@/, "");
  let picked = null;
  for (const c of candidates(ig, d.display_name)) {
    try {
      const r = await fetch(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent("https://soundcloud.com/" + c)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!r.ok) { await sleep(200); continue; }
      const j = await r.json();
      if (trustworthy({ handle: c, igHandle: ig, djName: d.display_name, scTitle: j.title })) {
        picked = { handle: c, title: j.title, thumb: j.thumbnail_url };
        break;
      }
      rejected++;   // 존재하지만 본인인지 확신할 수 없어 버린 것
    } catch { /* 넘어간다 */ }
    await sleep(200);
  }
  if (picked) {
    hit++;
    found.push({ id: d.id, name: d.display_name, ig, ...picked });
    console.log(`  ✓ ${String(d.display_name).padEnd(18)} @${ig.padEnd(20)} → /${picked.handle}  "${picked.title}"`);
  }
}

console.log(`\n매칭 ${hit}/${djs.length} · 신뢰 못 해 버린 후보 ${rejected}건`);
if (DRY_RUN) { console.log("[DRY RUN] 저장하지 않았습니다"); process.exit(0); }
if (!found.length) process.exit(0);

let saved = 0;
for (const f of found) {
  const { error: e } = await sb.from("djs")
    .update({ soundcloud_url: `https://soundcloud.com/${f.handle}` })
    .eq("id", f.id).is("soundcloud_url", null);   // 그 사이 채워졌으면 덮지 않는다
  if (e) console.log(`  ❌ ${f.name}: ${e.message}`);
  else saved++;
}
console.log(`✅ ${saved}명 저장`);
