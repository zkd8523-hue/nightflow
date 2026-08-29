/**
 * 이미 저장된 club_events 를 다시 판정해 DJ 파티를 공연 탭에서 걷어낸다.
 *
 * 왜 필요한가:
 *   옛 파싱 프롬프트는 이름 뒤 '(LIVE)' 나 라인업 나열을 가수 공연으로 오판했다.
 *   그 결과 순수 DJ 파티가 "언더그라운드 공연" 탭에 들어가 있다.
 *   실측(2026-08-27 하루):
 *     SOUNDCLASH(DJ 9명) → YVES 1명만, Paprika(일본 DJ 6명), CAFE DEL NYAR,
 *     Leafar Legov(독일 테크노 DJ) — 5건 중 가수 공연은 사실상 0건
 *
 * 하는 일 (Apify 재호출 없음 — raw_caption 재사용):
 *   1. 캡션을 현행 스키마로 다시 파싱 (lineup=가수 / dj_lineup=DJ 분리)
 *   2. 가수가 없으면 club_events 를 status='rejected' 로 내려 화면에서 뺀다
 *      (행은 남긴다 — 삭제하면 다음 수집이 같은 게시물을 또 처리한다)
 *   3. DJ 라인업은 club_lineups 로 옮긴다 (양쪽 탭 구조)
 *
 * 사용: DRY_RUN=1 node scripts/reclassify-events.mjs
 *       SINCE=2026-08-01 node scripts/reclassify-events.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const SINCE = process.env.SINCE ?? "2026-08-01";
// 특정 클럽만 재분류할 때. 미지정이면 전체.
const ONLY_CLUB = process.env.ONLY_CLUB ?? null;

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeDjName = (s) =>
  String(s ?? "").toUpperCase()
    .replace(/^(DJ|LIVE|GUEST|HOST|MC|VJ)\s*[-:]?\s*/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "").trim();

const NON_PERFORMER = new Set(["dumbs_app","resident_advisor","nol.ticket","interpark","yes24","melon","ticketlink","instagram","spotify","soundcloud","youtube"]);
const ROLE_PREFIX_RE = /^(dj|live|guest|host|opening|support|b2b|vj|mc)\s*[-:]?\s*/i;
function extractPerformerHandles(caption) {
  const found = new Map();
  for (const rawLine of String(caption ?? "").split("\n")) {
    const m = rawLine.trim().match(/^(.{1,60}?)\s*@(\w[\w._]{1,29})\s*$/);
    if (!m) continue;
    const name = m[1].replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
      .replace(ROLE_PREFIX_RE, "").replace(/[-–—:•·,]+$/, "").trim();
    const h = m[2].toLowerCase();
    if (name.length < 2 || NON_PERFORMER.has(h)) continue;
    if (/티켓|ticket|venue|장소|문의|예약|주소|info/i.test(name)) continue;
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(h);
  }
  const out = new Map();
  for (const [n, hs] of found) if (hs.size === 1) out.set(n, [...hs][0]);
  return out;
}

const TOOL = {
  name: "classify_event",
  description: "이 공연 공지의 출연자를 가수와 DJ로 나눈다.",
  input_schema: {
    type: "object",
    properties: {
      singers: {
        type: "array", items: { type: "string" },
        description:
          "랩/노래를 부르는 **가수·래퍼(보컬)** 이름만. 콘서트·쇼케이스·앨범 릴리즈 파티의 출연 아티스트.\n" +
          "⚠️ 이름 뒤 '(LIVE)' 만 보고 가수로 판단하지 마라 — 테크노/하우스에서 그건 DJ 라이브 셋이다.\n" +
          "⚠️ '가수'/'ARTIST'/'콘서트'/'단독공연' 같은 명시적 레이블이나 서술이 캡션에 전혀 없이 " +
          "그냥 '이름 @핸들' 이 나열만 돼 있으면(클럽 계정이 매번 쓰는 흔한 형식), 이름이 가수처럼 " +
          "'들린다'는 인상만으로 singers에 넣지 마라 — 그건 추측이다. 그런 경우는 전부 djs로 보내라.\n" +
          "확실히 보컬 아티스트인 경우만. 애매하면 djs 로.",
      },
      djs: {
        type: "array", items: { type: "string" },
        description:
          "셋을 트는 **DJ** 이름 전원. 'LINE UP' 아래 나열, 'DJ' 레이블/접두사, 시간표 형태가 근거.\n" +
          "해외 테크노/하우스 아티스트도 대부분 여기다.",
      },
      is_live_show: {
        type: "boolean",
        description: "가수·래퍼가 무대에서 노래하는 공연이면 true. DJ가 음악을 트는 클럽 파티면 false.",
      },
    },
    required: ["singers", "djs", "is_live_show"],
  },
};

