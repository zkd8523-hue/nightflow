/**
 * DJ 인스타 프로필의 바이오·외부링크에서 사운드클라우드 주소를 찾아 djs.soundcloud_url 을 채운다.
 *
 * 왜 "이름으로 추측"이 아니라 인스타 경유인가 (실측 근거):
 *   soundcloud.com/{DJ이름} 을 그대로 찍으면 52%가 200을 반환해 성공처럼 보인다.
 *   그런데 실제 주인을 까보면 전혀 다른 사람이다 —
 *     WAVY → "lurz",  POOL → "truth",  SWEED → 스웨덴 프로듀서,
 *     HARLEY → 호주 브리즈번,  NICKO → 그리스 코르푸섬
 *   실명 DJ 프로필에 남의 음악이 붙는 사고가 된다(discover-dj-instagram.mjs 의
 *   "Ash → @ash.island" 오연결과 같은 종류). 반면 인스타 바이오의 링크는 DJ 본인이
 *   올린 것이라 오연결이 원천적으로 불가능하다 — 그래서 이 경로만 쓴다.
 *   실제로 HERMIT 의 진짜 주소는 d_qhxxn, NEWT 는 newt_sori 로 이름과 무관했다.
 *
 * 대상: lineup_sets 에 실제로 올라간 DJ 중 instagram 이 있고 soundcloud_url 이 빈 DJ.
 *   (라인업에 없는 DJ는 유저가 마주칠 일이 없어 돈 쓸 이유가 없다)
 *
 * 사용:
 *   DRY_RUN=1 node scripts/discover-dj-soundcloud.mjs        # 저장 안 함(먼저 이걸로 확인)
 *   DRY_RUN=1 LIMIT=30 node scripts/discover-dj-soundcloud.mjs
 *   node scripts/discover-dj-soundcloud.mjs                  # 실제 저장
 *   MIN_SETS=3 node scripts/discover-dj-soundcloud.mjs       # 셋 3회 이상만
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = Number(process.env.LIMIT ?? 0); // 0 = 전체
const MIN_SETS = Number(process.env.MIN_SETS ?? 1);
const CHUNK = 30; // discover-dj-instagram.mjs 와 동일

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Apify 호출.
 *
 * ⚠️ 기존 discover-dj-instagram.mjs 의 헬퍼는 `Array.isArray(data) ? data : []` 로
 * 끝나서, 토큰 만료·크레딧 소진(401/402)이 나도 "결과 0건"과 구분이 안 됐다.
 * 실제로 잘못된 토큰은 {error:{type,message}} 객체를 준다 — 조용히 삼키면
 * 돈만 쓰고 0건이 나온 건지 인증이 깨진 건지 알 수 없으므로 여기선 던진다.
 */
async function apify(actor, body) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    const msg = data?.error?.message ?? JSON.stringify(data ?? {}).slice(0, 200);
    throw new Error(`Apify ${res.status}: ${msg}`);
  }
  return data;
}

/**
 * 청크 단위 재시도.
 *
 * 실측 사고: 394명 중 390명까지 긁고(=이미 과금됨) 마지막 청크에서 read ETIMEDOUT 이
 * 나자 스크립트가 통째로 죽어 결과 전부를 잃었다. 네트워크 오류는 일시적이므로
 * 재시도하고, 끝내 실패해도 그 청크만 버리고 나머지는 살린다.
 * 인증·크레딧 오류(Apify 4xx)는 재시도해봐야 같으므로 즉시 중단한다.
 */
async function apifyWithRetry(actor, body, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await apify(actor, body);
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/^Apify 4\d\d/.test(msg)) throw e; // 토큰·크레딧 문제 — 재시도 무의미
      if (attempt === tries) {
        console.log(`  ⚠️ 청크 실패(${tries}회 시도) — 건너뜀: ${msg.slice(0, 120)}`);
        return null;
      }
      console.log(`  … 재시도 ${attempt}/${tries - 1} (${msg.slice(0, 60)})`);
      await sleep(3000 * attempt);
    }
  }
  return null;
}

/** 유튜브 채널 주소만 골라낸다.
 *  @handle / channel/UC... / c/name / user/name 네 형태를 인정하고,
 *  채널을 우선 쓰되, 없으면 개별 영상(watch?v=, youtu.be/, shorts/, live/)도 받는다 —
 *  이 칸의 목적은 "들을 수 있는 링크"라 영상 하나여도 쓸모가 있다.
 *  쿼리스트링(?si=... 추적 파라미터)은 떼고 저장한다. */
