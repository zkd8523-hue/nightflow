/**
 * 링크트리류 페이지를 한 단계 더 파서 사운드클라우드를 찾는다 (1차 백필 보완).
 *
 * discover-dj-soundcloud.mjs 는 인스타 바이오에 사클이 "직접" 있는 경우만 잡는다.
 * 그런데 상당수 DJ는 바이오에 linktr.ee 하나만 걸어두고 그 안에 사클을 넣어둔다.
 * 링크트리 페이지는 그냥 HTML fetch 라 Apify 비용이 0원이다 — 1차에서 놓친 것 중
 * 제일 싸게 건질 수 있는 구간.
 *
 * 안전성은 1차와 동일하다: DJ 본인이 자기 인스타 → 자기 링크트리에 넣은 주소라
 * 오연결이 날 수 없다(이름 추측 방식이 WAVY→lurz 처럼 틀렸던 것과 대조).
 *
 * 사용:
 *   DRY_RUN=1 node scripts/discover-dj-soundcloud-linktree.mjs
 *   node scripts/discover-dj-soundcloud-linktree.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const CHUNK = 30;

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function apifyWithRetry(actor, body, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await apify(actor, body);
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/^Apify 4\d\d/.test(msg)) throw e;
      if (attempt === tries) {
        console.log(`  ⚠️ 청크 실패 — 건너뜀: ${msg.slice(0, 120)}`);
        return null;
      }
      await sleep(3000 * attempt);
    }
  }
  return null;
}

function unwrapLynx(u) {
  if (!u) return null;
  const m = /[?&]u=([^&]+)/.exec(String(u));
  if (!m) return String(u);
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return String(u);
  }
}

const RESERVED = new Set([
  "pages", "discover", "stream", "upload", "you", "search", "tags",
  "people", "charts", "terms", "legal", "imprint", "jobs", "mobile", "oembed",
]);

function toProfileUrl(raw) {
  if (!raw) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([A-Za-z0-9_-]+)/i.exec(String(raw).trim());
  if (!m) return null;
  const handle = m[1].toLowerCase();
  if (RESERVED.has(handle)) return null;
  return `https://soundcloud.com/${handle}`;
}

async function resolveShort(url) {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const loc = res.headers.get("location");
    if (loc) return toProfileUrl(loc);
    const res2 = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res2.text();
    const hit = /https:\/\/soundcloud\.com\/[A-Za-z0-9_-]+/i.exec(html);
    return hit ? toProfileUrl(hit[0]) : null;
  } catch {
    return null;
  }
}

async function verify(profileUrl) {
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(profileUrl)}`
    );
    if (!res.ok) return null;
    const j = await res.json();
    return { title: j.author_name ?? j.title ?? "" };
  } catch {
    return null;
  }
}

/** 유튜브 채널 주소만 골라낸다(개별 영상은 버린다).
 *  discover-dj-soundcloud.mjs 의 toYoutubeUrl 과 동일 규약 — 한쪽을 고치면 같이 고칠 것. */
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

/** 링크트리류 페이지 HTML 에서 사운드클라우드 주소를 캔다.
 *  링크트리는 링크를 JSON(__NEXT_DATA__)에 넣어두므로 HTML 전체를 정규식으로 훑는다.
 *  단축링크가 나오면 한 번 더 푼다. */