async function classify(caption, title, lineup) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "classify_event" },
      messages: [{
        role: "user",
        content:
          `공연 제목: ${title ?? "(없음)"}\n` +
          `현재 저장된 출연진: ${JSON.stringify(lineup ?? [])}\n\n` +
          `아래 인스타 캡션을 보고 출연자를 가수와 DJ로 나눠라.\n\n---\n${String(caption ?? "").slice(0, 3000)}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  return data.content?.find((b) => b.type === "tool_use")?.input ?? null;
}

// ── 대상 ─────────────────────────────────────────────────────────────────
const { data: rows, error } = await sb
  .from("club_events")
  .select("id, event_date, title, club_id, club_name_raw, lineup, raw_caption, status")
  .eq("status", "approved")
  .gte("event_date", SINCE)
  .not("raw_caption", "is", null)
  .order("event_date");
if (error) { console.error(error.message); process.exit(1); }

const targets = ONLY_CLUB ? rows.filter((r) => r.club_id === ONLY_CLUB) : rows;
console.log(DRY_RUN ? "🧪 [DRY RUN]" : "🚀 [실행]", `대상 ${targets.length}건 (${SINCE} 이후 approved${ONLY_CLUB ? ", 클럽 한정" : ""})\n`);

let demoted = 0, kept = 0, djSaved = 0, handles = 0, failed = 0;
const cache = new Map();

for (const [i, r] of targets.entries()) {
  const key = `${r.title}::${String(r.raw_caption).slice(0, 200)}`;
  let out = cache.get(key);
  if (!out) {
    try {
      out = await classify(r.raw_caption, r.title, r.lineup);
      cache.set(key, out);
      await sleep(120);
    } catch (e) { failed++; console.log(`❌ ${r.title}: ${e.message}`); continue; }
  }
  if (!out) { failed++; continue; }

  let singers = (out.singers ?? []).filter((n) => String(n ?? "").trim());
  let djNames = (out.djs ?? []).filter((n) => String(n ?? "").trim());

  // 코드 레벨 안전장치: "이름+핸들만 나열, 역할 레이블 전혀 없음" 캡션에서 모델이
  // 이름 느낌만으로 singers를 뽑는 게 실측으로 재현됐다(NYAPI KTX: PAPAYA/HANAH/...를
  // 두 번이나 가수로 판정 — 프롬프트 문구를 두 번 강화해도 안 고쳐짐). 서술형 지시로
  // 안 잡히는 축이라 캡션에 가수 신호 키워드가 진짜 하나도 없으면 LLM 판정을 무시하고
  // 강제로 djs 로 합친다. 신호가 하나라도 있으면(레이블·문장 서술) LLM 판단을 신뢰한다.
  // PERFORMANCE 를 신호에서 뺀 이유: Lion SOUNDCLASH 캡션의
  // "a special performance by YVES" 가 걸려서 DJ 라이브셋(YVES (LIVE))이
  // 가수로 남았다. 클럽 게시물에서 performance 는 DJ 셋을 가리키는 말로도
  // 그냥 쓰인다 — 프롬프트에도 "(LIVE)는 DJ 라이브셋"이라 써놓고 여기 가드만
  // 반대로 짜서 서로 모순이었다.
  const SINGER_SIGNAL_RE = /콘서트|단독공연|쇼케이스|보컬|랩(?:을|하는|퍼)|가수|아티스트|SPECIAL\s*CYPHER|CONCERT|SHOWCASE/i;
  if (singers.length > 0 && !SINGER_SIGNAL_RE.test(String(r.raw_caption ?? ""))) {
    djNames = [...djNames, ...singers];
    singers = [];
  }

  // 가수가 한 명이라도 잡히면 공연으로 남긴다. is_live_show 는 참고만 —
  // 이 플래그가 파티 성격(클럽 파티)에 끌려 false 로 나오는 경우가 있는데
  // (실측: Cakeshop 'Summer of LEMON' 은 LOBOTOME 라이브가 있는데도 false),
  // 실제 가수 이름이 나왔다면 공연 탭에서 빼는 게 더 큰 손실이다.
  const isLive = singers.length > 0;

  console.log(`${isLive ? "🎤" : "🎧"} ${r.event_date} ${r.club_name_raw} | ${r.title}`);
  console.log(`     가수[${singers.join(", ")}] DJ[${djNames.join(", ")}]`);

  if (!DRY_RUN) {
    const capHandles = extractPerformerHandles(r.raw_caption);

    // DJ 라인업 저장 (그 클럽·날짜에 아직 없을 때만)
    if (djNames.length >= 1 && r.club_id && r.event_date) {
      const { data: exist } = await sb.from("club_lineups")
        .select("id").eq("club_id", r.club_id).eq("event_date", r.event_date).maybeSingle();
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
        if (sets.length >= 1) {
          const { error: e2 } = await sb.rpc("upsert_club_lineup", {
            p_club_id: r.club_id, p_event_date: r.event_date, p_door_open_min: null,
            p_event_title: r.title, p_poster_url: null,
            p_sets: sets, p_source: "ig_auto", p_draft_id: null,
          });
          if (!e2) djSaved++;
        }
      }
    }

    if (isLive) {
      // 가수 목록을 정확한 것으로 교체
      await sb.from("club_events").update({ lineup: singers }).eq("id", r.id);
      kept++;
    } else {
      // 공연 탭에서 내린다. 행은 남겨야 다음 수집이 같은 게시물을 또 안 잡는다
      await sb.from("club_events").update({ status: "rejected" }).eq("id", r.id);
      demoted++;
    }
  } else {
    if (isLive) kept++; else demoted++;
  }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 공연 유지 ${kept}건 / DJ파티로 내림 ${demoted}건`);
console.log(`   DJ 라인업 저장 ${djSaved}건 / 핸들 ${handles}개 / 실패 ${failed}건`);
console.log(`   LLM 호출 ${cache.size}회`);
console.log("=".repeat(56));
