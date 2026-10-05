/**
 * 신보(발매) 수집 — 뉴스레터 "이주의 발매" 코너용
 *
 * 선행: Migration 688 (music_releases)
 *
 * 소스 2개. 둘 다 무료·API키 불필요이고 서로의 빈칸을 메운다.
 *
 *   hiphople /news_kr/rss  — 메이저 힙합. 창모·버벌진트·루피 같은 이름이 여기 뜬다.
 *   poclanos WP REST       — 인디 유통. 힙합플레이야에 안 나오는 작은 앨범이 여기 있다.
 *
 * ⚠️ 힙합플레이야 RSS 파싱 주의 (2026-10-04 실측으로 고친 것들)
 *   1) 제목 패턴이 두 가지다. 앨범은 대괄호, 싱글은 큰따옴표를 쓴다:
 *        창모, 정규 앨범 [MONOLITH] 공개
 *        버벌진트, 싱글 "SUPERDRY" 공개        ← 유니코드 따옴표(“”)
 *      대괄호만 받는 정규식으로는 0건이 나온다.
 *   2) 커버가 RSS 필드에 없다. description 안의 <img src="/files/...">를 꺼내
 *      hiphople.com 을 붙여야 하고, 그 URL 은 img.hiphople.com 으로 301 된다.
 *   3) "발매 예고", "트랙리스트 공개", 사건사고 기사가 섞여 있다. 패턴에서 자연히
 *      걸러지지만 예고는 제목이 비슷해 명시적으로 제외한다.
 *
 * 저작권: 커버는 원본 URL 만 저장하고 재호스팅하지 않는다. 발행 시 editor_note
 * (왜 이 앨범인가 2~3문장)를 반드시 채운다 — 688 주석 참고.
 *
 * 사용:
 *   DRY_RUN=1 node scripts/collect-music-releases.mjs
 *   node scripts/collect-music-releases.mjs
 *   DAYS=14 node scripts/collect-music-releases.mjs    # 기본 10일
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const DAYS = Number(process.env.DAYS || 10);

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const UA = "Mozilla/5.0 (compatible; NightFlowWeekly/1.0; +https://nightflow.kr)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cutoff = new Date(Date.now() - DAYS * 86_400_000);

/** HTML 엔티티를 두 번 푼다 — RSS description 은 이중 인코딩돼 있다. */
function unent(s) {
  const once = String(s ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return once.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
const strip = (s) => unent(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ── 1) 힙합플레이야 ────────────────────────────────────────────────────────
// 앨범 [대괄호] 과 싱글 "따옴표" 를 모두 받는다. 유니코드 따옴표가 섞여 들어온다.
const HH_TITLE =
  /^(.+?),\s*(정규\s*앨범|미니\s*앨범|정규|EP|싱글|앨범)?\s*[[“"']([^\]”"']+)[\]”"']\s*(공개|발매)/;

async function fromHiphople() {
  const res = await fetch("https://hiphople.com/news_kr/rss", {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`hiphople RSS HTTP ${res.status}`);
  const xml = await res.text();

  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (tag) => {
      const r = it.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return r ? r[1].trim() : "";
    };
    const title = unent(pick("title"));
    const link = pick("link");
    const pub = pick("pubDate");
    const when = pub ? new Date(pub) : null;
    if (!when || Number.isNaN(when.getTime()) || when < cutoff) continue;

    // "10월 6일 정규 앨범 발매 예고" 처럼 아직 안 나온 건 제외한다
    if (/예고|예정|트랙리스트|티저/.test(title)) continue;

    const t = title.match(HH_TITLE);
    if (!t) continue;

    const desc = pick("description");
    const img = unent(desc).match(/<img[^>]+src="([^"]+)"/);
    const cover = img ? (img[1].startsWith("http") ? img[1] : `https://hiphople.com${img[1]}`) : null;

    out.push({
      source: "hiphople",
      source_url: link,
      source_guid: link.split("/").pop() || link,
      artist: t[1].trim(),
      title: t[3].trim(),
      format: (t[2] || "").replace(/\s+/g, " ").trim() || null,
      released_on: when.toISOString().slice(0, 10),
      genre: "hiphop",
      cover_url: cover,
      summary: strip(desc).slice(0, 300) || null,
    });
  }
  return out;
}

// ── 2) 포크라노스 ─────────────────────────────────────────────────────────
// WP REST. 한 번만 호출하고 장르는 응답의 term 으로 거른다.
//
// ⚠️ download_category 를 쿼리로 나눠 두 번 부르면 안 된다. 한 앨범이 Hip Hop 과
//    R&B/Soul 에 동시에 속하는 경우가 흔해서 같은 앨범이 두 번 들어온다(실측).
// ⚠️ 아티스트는 download_artist 에 **term ID 로만** 온다. 이름을 받으려면
//    _embed 에 wp:term 을 넣어야 한다(실측: N.21 → MNC).
const POC_GENRE = { "hip hop": "hiphop", "r&b/soul": "rnb", "indie": "indie" };

async function fromPoclanos() {
  const after = cutoff.toISOString().slice(0, 19);
  const url = `https://poclanos.com/wp-json/wp/v2/download`
    + `?after=${after}&per_page=40&orderby=date&order=desc`
    + `&_embed=wp:term,wp:featuredmedia`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`poclanos HTTP ${r.status}`);
  const arr = await r.json();
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const p of arr) {
    const title = strip(p.title?.rendered || "");
    if (!title) continue;

    const groups = p._embedded?.["wp:term"] ?? [];
    const flat = groups.flat().filter(Boolean);
    const artist = flat.find((t) => t.taxonomy === "download_artist")?.name ?? "";
    const cats = flat.filter((t) => t.taxonomy === "download_category")
      .map((t) => strip(t.name).toLowerCase());

    // 힙합·R&B·인디만 받는다. 그 외 장르는 우리 범위가 아니다.
    const genre = cats.map((c) => POC_GENRE[c]).find(Boolean);
    if (!genre) continue;

    out.push({
      source: "poclanos",
      source_url: p.link,
      source_guid: String(p.id),
      artist: strip(artist),
      title,
      format: null,
      released_on: String(p.date || "").slice(0, 10),
      genre,
      cover_url: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null,
      summary: null,
    });
  }
  return out;
}