function toYoutubeUrl(raw) {
  if (!raw) return null;
  const str = String(raw);
  // 채널이 우선 — "이 사람의 유튜브"로는 채널이 가장 정확하다
  const ch = /https?:\/\/(?:www\.|m\.)?youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)/i.exec(str);
  if (ch) return `https://www.youtube.com/${ch[1]}`;
  // 채널이 없으면 개별 영상도 받는다 — 미리듣기 용도라 "들을 수 있는 링크"면 충분하고,
  // 자기 믹스 영상 하나만 바이오에 걸어두는 DJ 가 실제로 많다.
  // 추적 파라미터(?si=…)는 떼고 표준 watch 주소로 통일한다.
  const v = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|live\/))([A-Za-z0-9_-]{11})/i.exec(str);
  if (v) return `https://www.youtube.com/watch?v=${v[1]}`;
  return null;
}

/** 인스타 externalUrls 의 lynx_url 은 추적 래퍼다 — 원본만 꺼낸다.
 *  https://l.instagram.com/?u=<encoded>&e=... */
function unwrapLynx(u) {
  if (!u) return null;
  const m = /[?&]u=([^&]+)/.exec(u);
  if (!m) return u;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return u;
  }
}

/** 사운드클라우드 프로필 핸들만 남긴다.
 *  트랙/셋 주소(soundcloud.com/{user}/{track})가 와도 프로필로 올린다 —
 *  미리듣기는 "이 DJ가 어떤 사람인지"가 목적이라 한 곡보다 프로필 전체가 맞다. */
const RESERVED = new Set([
  "pages", "discover", "stream", "upload", "you", "search", "tags",
  "people", "charts", "terms", "legal", "imprint", "jobs", "mobile", "oembed",
]);

function toProfileUrl(raw) {
  if (!raw) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([A-Za-z0-9_-]+)/i.exec(raw.trim());
  if (!m) return null;
  const handle = m[1].toLowerCase();
  if (RESERVED.has(handle)) return null;
  return `https://soundcloud.com/${handle}`;
}

/** 단축링크(on.soundcloud.com, soundcloud.app.goo.gl)는 302 를 따라가야 실제 핸들이 나온다.
 *  둘 다 살아있는 것을 실측 확인했다. 쿼리(utm_*, ref=clipboard)는 버린다. */
async function resolveShort(url) {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const loc = res.headers.get("location");
    if (loc) return toProfileUrl(loc);
    // goo.gl 은 본문에 실주소를 심어두기도 한다
    const res2 = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res2.text();
    const hit = /https:\/\/soundcloud\.com\/[A-Za-z0-9_-]+/i.exec(html);
    return hit ? toProfileUrl(hit[0]) : null;
  } catch {
    return null;
  }
}

