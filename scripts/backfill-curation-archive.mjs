/**
 * 힙합플레이야 캘린더(@hiphopplayacalendar) 과거 게시물 보충 수집.
 *
 * 왜 필요한가:
 *   주기 수집기는 매 실행마다 최근 5건(POSTS_PER_CURATION)만 본다. 그래서 계정에
 *   쌓인 331개 중 56개(2025-09 이후)만 들어와 있다. 이 계정은 주간 공연 모음이라
 *   게시물 하나에 공연이 10~16건씩 들어 있고, 그만큼 아티스트·DJ 이름이 대량으로
 *   묻혀 있다 — 미수집 275개를 읽으면 인물 마스터가 크게 늘어난다.
 *
 * collect-hiphopplaya-archive.mjs 와 다른 점:
 *   1. 이미 처리한 게시물은 LLM 을 태우지 않는다 (그쪽은 56건을 매번 재파싱한다)
 *   2. status 를 decideStatus() 로 정한다 (그쪽은 전부 'pending' 이라 화면에 안 뜬다)
 *   3. dj_lineup 을 갈라 받아 club_lineups 에도 넣는다 (가수/DJ 양쪽 탭)
 *   4. 캡션의 "이름 @핸들" 을 artists/djs.instagram 에 바로 채운다
 *
 * 사용:
 *   DRY_RUN=1 node scripts/backfill-curation-archive.mjs
 *   SINCE=2025-01-01 node scripts/backfill-curation-archive.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
/** 이 날짜 이후 게시물만 처리 (게시 시각 기준) */
const SINCE = process.env.SINCE ?? "2025-01-01";
/** Apify 로 긁을 게시물 수 — 주 1회 게시라 120건이면 2년치를 덮는다 */
const FETCH_LIMIT = Number(process.env.FETCH_LIMIT ?? 120);

