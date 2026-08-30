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

// ── 가수 사전 1차 필터 ──────────────────────────────────────────────────
// 위키백과 가수/래퍼 분류 + 문서 별칭(리다이렉트) 7,257개.
// data/known-singers.json — scripts/build-singer-dict.mjs 로 갱신한다.
//
// 왜 필요한가(2026-08-30 실측): LLM 판정만 쓰면 아티스트가 자기 릴리즈 파티에서
// DJ도 트는 밤을 통째로 DJ 파티로 내린다. NAFLA "INSTINCT" PRE-LISTENING PARTY,
// Colde "ICE BREAK CLUB" EP RELEASE PARTY 가 그렇게 묻혔다.
//
// ⚠️ "걸리면 가수 확정"으로만 쓴다. 안 걸린다고 DJ로 단정하면 안 된다 —
// 박재범·김하온처럼 위키 분류에 빠진 가수가 있어 재현율은 낮다(정밀도만 높다).
// 실측: DJ 8명(ANU·YETSUBY·SEESEA·LUF·BOOGIE·STONER·PAVIE·MINKY) 전원을
// 정확히 걸러냈다 — 오탐 0. 1차 가드레일에 필요한 성질이 이것이다.
const normName = (n) =>
  String(n ?? "").toUpperCase().replace(/^(DJ|MC)\s*/i, "").replace(/[^\p{L}\p{N}]/gu, "");
const KNOWN_SINGERS = new Set(
  JSON.parse(readFileSync("data/known-singers.json", "utf8")).map(normName).filter((n) => n.length >= 2)
);
const isKnownSinger = (name) => {
  const k = normName(name);
  return k.length >= 2 && KNOWN_SINGERS.has(k);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ src/lib/lineups/djName.ts 의 normalizeDjName() 정본과 반드시 같아야 한다.
 *
 * 전에는 toUpperCase() 를 써서 "ARKINS" 같은 대문자 키를 만들었다. 정본은
 * 소문자라 수집기가 "arkins" 로 조회하면 그 별칭을 못 찾아 같은 DJ 를 새 행으로
 * 또 만든다 — 8/30 하루에만 11쌍이 이렇게 갈라졌다(실측).
 * dj_aliases.normalized UNIQUE 도 대소문자를 다른 값으로 보므로 DB 가 못 막는다.
 */
const normalizeDjName = (s) => {
  const stripped = String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
  const noLead = stripped.startsWith("dj") ? stripped.slice(2) : stripped;
  const noTrail = noLead.endsWith("dj") ? noLead.slice(0, -2) : noLead;
  return noTrail || stripped;
};

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
  //
  // 릴리즈/프리리스닝 파티를 신호에 넣은 이유(2026-08-30 실측): 아티스트 본인이
  // 자기 앨범 파티에서 DJ도 트는 밤이 흔한데, 이 가드가 그걸 통째로 DJ로 밀어냈다.
  //   NAFLA "INSTINCT" PRE-LISTENING PARTY → DJ[..., NAFLA]
  //   Colde "ICE BREAK CLUB" NEW EP RELEASE PARTY → DJ[..., Colde, Khakii]
  // 둘 다 "그 사람 보러 가는 밤"이라 공연이 맞다. 가수가 한 명이라도 있으면
  // 공연으로 본다는 아래 규칙이 이 가드 때문에 무력화되고 있었다.
  const SINGER_SIGNAL_RE = /콘서트|단독공연|쇼케이스|보컬|랩(?:을|하는|퍼)|가수|아티스트|SPECIAL\s*CYPHER|CONCERT|SHOWCASE/i;
  // 사전에 있는 이름은 캡션 신호와 무관하게 가수로 확정한다(위 KNOWN_SINGERS).
  // 이 보정이 없으면 아래 가드가 NAFLA·Colde 같은 실제 가수까지 DJ로 밀어낸다.
  const dictSingers = [...singers, ...djNames].filter(isKnownSinger);
  if (singers.length > 0 && !SINGER_SIGNAL_RE.test(String(r.raw_caption ?? ""))) {
    djNames = [...djNames, ...singers];
    singers = [];
  }
  if (dictSingers.length > 0) {
    const seen = new Set(singers.map((n) => String(n).toUpperCase()));
    for (const n of dictSingers) if (!seen.has(String(n).toUpperCase())) singers.push(n);
  }

  // 가수가 한 명이라도 잡히면 공연으로 남긴다. is_live_show 는 참고만 —
  // 이 플래그가 파티 성격(클럽 파티)에 끌려 false 로 나오는 경우가 있는데
  // (실측: Cakeshop 'Summer of LEMON' 은 LOBOTOME 라이브가 있는데도 false),
  // 실제 가수 이름이 나왔다면 공연 탭에서 빼는 게 더 큰 손실이다.
  // 판정 근거가 아예 없는 건 건드리지 않는다(2026-08-30 실측).
  //
  // 출연진을 한 명도 못 뽑았다는 건 "DJ 파티"라는 뜻이 아니라 "판단할 재료가
  // 없다"는 뜻이다. 그런데 singers=0 이면 무조건 DJ로 내려가는 구조라, 수동
  // 입력분처럼 라인업이 비어 있는 공연이 통째로 묻혔다 — HIPHOPPLAYA SHOW
  // Vol.63, 2026 대구힙합페스티벌, 경희대·성결대 축제, CROSS THE NIGHT 등
  // 10건이 실제로 그렇게 내려갔다. 근거 없이 내리느니 그대로 두는 게 맞다.
  if (singers.length === 0 && djNames.length === 0) {
    kept++;
    console.log(`⏭️  ${r.event_date} ${r.club_name_raw} | ${r.title}`);
    console.log(`     출연진 없음 — 판정 근거가 없어 건너뜀`);
    continue;
  }

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
      await sb.from("club_events")
        .update({ status: "rejected", status_reason: "reclassified_dj" })
        .eq("id", r.id);
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
