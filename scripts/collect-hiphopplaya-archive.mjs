/**
 * 힙합플레이야 캘린더(@hiphopplayacalendar) 게시물 일회성 아카이브 수집
 *
 * 사용:
 *   1) .env.local 에 APIFY_API_TOKEN 추가 (완료)
 *   2) Supabase 대시보드에서 마이그레이션 563 적용 (완료)
 *   3) DRY_RUN=1 node scripts/collect-hiphopplaya-archive.mjs   ← 먼저 5건만 확인
 *   4) node scripts/collect-hiphopplaya-archive.mjs             ← 전체 실행
 *
 * 동작:
 *   Apify Instagram Scraper로 @hiphopplayacalendar 게시물 캡션 수집
 *   → Claude로 캡션 구조화 파싱(공연명/날짜/장소/출연진)
 *   → club_events 적재 + club_name_registry 클럽명 집계
 *   → clubs.name/name_en/aliases 대조 매칭
 *
 * 비용: 게시물 ~311건. Apify 무료 크레딧($5) 내. LLM 파싱 게시물당 1콜, 약 $1~3.
 * 멱등: source_post_id 기준 UNIQUE 제약 + upsert. 재실행 안전.
 * 이미지 미저장(저작권) — 캡션 원문(raw_caption)과 원본 링크(source_url)만 보관.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const DRY_RUN_LIMIT = 5;
const SOURCE_ACCOUNT = "hiphopplayacalendar";
const SOURCE_URL = `https://www.instagram.com/${SOURCE_ACCOUNT}/`;

// --- .env.local 파싱 ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APIFY_TOKEN = env.APIFY_API_TOKEN;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
if (!APIFY_TOKEN) {
  console.error("❌ APIFY_API_TOKEN 이 .env.local 에 없습니다.");
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 가 .env.local 에 없습니다.");
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 1) Apify — 게시물 수집
// ============================================================================
async function fetchPosts(limit) {
  console.log(`🔍 Apify로 @${SOURCE_ACCOUNT} 게시물 최대 ${limit}건 수집 시작...`);
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [SOURCE_URL],
        resultsType: "posts",
        resultsLimit: limit,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Apify 응답 형식 이상: ${JSON.stringify(data).slice(0, 300)}`);
  }
  console.log(`📦 ${data.length}건 수집됨\n`);
  return data;
}

// ============================================================================
// 2) Claude — 캡션 구조화 파싱
// ============================================================================
const PARSE_TOOL = {
  name: "extract_events",
  description: "인스타그램 캡션에서 클럽 공연 정보를 추출한다.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "공연/파티명" },
            club_name_raw: { type: "string", description: "장소(클럽/venue) 원문 표기" },
            venue_area: { type: "string", description: "지역 (예: 서울, 부산, 대전, 도쿄 등 원문 그대로)" },
            event_date: { type: "string", description: "시작일 YYYY-MM-DD. 연도 없으면 게시물 연도로 추정. 확실하지 않으면 빈 문자열" },
            event_date_end: { type: "string", description: "종료일 YYYY-MM-DD (다일 공연만, 없으면 빈 문자열)" },
            lineup: { type: "array", items: { type: "string" }, description: "출연진 이름 목록" },
          },
          required: ["title", "club_name_raw", "event_date", "lineup"],
        },
      },
    },
    required: ["events"],
  },
};

async function parseCaption(caption, postTimestamp) {
  const postYear = new Date(postTimestamp).getFullYear();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: "extract_events" },
      messages: [
        {
          role: "user",
          content: `이 인스타그램 게시물은 ${postYear}년에 올라온 "이번 주 공연 & 파티 모음" 캘린더다. 캡션에서 번호가 매겨진 각 공연 항목을 전부 추출해라. 날짜에 연도가 없으면 ${postYear}년으로 간주한다. 장소는 클럽명만 (콤마 뒤 지역명 제외). 출연진은 이름만 배열로 (LIVE/DJ 등 역할 접두사는 제거).\n\n---\n${caption}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const toolUse = data.content?.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("tool_use 블록 없음");
  return toolUse.input.events ?? [];
}

// ============================================================================
// 3) 클럽명 정규화
// ============================================================================
function normalizeClubName(raw) {
  return raw
    .toUpperCase()
    .replace(/[’'‘""]/g, "")
    .replace(/클럽|CLUB/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

// ============================================================================
// 4) clubs 테이블 매칭 준비
// ============================================================================
async function loadClubsIndex() {
  const { data, error } = await sb
    .from("clubs")
    .select("id,name,name_en,aliases,instagram")
    .is("deleted_at", null);
  if (error) throw new Error(`clubs 조회 실패: ${error.message}`);

  const index = new Map(); // normalized -> club_id
  for (const c of data) {
    const candidates = [c.name, c.name_en, ...(c.aliases ?? [])].filter(Boolean);
    for (const cand of candidates) {
      const norm = normalizeClubName(cand);
      if (norm) index.set(norm, c.id);
    }
  }
  return index;
}

// ============================================================================
// 5) 메인
// ============================================================================
async function main() {
  const limit = DRY_RUN ? DRY_RUN_LIMIT : 350;
  console.log(DRY_RUN ? "🧪 [DRY RUN] 게시물 5건만 처리\n" : "🚀 [전체 실행]\n");

  const posts = await fetchPosts(limit);
  const clubsIndex = await loadClubsIndex();
  console.log(`🗂  clubs 인덱스: ${clubsIndex.size}개 표기 로드\n`);

  let totalEvents = 0;
  let parseFailures = 0;
  const registryUpdates = new Map(); // normalized_name -> { name_raw, area_guess, count, dates: [] }

  for (const [i, post] of posts.entries()) {
    const postId = post.id ?? post.shortCode;
    const caption = post.caption ?? "";
    if (!caption.trim()) {
      console.log(`⏭️  [${i + 1}/${posts.length}] 캡션 없음, 스킵 (${postId})`);
      continue;
    }

    console.log(`🔄 [${i + 1}/${posts.length}] 파싱 중... (${postId})`);
    let events;
    try {
      events = await parseCaption(caption, post.timestamp);
    } catch (e) {
      parseFailures++;
      console.log(`  ❌ 파싱 실패: ${e.message}`);
      continue;
    }

    if (events.length === 0) {
      console.log(`  ⚠️  추출된 공연 없음`);
      continue;
    }

    for (const ev of events) {
      const normalized = normalizeClubName(ev.club_name_raw || "");
      const matchedClubId = normalized ? clubsIndex.get(normalized) ?? null : null;

      const row = {
        club_id: matchedClubId,
        club_name_raw: ev.club_name_raw || "(미상)",
        venue_area: ev.venue_area || null,
        event_date: ev.event_date || null,
        event_date_end: ev.event_date_end || null,
        title: ev.title || null,
        lineup: ev.lineup ?? [],
        source_account: SOURCE_ACCOUNT,
        source_url: post.url ?? null,
        source_post_id: String(postId),
        raw_caption: caption,
        status: "pending",
      };

      if (!DRY_RUN) {
        const { error } = await sb
          .from("club_events")
          .upsert(row, { onConflict: "source_post_id,club_name_raw,event_date" });
        if (error) {
          console.log(`  ❌ club_events 저장 실패: ${error.message}`);
          continue;
        }
      }
      totalEvents++;

      if (normalized) {
        const reg = registryUpdates.get(normalized) ?? {
          name_raw: ev.club_name_raw,
          area_guess: ev.venue_area || null,
          count: 0,
          dates: [],
          matchedClubId,
          instagramHandle: null,
        };
        reg.count++;
        if (ev.event_date) reg.dates.push(ev.event_date);
        registryUpdates.set(normalized, reg);
      }
    }

    if (DRY_RUN) {
      console.log(`  ✅ ${events.length}건 추출:`);
      for (const ev of events) {
        const normalized = normalizeClubName(ev.club_name_raw || "");
        const matched = normalized ? clubsIndex.get(normalized) : null;
        console.log(
          `     - ${ev.event_date || "?"} | ${ev.club_name_raw} ${matched ? "✓매칭" : "✗미매칭"} | ${ev.title} | ${(ev.lineup ?? []).join(", ")}`
        );
      }
    } else {
      console.log(`  ✅ ${events.length}건 저장`);
    }

    await sleep(200); // API 부담 완화
  }

  // club_name_registry 반영 (DRY_RUN 아닐 때만)
  if (!DRY_RUN) {
    console.log(`\n🗂  club_name_registry 갱신 중... (${registryUpdates.size}개 클럽명)`);
    for (const [normalized, reg] of registryUpdates) {
      const dates = reg.dates.sort();
      const { error } = await sb.from("club_name_registry").upsert(
        {
          name_raw: reg.name_raw,
          normalized_name: normalized,
          area_guess: reg.area_guess,
          event_count: reg.count,
          first_seen: dates[0] ?? null,
          last_seen: dates[dates.length - 1] ?? null,
          matched_club_id: reg.matchedClubId,
          status: reg.matchedClubId ? "matched" : "unmatched",
        },
        { onConflict: "name_raw" }
      );
      if (error) console.log(`  ❌ registry 저장 실패 (${reg.name_raw}): ${error.message}`);
    }
  }

  // ---- 결과 리포트 ----
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 완료 — 게시물 ${posts.length}건 처리`);
  console.log(`   추출된 공연: ${totalEvents}건`);
  console.log(`   파싱 실패: ${parseFailures}건`);
  if (!DRY_RUN) {
    const matched = [...registryUpdates.values()].filter((r) => r.matchedClubId).length;
    const unmatched = registryUpdates.size - matched;
    console.log(`   클럽명: ${registryUpdates.size}개 (매칭 ${matched} / 미매칭 ${unmatched})`);
    console.log(`\n   상위 빈도 클럽:`);
    [...registryUpdates.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .forEach((r) => console.log(`     ${r.count.toString().padStart(3)}회  ${r.name_raw}${r.matchedClubId ? "" : "  (미등록)"}`));
  }
  console.log(`${"=".repeat(60)}`);
}

main().catch((e) => {
  console.error("💥 실행 실패:", e);
  process.exit(1);
});