const SOURCE_ACCOUNT = "hiphopplayacalendar";
const SOURCE_URL = `https://www.instagram.com/${SOURCE_ACCOUNT}/`;

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 공통 정규화 (Edge Function 과 동일 규약) ──────────────────────────────
const AREA_PREFIXES = ["서울","홍대","강남","이태원","건대","성수","압구정","청담","부산","대구","대전","광주","인천","울산","수원"];
function normalizeClubName(raw) {
  let s = String(raw ?? "").toUpperCase()
    .replace(/[’'‘""]/g, "").replace(/클럽|CLUB/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "").trim();
  for (const p of AREA_PREFIXES.map((x) => x.toUpperCase())) {
    if (s.startsWith(p) && s.length > p.length) { s = s.slice(p.length); break; }
  }
  return s;
}
const normalizeDjName = (s) =>
  String(s ?? "").toUpperCase()
    .replace(/^(DJ|LIVE|GUEST|HOST|MC|VJ)\s*[-:]?\s*/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "").trim();

const OVERSEAS = ["도쿄","타이페이","하노이","홍콩","상하이","방콕","오사카","TOKYO","TAIPEI","HANOI","HONG KONG","BANGKOK"];
function decideStatus(ev) {
  if (!ev.event_date) return "flagged";
  const d = new Date(ev.event_date);
  if (isNaN(d.getTime())) return "flagged";
  const now = new Date();
  // 아카이브 수집이라 과거 공연이 정상이다 — 미래 6개월 상한만 본다
  if (d > new Date(now.getTime() + 183 * 864e5)) return "flagged";
  if (!ev.lineup || ev.lineup.length === 0) return "flagged";
  const area = (ev.venue_area ?? "").toUpperCase();
  if (OVERSEAS.some((k) => area.includes(k.toUpperCase()))) return "flagged";
  return "approved";
}

// ── 캡션 "이름 @핸들" 추출 (_shared/lineup-logic.ts 와 동일 규칙) ──────────
const NON_PERFORMER = new Set(["dumbs_app","resident_advisor","nol.ticket","interpark","yes24","melon","ticketlink","instagram","spotify","soundcloud","youtube"]);
const ROLE_PREFIX_RE = /^(dj|live|guest|host|opening|support|b2b|vj|mc)\s*[-:]?\s*/i;
function extractPerformerHandles(caption) {
  const found = new Map();
  for (const rawLine of String(caption ?? "").split("\n")) {
    const m = rawLine.trim().match(/^(.{1,60}?)\s*@(\w[\w._]{1,29})\s*$/);
    if (!m) continue;
    const name = m[1].replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
      .replace(ROLE_PREFIX_RE, "").replace(/[-–—:•·,]+$/, "").trim();
    const handle = m[2].toLowerCase();
    if (name.length < 2 || NON_PERFORMER.has(handle)) continue;
    if (/티켓|ticket|venue|장소|문의|예약|주소|info/i.test(name)) continue;
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(handle);
  }
  const out = new Map();
  for (const [n, hs] of found) if (hs.size === 1) out.set(n, [...hs][0]);
  return out;
}

// ── Apify ────────────────────────────────────────────────────────────────
async function fetchPosts(limit) {
  console.log(`🔍 @${SOURCE_ACCOUNT} 게시물 최대 ${limit}건 수집...`);
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directUrls: [SOURCE_URL], resultsType: "posts", resultsLimit: limit }),
    }
  );
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Apify 응답 이상: ${JSON.stringify(data).slice(0, 200)}`);
  console.log(`📦 ${data.length}건 수집\n`);
  return data;
}

// ── LLM 파싱 (현행 Edge Function 스키마와 동일) ──────────────────────────
const PARSE_TOOL = {
  name: "extract_events",
  description: "주간 공연 모음 캡션에서 공연 정보를 추출한다. 가수 공연과 DJ 라인업을 갈라 담는다.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            club_name_raw: { type: "string", description: "장소(클럽/공연장) 이름. 파티명과 혼동 금지." },
            venue_area: {
              type: "string",
              description: "지역. '📍 장소, 지역' 표기에서 뒤쪽. 한국이면 광역 단위 한글(서울/부산/대구/인천/광주/대전/울산/세종/경기/제주). 해외는 도시명.",
            },
            venue_type: { type: "string", enum: ["club", "venue", "other"], description: "club=테이블 예약해 노는 클럽/라운지, venue=티켓 사서 보는 공연장, other=그 외" },
            event_date: { type: "string", description: "YYYY-MM-DD. 불확실하면 빈 문자열" },
            event_date_end: { type: "string" },
            lineup: {
              type: "array", items: { type: "string" },
              description: "라이브 공연하는 래퍼/가수(보컬)만. DJ는 dj_lineup 으로.\n'아티스트/ARTIST/LIVE(가수)/PERFORMANCE' 레이블은 여기.\n역할 레이블이 없는 순수 공연 공지(콘서트/쇼케이스)면 나열된 이름 전원.",
            },
            dj_lineup: {
              type: "array", items: { type: "string" },
              description: "셋을 트는 DJ 전원. 'DJ' 레이블, 'DJ LINE UP', 'MUSIC', 'BEATS', 이름 앞 'DJ ' 접두사가 근거.\n이름 뒤 '(LIVE)'는 DJ 라이브 셋이므로 여기에 넣는다. 없으면 빈 배열.",
            },
            has_live_performer: {
              type: "boolean",
              description: "래퍼/가수(보컬) 라이브가 있으면 true. DJ만이면 false.\n'(LIVE)' 하나만으로 true 로 보지 마라 — 테크노/하우스에서 그건 DJ 라이브 셋이다.",
            },
          },
          required: ["title", "club_name_raw", "venue_area", "event_date", "lineup", "dj_lineup", "has_live_performer"],
        },
      },
    },
    required: ["events"],
  },
};

async function parseCaption(caption, postTimestamp) {
  const postYear = new Date(postTimestamp || Date.now()).getFullYear();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: "extract_events" },
      messages: [{
        role: "user",
        content:
          `이 게시물은 주간 공연 모음 캘린더 계정(@${SOURCE_ACCOUNT})의 것이다.\n` +
          `번호가 매겨진 항목마다 공연이 하나씩 들어있다 — 전부 추출해라.\n` +
          `날짜에 연도가 없으면 ${postYear}년으로 본다.\n` +
          `공연 공지가 아니면 빈 배열.\n\n---\n${caption}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const t = data.content?.find((b) => b.type === "tool_use");
  return t?.input?.events ?? [];
}

// ── 메인 ─────────────────────────────────────────────────────────────────
const { data: known } = await sb
  .from("club_events")
  .select("source_post_id")
  .eq("source_account", SOURCE_ACCOUNT);
const knownPosts = new Set((known ?? []).map((r) => String(r.source_post_id)));
console.log(`이미 처리한 게시물: ${knownPosts.size}개\n`);

const { data: clubs } = await sb.from("clubs").select("id, name, name_en, aliases").is("deleted_at", null);
const clubIndex = new Map();
for (const c of clubs ?? []) {
  for (const n of [c.name, c.name_en, ...(c.aliases ?? [])]) {
    const k = normalizeClubName(n ?? "");
    if (k) clubIndex.set(k, c.id);
  }
}
console.log(`clubs 인덱스: ${clubIndex.size}개 표기\n`);

const posts = await fetchPosts(FETCH_LIMIT);

// 대상: 미처리 + SINCE 이후
const targets = posts.filter((p) => {
  const id = String(p.id ?? p.shortCode ?? "");
  if (!id || knownPosts.has(id)) return false;
  const ts = (p.timestamp ?? "").slice(0, 10);
  return ts >= SINCE;
});
console.log(`처리 대상: ${targets.length}건 (미처리 + ${SINCE} 이후)\n`);

let events = 0, djLineups = 0, handles = 0, failures = 0, artistsLinked = 0;