/** oEmbed 로 실존 확인 + 계정 표시명 획득. 키·등록 불필요, 없는 계정은 404. */
async function verify(profileUrl) {
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(profileUrl)}`
    );
    if (!res.ok) return null;
    const j = await res.json();
    return { title: j.author_name ?? j.title ?? "", thumb: j.thumbnail_url ?? null };
  } catch {
    return null;
  }
}

// ── 1) 대상 DJ 선정 ──────────────────────────────────────────────────────
// UPCOMING=1 이면 "오늘 이후 라인업에 실제로 올라간 DJ"만 본다.
// 전체(400여명)를 돌리면 대부분이 지난 라인업이라, 유저가 지금 마주칠 DJ만
// 골라 조회량을 1/5로 줄이는 용도다.
const UPCOMING = process.env.UPCOMING === "1";
let upcomingIds = null;
if (UPCOMING) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: ups, error: upErr } = await sb
    .from("club_lineups")
    .select("clubs!inner(is_test,status,deleted_at), lineup_sets(dj_id)")
    .gte("event_date", today)
    .limit(300);
  if (upErr) throw new Error(`예정 라인업 조회 실패: ${upErr.message}`);
  upcomingIds = new Set();
  for (const l of ups ?? []) {
    const c = Array.isArray(l.clubs) ? l.clubs[0] : l.clubs;
    if (!c || c.is_test || c.deleted_at || c.status !== "approved") continue;
    for (const s of l.lineup_sets ?? []) if (s.dj_id) upcomingIds.add(s.dj_id);
  }
  console.log(`📅 오늘 이후 라인업 DJ ${upcomingIds.size}명으로 범위 제한\n`);
}

const { data: sets, error: setsErr } = await sb.from("lineup_sets").select("dj_id");
if (setsErr) throw new Error(`lineup_sets 조회 실패: ${setsErr.message}`);

const setCount = new Map();
for (const s of sets ?? []) setCount.set(s.dj_id, (setCount.get(s.dj_id) ?? 0) + 1);

const ids = [...setCount.keys()];
const djs = [];
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await sb
    .from("djs")
    .select("id, display_name, instagram, soundcloud_url, youtube_url, is_test, deleted_at")
    .in("id", ids.slice(i, i + 200));
  if (error) throw new Error(`djs 조회 실패: ${error.message}`);
  djs.push(...(data ?? []));
}

let targets = djs
  .filter((d) => !upcomingIds || upcomingIds.has(d.id))
  // 사클이 없거나 유튜브가 없으면 대상 — 한 번 조회로 둘 다 챙긴다
  .filter((d) => !d.deleted_at && !d.is_test && d.instagram && (!d.soundcloud_url || !d.youtube_url))
  .map((d) => ({ ...d, sets: setCount.get(d.id) ?? 0 }))
  .filter((d) => d.sets >= MIN_SETS)
  .sort((a, b) => b.sets - a.sets); // 많이 나오는 DJ부터 — 중단해도 가치가 큰 순

if (LIMIT > 0) targets = targets.slice(0, LIMIT);

console.log(`🎯 대상 ${targets.length}명 (라인업 보유 · 인스타 있음 · SC 없음, 셋 ${MIN_SETS}회+)`);
console.log(`   예상 비용 약 $${(targets.length * 0.0023).toFixed(2)}\n`);
if (targets.length === 0) process.exit(0);

// ── 2) 인스타 프로필 조회 ────────────────────────────────────────────────
const profiles = new Map();
const notFound = [];
const failedChunks = [];
for (let i = 0; i < targets.length; i += CHUNK) {
  const slice = targets.slice(i, i + CHUNK);
  const rows = await apifyWithRetry("apify~instagram-scraper", {
    directUrls: slice.map((d) => `https://www.instagram.com/${d.instagram}/`),
    resultsType: "details",
    resultsLimit: 1,
  });
  if (!rows) {
    failedChunks.push(slice.map((d) => d.display_name));
    continue;
  }
  for (const p of rows) {
    if (!p.username) continue;
    // 없는 계정은 행이 사라지는 게 아니라 error:"not_found" 로 온다 — 세어서 보고한다
    if (p.error) {
      notFound.push(`${p.username} (${p.error})`);
      continue;
    }
    profiles.set(String(p.username).toLowerCase(), p);
  }
  console.log(`  프로필 ${Math.min(i + CHUNK, targets.length)}/${targets.length} 조회`);
  await sleep(500);
}
console.log("");

// ── 3) 링크 추출 → 단축링크 해제 → oEmbed 검증 ──────────────────────────
const found = [];
const shortLinked = [];
const youtubeOnly = [];
const viaLinktree = [];
const nothing = [];
const foundYoutube = [];

