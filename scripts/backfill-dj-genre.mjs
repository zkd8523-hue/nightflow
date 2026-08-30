/**
 * DJ 장르를 djs.genre / genre_confidence / genre_source 에 채운다.
 *
 * 선행: Migration 616 (genre 컬럼들)
 *
 * 1순위 — 사운드클라우드 프로필 페이지의 <meta itemprop="genre">.
 *   DJ 본인이 자기 업로드 트랙에 단 태그라, 클럽 태그("어느 클럽에 불려가는가")보다
 *   "무슨 음악을 하는가"에 가깝다. API 키·등록 없이 공개 HTML 로 읽는다.
 *
 * 2순위 — 사클로 못 채운 DJ 는 플레이한 클럽의 genre: 태그로 폴백한다.
 *   정확도는 낮지만(그 클럽에 게스트로 한 번 갔을 수도 있다) 빈칸보다 낫다.
 *   구분이 필요하므로 genre_source 에 'club' 을 남긴다.
 *
 * ⚠️ 원본 태그는 자유 입력이라 노이즈가 심하다(실측: 'News & Politics',
 *    'summer', 활동명, '케이팝,소년만화,K-pop,...'). GENRE_MAP 에 있는 값만
 *    받고 나머지는 버린다 — 모르는 값을 추측해서 넣지 않는다.
 *
 * 사용:
 *   DRY_RUN=1 node scripts/backfill-dj-genre.mjs
 *   node scripts/backfill-dj-genre.mjs
 *   FORCE=1 node scripts/backfill-dj-genre.mjs   # 이미 채워진 것도 다시
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 사클 공식 분류 + 흔한 자유입력 → 대분류 6종(Migration 616 CHECK 와 일치). */
const GENRE_MAP = {
  // House 계열
  house: "House", "deep house": "House", "tech house": "House", "afro house": "House",
  "progressive house": "House", "future house": "House", amapiano: "House",
  disco: "House", "nu disco": "House", garage: "House", "uk garage": "House",
  // Techno 계열
  techno: "Techno", minimal: "Techno", "hard techno": "Techno", acid: "Techno",
  "melodic techno": "Techno", industrial: "Techno",
  // EDM/일렉 계열
  "dance & edm": "EDM", electronic: "EDM", edm: "EDM", dubstep: "EDM",
  "drum & bass": "EDM", "drum and bass": "EDM", dnb: "EDM", "d&b": "EDM",
  trance: "EDM", bass: "EDM", "jersey club": "EDM", hardstyle: "EDM",
  breakbeat: "EDM", electro: "EDM", "future bass": "EDM", moombahton: "EDM",
  // 힙합 계열
  "hip-hop & rap": "HipHop", "hip hop": "HipHop", hiphop: "HipHop", "hip-hop": "HipHop",
  rap: "HipHop", trap: "HipHop", drill: "HipHop", boombap: "HipHop", "boom bap": "HipHop",
  // R&B/팝 계열
  "r&b & soul": "RnB", "r&b": "RnB", rnb: "RnB", soul: "RnB", funk: "RnB",
  pop: "RnB", kpop: "RnB", "k-pop": "RnB", jazz: "RnB",
  // 월드/글로벌 계열
  dancehall: "Global", reggae: "Global", afrobeat: "Global", afrobeats: "Global",
  "baile funk": "Global", bouyon: "Global", latin: "Global", world: "Global",
  reggaeton: "Global", "hardcore / punk": "Global",
};

const CLUB_TAG_MAP = {
  "genre:house": "House", "genre:techno": "Techno", "genre:edm": "EDM",
  "genre:hiphop": "HipHop", "genre:rnb": "RnB", "genre:kpop": "RnB",
  "genre:pop": "RnB", "genre:funk": "RnB", "genre:latin": "Global",
  "genre:reggae": "Global", "genre:rock": "Global", "genre:indie": "Global",
  // 'genre:mix' / 'genre:etc' 는 장르가 아니라 "여러 장르/모름"이라 매핑하지 않는다.
};

const normalize = (raw) => GENRE_MAP[raw.toLowerCase().trim()] ?? null;