for (const [i, post] of targets.entries()) {
  const postId = String(post.id ?? post.shortCode ?? "");
  const caption = post.caption ?? "";
  if (!caption.trim()) continue;

  console.log(`🔄 [${i + 1}/${targets.length}] ${(post.timestamp ?? "").slice(0, 10)} (${postId})`);
  let parsed;
  try {
    parsed = await parseCaption(caption, post.timestamp);
    await sleep(150);
  } catch (e) {
    failures++;
    console.log(`   ❌ ${e.message}`);
    continue;
  }
  console.log(`   → 공연 ${parsed.length}건`);
  if (DRY_RUN) {
    for (const ev of parsed.slice(0, 3)) {
      console.log(`      ${ev.event_date} ${ev.club_name_raw}(${ev.venue_area}) 가수[${(ev.lineup ?? []).join(", ")}] DJ[${(ev.dj_lineup ?? []).join(", ")}]`);
    }
    continue;
  }

  const capHandles = extractPerformerHandles(caption);

  for (const ev of parsed) {
    const clubId = clubIndex.get(normalizeClubName(ev.club_name_raw ?? "")) ?? null;

    // ── DJ 라인업 → club_lineups (가수 공연 여부와 무관하게 저장) ──
    const djNames = (ev.dj_lineup ?? []).filter((n) => String(n ?? "").trim());
    if (djNames.length >= 2 && clubId && ev.event_date) {
      const { data: exist } = await sb.from("club_lineups")
        .select("id").eq("club_id", clubId).eq("event_date", ev.event_date).maybeSingle();
      if (!exist) {
        const sets = [];
        const seen = new Set();
        for (const nm of djNames) {
          const norm = normalizeDjName(nm);
          if (!norm || seen.has(norm)) continue;
          seen.add(norm);
          const { data: djId } = await sb.rpc("ensure_dj", { p_raw_name: nm, p_normalized: norm });
          if (!djId) continue;
          const h = capHandles.get(nm);
          if (h) {
            const { data: upd } = await sb.from("djs").update({ instagram: h })
              .eq("id", djId).is("instagram", null).select("id");
            if (upd?.length) handles++;
          }
          sets.push({ dj_id: djId, start_min: null, end_min: null, raw_name: nm });
        }
        if (sets.length >= 2) {
          const { error } = await sb.rpc("upsert_club_lineup", {
            p_club_id: clubId, p_event_date: ev.event_date, p_door_open_min: null,
            p_event_title: ev.title || null, p_poster_url: null,
            p_sets: sets, p_source: "ig_auto", p_draft_id: null,
          });
          if (!error) djLineups++;
        }
      }
    }

    // ── 가수 공연 → club_events ──
    if (ev.has_live_performer === false || (ev.lineup ?? []).length === 0) continue;

    const venueType = ["club", "venue", "other"].includes(ev.venue_type) ? ev.venue_type : null;
    const { data: saved, error } = await sb.from("club_events").upsert({
      club_id: clubId,
      club_name_raw: ev.club_name_raw || "(미상)",
      venue_area: ev.venue_area || null,
      venue_type: venueType,
      event_date: ev.event_date || null,
      event_date_end: ev.event_date_end || null,
      title: ev.title || null,
      lineup: ev.lineup ?? [],
      source_account: SOURCE_ACCOUNT,
      source_url: post.url ?? null,
      source_post_id: postId,
      raw_caption: caption,
      status: decideStatus(ev),
    }, { onConflict: "source_post_id,club_name_raw,event_date" }).select("id").maybeSingle();
    if (error) { console.log(`   ⚠️ ${error.message}`); continue; }
    events++;

    // ── 출연진 → artists 마스터 + 핸들 ──
    if (saved?.id) {
      for (const [idx, rawName] of (ev.lineup ?? []).entries()) {
        const nm = String(rawName ?? "").trim();
        const norm = normalizeDjName(nm);
        if (!nm || !norm) continue;
        const { data: artistId } = await sb.rpc("ensure_artist", { p_raw_name: nm, p_normalized: norm });
        if (!artistId) continue;
        await sb.from("club_event_performers").upsert(
          { event_id: saved.id, artist_id: artistId, raw_name: nm, sort_order: idx },
          { onConflict: "event_id,artist_id" }
        );
        artistsLinked++;
        const h = capHandles.get(nm);
        if (h) {
          const { data: upd } = await sb.from("artists").update({ instagram: h })
            .eq("id", artistId).is("instagram", null).select("id");
          if (upd?.length) handles++;
        }
      }
    }
  }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 게시물 ${targets.length}건 처리`);
console.log(`   공연 ${events}건 / DJ 라인업 ${djLineups}건 / 출연 연결 ${artistsLinked}건`);
console.log(`   인스타 핸들 ${handles}개 / 파싱 실패 ${failures}건`);
console.log("=".repeat(56));