for (const dj of targets) {
  const p = profiles.get(String(dj.instagram).toLowerCase());
  if (!p) continue;

  const bio = String(p.biography ?? "");
  const urls = [
    p.externalUrl,
    ...(p.externalUrls ?? []).map((u) => unwrapLynx(u?.lynx_url ?? u?.url ?? u)),
  ].filter(Boolean);
  const blob = [bio, ...urls].join(" ");

  // (a) 바로 쓸 수 있는 프로필 주소
  let profileUrl = null;
  for (const u of [...urls, blob]) {
    profileUrl = toProfileUrl(u) ?? toProfileUrl(/https?:\/\/[^\s]*soundcloud\.com\/[^\s]+/i.exec(String(u))?.[0]);
    if (profileUrl) break;
  }

  // (b) 단축링크면 풀어본다
  if (!profileUrl) {
    const short = /https?:\/\/(?:on\.soundcloud\.com|soundcloud\.app\.goo\.gl)\/[A-Za-z0-9_-]+/i.exec(blob);
    if (short) {
      profileUrl = await resolveShort(short[0]);
      if (profileUrl) shortLinked.push(dj.display_name);
      await sleep(300);
    }
  }

  // 사클과 무관하게, 같은 응답에 유튜브 채널이 있으면 같이 챙긴다.
  // 이 프로필 조회는 어차피 사클 때문에 이미 한 번 한 것이라 추가 비용이 0이다.
  // (전에는 "유튜브만 있음 N명" 하고 세기만 하고 링크를 버리고 있었다)
  if (!dj.youtube_url) {
    const yt = toYoutubeUrl(urls.find((u) => toYoutubeUrl(u))) ?? toYoutubeUrl(/https?:\/\/[^\s]*youtube\.com\/[^\s"']+/i.exec(blob)?.[0]);
    if (yt) foundYoutube.push({ dj_id: dj.id, name: dj.display_name, url: yt });
  }

  if (!profileUrl) {
    if (/youtube\.com|youtu\.be/i.test(blob)) youtubeOnly.push(dj.display_name);
    else if (/linktr\.ee|litelink|bio\.link|lnk\.bio|taplink|url\.kr|campsite\.bio/i.test(blob))
      viaLinktree.push(dj.display_name);
    else nothing.push(dj.display_name);
    continue;
  }

  // (c) 실존 확인 — 죽은 링크를 저장하면 빈 플레이어가 뜬다
  const meta = await verify(profileUrl);
  await sleep(300);
  if (!meta) {
    nothing.push(`${dj.display_name} (링크 있으나 404: ${profileUrl})`);
    continue;
  }

  found.push({
    dj_id: dj.id,
    name: dj.display_name,
    sets: dj.sets,
    url: profileUrl,
    scName: meta.title,
  });
}

// ── 4) 리포트 ────────────────────────────────────────────────────────────
console.log("=== ✅ 사운드클라우드 확보 ===");
for (const f of found) {
  console.log(`  ${f.name.padEnd(18)} 셋${String(f.sets).padStart(2)} → ${f.url}  (${f.scName})`);
}
console.log(`\n  소계 ${found.length}명`);
if (shortLinked.length) console.log(`  (그중 단축링크 해제: ${shortLinked.join(", ")})`);

if (foundYoutube.length) {
  console.log(`\n=== 📺 유튜브 채널도 같이 확보 (추가 비용 0) ===`);
  for (const y of foundYoutube) console.log(`  ${y.name.padEnd(18)} → ${y.url}`);
  console.log(`  소계 ${foundYoutube.length}명`);
}

console.log(`\n=== ⏭  못 찾음 ===`);
console.log(`  유튜브만 있음     ${youtubeOnly.length}명: ${youtubeOnly.slice(0, 12).join(", ")}`);
console.log(`  링크트리 경유     ${viaLinktree.length}명: ${viaLinktree.slice(0, 12).join(", ")}`);
console.log(`  링크 없음         ${nothing.length}명`);
if (notFound.length) console.log(`  ⚠️ 인스타 계정 없음/변경  ${notFound.length}건: ${notFound.slice(0, 12).join(", ")}`);
if (failedChunks.length) {
  const lost = failedChunks.flat();
  console.log(`  ⚠️ 네트워크 오류로 조회 못한 DJ ${lost.length}명 — 재실행하면 다시 시도됨`);
  console.log(`     ${lost.slice(0, 15).join(", ")}`);
}

// ── 5) 저장 ──────────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log("\n(DRY RUN — 저장하지 않음)");
} else {
  let saved = 0;
  for (const f of found) {
    const { error } = await sb.from("djs").update({ soundcloud_url: f.url }).eq("id", f.dj_id);
    if (error) console.log(`  ❌ ${f.name}: ${error.message}`);
    else saved++;
  }
  let savedYt = 0;
  for (const y of foundYoutube) {
    // 이미 있는 값은 덮지 않는다(대상 필터에서 youtube_url 이 빈 것만 담았지만 방어)
    const { error } = await sb.from("djs").update({ youtube_url: y.url }).eq("id", y.dj_id).is("youtube_url", null);
    if (error) console.log(`  ❌ ${y.name} (yt): ${error.message}`);
    else savedYt++;
  }
  console.log(`\n💾 사클 ${saved}건 / 유튜브 ${savedYt}건 저장 완료`);
}

const { count } = await sb
  .from("djs")
  .select("*", { count: "exact", head: true })
  .not("soundcloud_url", "is", null);
console.log(`전체 DJ 사운드클라우드 보유: ${count}명`);