async function digLinkPage(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!res.ok) return null;
    let html = await res.text();
    // JSON 안에서는 슬래시가 \/ 로 이스케이프돼 있다
    html = html.replace(/\\\//g, "/");

    // 링크트리 페이지에는 사클과 유튜브가 나란히 걸려 있는 경우가 많다.
    // 페이지는 이미 한 번 받아왔으니 유튜브도 같이 캐면 추가 비용이 0이다.
    const yt = toYoutubeUrl(/https?:\/\/(?:www\.|m\.)?youtube\.com\/[^\s"'<\\]+/i.exec(html)?.[0]);

    const direct = /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[A-Za-z0-9_-]+/i.exec(html);
    if (direct) return { sc: toProfileUrl(direct[0]), yt };

    const short = /https?:\/\/(?:on\.soundcloud\.com|soundcloud\.app\.goo\.gl)\/[A-Za-z0-9_-]+/i.exec(html);
    if (short) return { sc: await resolveShort(short[0]), yt };

    return { sc: null, yt };
  } catch {
    return null;
  }
}

// ── 대상: 라인업 있고 인스타 있고 아직 SC 없는 DJ ────────────────────────
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

const targets = djs
  .filter((d) => !d.deleted_at && !d.is_test && d.instagram && !d.soundcloud_url)
  .map((d) => ({ ...d, sets: setCount.get(d.id) ?? 0 }))
  .sort((a, b) => b.sets - a.sets);

console.log(`🎯 1차에서 못 찾은 ${targets.length}명 재조회 (링크트리 파기)\n`);

// ── 인스타 프로필 재조회 → 링크트리 URL 수집 ────────────────────────────
const linkPages = [];
const directYoutube = [];
for (let i = 0; i < targets.length; i += CHUNK) {
  const slice = targets.slice(i, i + CHUNK);
  const rows = await apifyWithRetry("apify~instagram-scraper", {
    directUrls: slice.map((d) => `https://www.instagram.com/${d.instagram}/`),
    resultsType: "details",
    resultsLimit: 1,
  });
  if (!rows) continue;
  const by = new Map(rows.filter((p) => p.username && !p.error).map((p) => [String(p.username).toLowerCase(), p]));
  for (const d of slice) {
    const p = by.get(String(d.instagram).toLowerCase());
    if (!p) continue;
    const blob = [
      String(p.biography ?? ""),
      p.externalUrl ?? "",
      ...(p.externalUrls ?? []).map((u) => unwrapLynx(u?.lynx_url ?? u?.url ?? u)),
    ].join(" ");
    // 링크트리를 타기 전에, 바이오·외부링크에 유튜브가 바로 있으면 그것부터 챙긴다
    if (!d.youtube_url) {
      const yt = toYoutubeUrl(/https?:\/\/(?:www\.|m\.)?youtube\.com\/[^\s"']+/i.exec(blob)?.[0]);
      if (yt) directYoutube.push({ dj_id: d.id, name: d.display_name, url: yt });
    }
    const lt = /https?:\/\/(?:linktr\.ee|bio\.link|lnk\.bio|campsite\.bio|taplink\.[a-z]+|litelink\.[a-z]+|url\.kr)\/[A-Za-z0-9_.\-]+/i.exec(blob);
    if (lt) linkPages.push({ ...d, page: lt[0] });
  }
  console.log(`  프로필 ${Math.min(i + CHUNK, targets.length)}/${targets.length} 조회`);
  await sleep(500);
}

console.log(`\n링크트리 보유 ${linkPages.length}명 — 각 페이지 파는 중...\n`);

// ── 링크트리 페이지 파기 ────────────────────────────────────────────────
const found = [];
const foundYoutube = [];
for (const d of linkPages) {
  const dug = await digLinkPage(d.page);
  await sleep(400);
  if (!dug) continue;
  if (dug.yt && !d.youtube_url) {
    foundYoutube.push({ dj_id: d.id, name: d.display_name, url: dug.yt });
    console.log(`  📺 ${d.display_name.padEnd(16)} → ${dug.yt}`);
  }
  if (!dug.sc) continue;
  const meta = await verify(dug.sc);
  await sleep(300);
  if (!meta) continue;
  found.push({ ...d, url: dug.sc, scName: meta.title });
  console.log(`  ✅ ${d.display_name.padEnd(16)} → ${dug.sc}  (${meta.title})`);
}

console.log(`\n=== 추가 확보 ${found.length}명 ===`);

if (DRY_RUN) {
  console.log("(DRY RUN — 저장하지 않음)");
} else {
  let saved = 0;
  for (const f of found) {
    const { error } = await sb.from("djs").update({ soundcloud_url: f.url }).eq("id", f.dj_id ?? f.id);
    if (error) console.log(`  ❌ ${f.display_name}: ${error.message}`);
    else saved++;
  }
  let savedYt = 0;
  for (const y of [...directYoutube, ...foundYoutube]) {
    const { error } = await sb.from("djs").update({ youtube_url: y.url }).eq("id", y.dj_id).is("youtube_url", null);
    if (error) console.log(`  ❌ ${y.name} (yt): ${error.message}`);
    else savedYt++;
  }
  console.log(`💾 사클 ${saved}건 / 유튜브 ${savedYt}건 저장 완료`);
}

const { count } = await sb
  .from("djs")
  .select("*", { count: "exact", head: true })
  .not("soundcloud_url", "is", null);
console.log(`전체 DJ 사운드클라우드 보유: ${count}명`);
