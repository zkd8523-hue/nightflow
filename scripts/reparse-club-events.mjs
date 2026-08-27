/**
 * club_events 재파싱 — 저장된 raw_caption 을 새 규칙으로 다시 파싱한다.
 *
 * 배경:
 *   초기 파싱 프롬프트가 "LIVE/DJ 등 역할 접두사 제거"를 지시해 래퍼와 DJ가
 *   lineup 배열에 뒤섞였다. 캡션 전수조사로 실제 역할 레이블을 확인했고
 *   (아티스트 63 / LIVE 46 / DJs 28 / DJ 20 / MUSIC 2 / BEATS 1 ...),
 *   래퍼·가수만 남기는 규칙으로 교체했다. 이 스크립트가 기존 행에 소급 적용한다.
 *
 * 동작: source_post_id 단위로 캡션을 재파싱 → 그 게시물의 기존 행을 지우고
 *       새 결과로 교체(replace-all). DJ 전용 이벤트는 아예 넣지 않는다.
 * 비용: Apify 재호출 없음. LLM만 게시물당 ~6원.
 *
 * 사용:
 *   DRY_RUN=1 node scripts/reparse-club-events.mjs   ← 3건만 확인
 *   node scripts/reparse-club-events.mjs             ← 전체
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const DRY_RUN_LIMIT = 3;

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERSEAS = ["도쿄", "타이페이", "하노이", "홍콩", "상하이", "방콕", "오사카", "TOKYO", "TAIPEI", "HANOI", "HONG KONG", "BANGKOK"];

const PARSE_TOOL = {
  name: "extract_events",
  description:
    "인스타그램 캡션에서 '래퍼/가수의 라이브 공연' 정보만 추출한다. DJ 세트만 있는 클럽 파티는 대상이 아니다.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            club_name_raw: {
              type: "string",
              description:
                "공연이 열리는 **장소(클럽/공연장) 이름**. 파티·이벤트 이름과 혼동하지 말 것.\n" +
                "게시 계정이 클럽이면 기본적으로 그 클럽이 장소다. 캡션에 다른 장소가 주소나 " +
                "'at OO'로 명시될 때만 그쪽을 쓴다.\n" +
                "예) modeci_seoul 계정의 'Paprika @p.aprika_seoul' → 장소는 Modeci, Paprika는 파티명(title).",
            },
            venue_instagram: { type: "string", description: "캡션에 @로 태그된 장소 인스타 핸들. 없으면 빈 문자열" },
            venue_area: {
              type: "string",
              description:
                "공연 지역. 캡션 어디에서든 찾아라 — 주소('서울 서초구 반포동'), 도시명('Seoul', 'in Seoul'), " +
                "'📍 장소, 지역' 표기 모두 근거가 된다.\n" +
                "한국이면 광역 단위 한글로: 서울/부산/대구/인천/광주/대전/울산/세종/경기/제주.\n" +
                "'서울 서초구 반포동' → '서울', 'Seoul' → '서울', 'Tokyo' → '도쿄'.\n" +
                "정말 단서가 없을 때만 빈 문자열.",
            },
            venue_type: {
              type: "string",
              enum: ["club", "venue", "other"],
              description: "club=클럽/라운지, venue=라이브홀·공연장, other=그 외. 판단 안 되면 club",
            },
            event_date: { type: "string", description: "YYYY-MM-DD. 불확실하면 빈 문자열" },
            event_date_end: { type: "string" },
            lineup: {
              type: "array",
              items: { type: "string" },
              description:
                "라이브 공연하는 래퍼/가수 이름만.\n" +
                "포함할 레이블: '아티스트', 'LIVE', 'PERFORMANCE', 'SPECIAL CYPHER'\n" +
                "제외할 레이블: 'DJ', 'DJs', 'DJ LINE UP', 'MUSIC', 'BEATS', '심사'\n" +
                "역할 레이블이 없으면 나열된 이름 전원을 넣는다.",
            },
            has_live_performer: {
              type: "boolean",
              description: "래퍼/가수 라이브가 있으면 true. DJ 플레이만 있으면 false.",
            },
          },
          required: ["title", "club_name_raw", "venue_type", "venue_instagram", "event_date", "lineup", "has_live_performer"],
        },
      },
    },
    required: ["events"],
  },
};

async function parseCaption(caption, year, account) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: "extract_events" },
      messages: [
        {
          role: "user",
          content: `${account ? `이 게시물은 "@${account}" 계정이 올린 것이다.\n` : ""}${year}년 게시물이다.

**목적: 래퍼/가수의 라이브 공연 정보만 수집한다.** DJ 세트만 있는 클럽 파티는 대상이 아니다.

규칙:
- 캡션에 나온 이벤트를 전부 추출하되, 각 이벤트마다 has_live_performer를 정확히 판단해라.
- 역할 레이블 처리 (실제 캡션 전수조사 기준):
  · lineup에 넣을 것: '아티스트', 'LIVE', 'PERFORMANCE', 'SPECIAL CYPHER'
  · lineup에서 뺄 것: 'DJ', 'DJs', 'DJ LINE UP', 'MUSIC', 'BEATS', '심사'
  · 예) '아티스트 - 자이언티, 비와이' → 둘 다 포함
       'LIVE - MALL BOYZ / DJs - GENTOKU, 106MIDO' → MALL BOYZ만 포함
- 역할 레이블이 없으면 나열된 이름 전원을 넣는다. (대부분 이 경우이고 DJ가 없는 순수 공연이다.)
- DJ 레이블만 있는 파티는 has_live_performer=false.
- 날짜에 연도가 없으면 ${year}년으로 간주. 장소는 클럽명만(지역명 제외).

---
${caption}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const toolUse = data.content?.find((b) => b.type === "tool_use");
  return toolUse?.input?.events ?? [];
}

function normalizeClubName(raw) {
  let s = raw.toUpperCase().replace(/[''‘""]/g, "").replace(/클럽|CLUB/g, "").replace(/[^\p{L}\p{N}]/gu, "").trim();
  for (const p of ["서울","홍대","강남","이태원","건대","성수","압구정","청담","부산","대구","대전","광주","인천","울산","수원"]) {
    const P = p.toUpperCase();
    if (s.startsWith(P) && s.length > P.length) { s = s.slice(P.length); break; }
  }
  return s;
}

function decideStatus(ev) {
  if (!ev.event_date) return "flagged";
  const d = new Date(ev.event_date);
  if (isNaN(d.getTime())) return "flagged";
  const now = new Date();
  if (d < new Date(now.getTime() - 24 * 3600 * 1000)) return "approved"; // 과거 공연은 아카이브로 승인
  if (d > new Date(now.getTime() + 183 * 24 * 3600 * 1000)) return "flagged";
  if (!ev.lineup || ev.lineup.length === 0) return "flagged";
  const area = (ev.venue_area ?? "").toUpperCase();
  if (OVERSEAS.some((k) => area.includes(k.toUpperCase()))) return "flagged";
  return "approved";
}

// ---- 실행 ----
console.log(DRY_RUN ? `🧪 [DRY RUN] ${DRY_RUN_LIMIT}건만\n` : "🚀 [전체 재파싱]\n");

const { data: rows, error } = await sb
  .from("club_events")
  .select("source_post_id, raw_caption, source_account, source_url, created_at");
if (error) { console.error("조회 실패:", error.message); process.exit(1); }

// 게시물 단위로 묶기
const posts = new Map();
for (const r of rows) {
  if (!posts.has(r.source_post_id)) {
    posts.set(r.source_post_id, { caption: r.raw_caption, account: r.source_account, url: r.source_url, at: r.created_at });
  }
}
const list = [...posts.entries()];
const target = DRY_RUN ? list.slice(0, DRY_RUN_LIMIT) : list;
console.log(`대상 게시물: ${target.length}개 (전체 ${list.length})\n`);

// clubs 인덱스
const { data: clubs } = await sb.from("clubs").select("id,name,name_en,aliases").is("deleted_at", null);
const clubIdx = new Map();
for (const c of clubs ?? []) {
  for (const cand of [c.name, c.name_en, ...(c.aliases ?? [])].filter(Boolean)) {
    const n = normalizeClubName(cand);
    if (n) clubIdx.set(n, c.id);
  }
}

let done = 0, kept = 0, dropped = 0, failed = 0;

for (const [postId, p] of target) {
  const year = new Date(p.at).getFullYear();
  let events;
  try {
    events = await parseCaption(p.caption, year);
  } catch (e) {
    failed++;
    console.log(`❌ ${postId}: ${e.message}`);
    continue;
  }

  const live = events.filter((ev) => ev.has_live_performer !== false && (ev.lineup ?? []).length > 0);
  dropped += events.length - live.length;

  if (DRY_RUN) {
    console.log(`[${postId}] 전체 ${events.length}건 → 래퍼/가수 ${live.length}건`);
    live.forEach((ev) => console.log(`   ✅ ${ev.event_date} | ${ev.club_name_raw} | ${ev.title}\n      ${(ev.lineup||[]).join(", ")}`));
    events.filter(ev => !live.includes(ev)).forEach((ev) => console.log(`   ⏭️  [DJ전용] ${ev.title}`));
    console.log("");
  } else {
    // 이 게시물의 기존 행 삭제 후 재삽입 (replace-all)
    await sb.from("club_events").delete().eq("source_post_id", postId);
    for (const ev of live) {
      const norm = normalizeClubName(ev.club_name_raw || "");
      await sb.from("club_events").insert({
        club_id: norm ? clubIdx.get(norm) ?? null : null,
        club_name_raw: ev.club_name_raw || "(미상)",
        venue_area: ev.venue_area || null,
        venue_type: ["club","venue","other"].includes(ev.venue_type) ? ev.venue_type : null,
        event_date: ev.event_date || null,
        event_date_end: ev.event_date_end || null,
        title: ev.title || null,
        lineup: ev.lineup ?? [],
        source_account: p.account,
        source_url: p.url,
        source_post_id: postId,
        raw_caption: p.caption,
        status: decideStatus(ev),
      });
      kept++;
    }
  }
  done++;
  if (!DRY_RUN && done % 20 === 0) console.log(`  ... ${done}/${target.length} 처리 (유지 ${kept} / DJ제외 ${dropped})`);
  await sleep(150);
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 완료 — 게시물 ${done}개 재파싱`);
console.log(`   래퍼/가수 공연 유지: ${kept}건`);
console.log(`   DJ 전용 제외: ${dropped}건`);
console.log(`   파싱 실패: ${failed}건`);
console.log("=".repeat(56));