// ── 실행 ──────────────────────────────────────────────────────────────────
console.log(`최근 ${DAYS}일 (${cutoff.toISOString().slice(0, 10)} 이후) 신보 수집\n`);

const rows = [];
try { const a = await fromHiphople(); console.log(`힙합플레이야 ${a.length}건`); rows.push(...a); }
catch (e) { console.log(`❌ 힙합플레이야: ${e.message}`); }
try { const b = await fromPoclanos(); console.log(`포크라노스   ${b.length}건`); rows.push(...b); }
catch (e) { console.log(`❌ 포크라노스: ${e.message}`); }

if (!rows.length) { console.log("\n수집 0건"); process.exit(0); }

// 이미 있는 건 건너뛴다 (UNIQUE(source, source_guid) 가 최종 방어선)
const { data: existing } = await sb.from("music_releases").select("source,source_guid");
const have = new Set((existing ?? []).map((x) => `${x.source}|${x.source_guid}`));
const fresh = rows.filter((r) => !have.has(`${r.source}|${r.source_guid}`));

console.log(`\n신규 ${fresh.length}건 (중복 ${rows.length - fresh.length}건 제외)\n`);
for (const r of fresh) {
  console.log(`  ${r.released_on}  ${(r.artist || "(아티스트 미정)").padEnd(16)} `
    + `${r.title.slice(0, 32).padEnd(34)} ${(r.format || "").padEnd(8)} `
    + `${r.cover_url ? "커버O" : "커버X"}  ${r.source}`);
}

if (DRY_RUN) { console.log("\n[DRY RUN] 저장하지 않았습니다"); process.exit(0); }
if (!fresh.length) process.exit(0);

const { error } = await sb.from("music_releases").insert(fresh);
if (error) { console.log(`\n❌ 저장 실패: ${error.message}`); process.exit(1); }
console.log(`\n✅ ${fresh.length}건 저장`);
console.log("발행 전에 editor_note(왜 이 앨범인가 2~3문장)를 채우세요 — 저작권 방어의 핵심입니다.");