/** 태그 배열 → { genre, confidence } (최빈값과 그 비율). */
function pickTop(list) {
  if (!list.length) return null;
  const count = {};
  for (const g of list) count[g] = (count[g] ?? 0) + 1;
  const [genre, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return { genre, confidence: Math.round((n / list.length) * 100) };
}

let query = sb
  .from("djs")
  .select("id, display_name, soundcloud_url, genre")
  .is("deleted_at", null)
  .eq("is_test", false);

const { data: djs, error } = await query;
if (error) {
  throw new Error(
    `djs 조회 실패: ${error.message}\n(genre 컬럼이 없다면 Migration 616 을 먼저 적용하세요)`
  );
}

const targets = (djs ?? []).filter((d) => FORCE || !d.genre);
console.log(`🎯 대상 ${targets.length}명 (전체 ${djs?.length ?? 0}명)${DRY_RUN ? " · DRY RUN" : ""}\n`);

// ── 1단계: 사운드클라우드 태그 ────────────────────────────────────────────
const unresolved = [];
let scOk = 0;
for (const d of targets) {
  if (!d.soundcloud_url) {
    unresolved.push(d);
    continue;
  }
  let top = null;
  try {
    const res = await fetch(d.soundcloud_url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (res.ok) {
      const html = await res.text();
      const raw = [...html.matchAll(/itemprop="genre"\s+content="([^"]*)"/g)].map((m) =>
        m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim()
      );
      top = pickTop(raw.map(normalize).filter(Boolean));
    }
  } catch {
    /* 네트워크 실패는 폴백 대상으로 넘긴다 */
  }

  if (!top) {
    unresolved.push(d);
    console.log(`  · ${d.display_name.padEnd(16)} 사클 태그 없음 → 클럽 폴백 대기`);
  } else {
    scOk++;
    console.log(`  ✓ ${d.display_name.padEnd(16)} ${top.genre} ${top.confidence}%`);
    if (!DRY_RUN) {
      await sb
        .from("djs")
        .update({
          genre: top.genre,
          genre_confidence: top.confidence,
          genre_source: "soundcloud",
          genre_updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
    }
  }
  await sleep(900); // 공개 페이지를 긁는 것이므로 간격을 둔다
}

// ── 2단계: 클럽 태그 폴백 ────────────────────────────────────────────────
console.log(`\n── 클럽 태그 폴백 (${unresolved.length}명) ──`);
let clubOk = 0;
for (const d of unresolved) {
  const { data: sets } = await sb
    .from("lineup_sets")
    .select("club_lineups(clubs(tags, status, is_test, deleted_at))")
    .eq("dj_id", d.id)
    .limit(40);

  const tags = [];
  for (const s of sets ?? []) {
    const lineup = Array.isArray(s.club_lineups) ? s.club_lineups[0] : s.club_lineups;
    const club = lineup && (Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs);
    if (!club || club.deleted_at || club.is_test || club.status !== "approved") continue;
    for (const t of club.tags ?? []) {
      const mapped = CLUB_TAG_MAP[t];
      if (mapped) tags.push(mapped);
    }
  }

  const top = pickTop(tags);
  if (!top) {
    console.log(`  ✗ ${d.display_name.padEnd(16)} 근거 없음 — 비워둔다`);
    continue;
  }
  clubOk++;
  console.log(`  ✓ ${d.display_name.padEnd(16)} ${top.genre} ${top.confidence}% (클럽)`);
  if (!DRY_RUN) {
    await sb
      .from("djs")
      .update({
        genre: top.genre,
        genre_confidence: top.confidence,
        genre_source: "club",
        genre_updated_at: new Date().toISOString(),
      })
      .eq("id", d.id);
  }
}

const filled = scOk + clubOk;
console.log(
  `\n📊 ${filled}/${targets.length} 확보 (사클 ${scOk} · 클럽 ${clubOk} · 실패 ${targets.length - filled})`
);
if (DRY_RUN) console.log("※ DRY RUN — 아무것도 저장하지 않았습니다");
