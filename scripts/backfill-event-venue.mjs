/**
 * club_events 의 장소·지역만 보정한다 (venue_area 가 비었거나 장소가 파티명으로
 * 잘못 들어간 행 대상).
 *
 * 왜 전체 재파싱이 아니라 이것만 하는가:
 *   라인업·날짜·제목은 이미 잘 나와 있다. 틀린 건 장소(club_name_raw)와 지역
 *   (venue_area) 두 필드뿐이라, 그 두 개만 다시 뽑으면 LLM 비용이 1/3로 준다.
 *
 * 고치는 두 가지 오류 (실측):
 *   1. 지역 미채움 — 캡션에 "서울 서초구 반포동 730-27"이 있는데 venue_area=null
 *      (603건 중 485건, 80%)
 *   2. 파티명을 장소로 오인 — @modeci_seoul 게시물인데 장소가 "Paprika"로 저장됨
 *      (Paprika는 그 클럽에서 열린 파티 이름)
 *
 * 게시 계정(source_account)을 프롬프트에 넘기는 게 핵심이다 — "이 계정이 클럽이면
 * 그 클럽이 기본 장소"라는 판단 근거가 된다.
 *
 * 사용: DRY_RUN=1 node scripts/backfill-event-venue.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = Number(process.env.LIMIT ?? 0); // 0 = 전체

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOOL = {
  name: "extract_venue",
  description: "인스타 캡션에서 공연 장소와 지역만 뽑는다.",
  input_schema: {
    type: "object",
    properties: {
      venue_name: {
        type: "string",
        description:
          "공연이 열리는 **장소(클럽/공연장) 이름**. 파티·이벤트 이름과 혼동하지 말 것.\n" +
          "게시 계정이 클럽이면 기본적으로 그 클럽이 장소다. 캡션에 다른 장소가 주소나 " +
          "'at OO에서'로 명시될 때만 그쪽을 쓴다.\n" +
          "예) @modeci_seoul 계정의 'Paprika @p.aprika_seoul' → 장소는 Modeci(또는 modeci_seoul), " +
          "Paprika는 파티 이름이므로 장소가 아니다.",
      },
      venue_area: {
        type: "string",
        description:
          "공연 지역. 캡션 어디에서든 찾아라 — 주소('서울 서초구 반포동 730-27'), 영문 도시명" +
          "('Seoul', 'in Seoul', 'Studio Paranoid, Seoul'), '📍 장소, 지역' 표기 모두 근거가 된다.\n" +
          "한국이면 광역 단위 한글로 정규화: 서울/부산/대구/인천/광주/대전/울산/세종/경기/제주.\n" +
          "'서울 서초구 반포동' → '서울', 'Seoul' → '서울', 'Tokyo' → '도쿄'.\n" +
          "정말 단서가 없으면 빈 문자열.",
      },
    },
    required: ["venue_name", "venue_area"],
  },
};

/**
 * 지역 정규화 — 모델이 "서울 중구", "Seoul", "<UNKNOWN>" 같은 값을 돌려주므로
 * 광역 단위 한글로 통일하고, 알 수 없는 값은 버린다(null이 잘못된 값보다 낫다).
 * 화면의 지역 칩(AREA_OPTIONS)과 맞아야 필터가 동작한다.
 */
// 화면 지역 칩은 AREA_OPTIONS(강남/홍대/이태원/수원/대구/부산/광주)를 쓴다.
// 서울을 통째로 "서울"이라 넣으면 어느 칩에도 안 걸리므로, 구·동 단서가 있으면
// 세 구역으로 떨군다. 서울인 건 아는데 구역을 모르면 "서울"로 두되 화면에서는
// 칩 없이 텍스트로만 보인다(필터엔 안 잡혀도 정보는 남는 편이 낫다).
const AREA_MAP = [
  // 서울 세부 — 클럽 밀집 지역 기준
  [/홍대|합정|상수|서교|망원|연남|마포/i, "홍대"],
  [/이태원|한남|용산|해방촌|경리단/i, "이태원"],
  [/강남|신사|청담|압구정|논현|역삼|서초|반포|성수|송파|잠실/i, "강남"],
  // 광역
  [/수원|성남|고양|용인|안양|부천|일산/i, "수원"],
  [/부산|busan/i, "부산"],
  [/대구|daegu/i, "대구"],
  [/광주|gwangju/i, "광주"],
  [/대전|daejeon/i, "대전"],
  [/인천|incheon/i, "인천"],
  [/제주|jeju/i, "제주"],
  // 해외 — 칩에는 없지만 국내/해외 구분에 쓰인다(decideStatus가 flagged 처리)
  [/도쿄|tokyo/i, "도쿄"],
  [/오사카|osaka/i, "오사카"],
  [/타이페이|타이베이|taipei/i, "타이페이"],
  [/홍콩|hong\s*kong/i, "홍콩"],
  [/하노이|hanoi/i, "하노이"],
  [/방콕|bangkok/i, "방콕"],
  // 마지막 폴백 — 서울인 건 알지만 구역 단서가 없을 때
  [/서울|seoul/i, "서울"],
];
function normalizeArea(raw) {
  const s = String(raw ?? "").trim();
  if (!s || /unknown|미상|없음|n\/?a/i.test(s)) return null;
  for (const [re, label] of AREA_MAP) if (re.test(s)) return label;
  return null; // 매칭 안 되면 넣지 않는다
}

async function extractVenue(caption, account, currentName) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "extract_venue" },
      messages: [
        {
          role: "user",
          content:
            `이 인스타 게시물은 "@${account}" 계정이 올린 것이다.\n` +
            `현재 저장된 장소는 "${currentName}"인데, 이게 실제 장소가 맞는지(파티 이름을 ` +
            `장소로 잘못 넣은 건 아닌지) 확인하고 지역도 찾아라.\n\n---\n${caption}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  const t = data.content?.find((b) => b.type === "tool_use");
  return t?.input ?? null;
}

// ── 대상: 지역이 비었거나 장소가 게시 계정과 무관해 보이는 행 ──────────────
const { data: rows, error } = await sb
  .from("club_events")
  .select("id, club_name_raw, venue_area, raw_caption, source_account, club_id")
  .is("venue_area", null)
  .order("event_date", { ascending: false });
if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

// 같은 게시물이 여러 행으로 쪼개져 있으면 캡션이 같으므로 한 번만 물어보고 공유한다
const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
console.log(DRY_RUN ? "🧪 [DRY RUN]" : "🚀 [실행]", `대상 ${targets.length}건 (전체 ${rows.length})\n`);

const cache = new Map(); // caption+account -> 결과
let filledArea = 0, fixedName = 0, failed = 0;

for (const [i, r] of targets.entries()) {
  const key = `${r.source_account}::${r.raw_caption?.slice(0, 300)}`;
  let out = cache.get(key);
  if (!out) {
    try {
      out = await extractVenue(r.raw_caption ?? "", r.source_account, r.club_name_raw);
      cache.set(key, out);
      await sleep(120);
    } catch (e) {
      failed++;
      console.log(`❌ ${r.club_name_raw}: ${e.message}`);
      continue;
    }
  }
  if (!out) { failed++; continue; }

  const patch = {};
  const newArea = normalizeArea(out.venue_area);
  const newName = (out.venue_name ?? "").trim();

  if (newArea && !r.venue_area) { patch.venue_area = newArea; filledArea++; }

  // 장소명 교정은 보수적으로 — dry-run에서 "신도시"(실제 장소)를 "축제"(파티명)로
  // 바꾸려는 오작동이 나왔다. 모델이 원문보다 낫다는 보장이 없으므로
  // "현재 값이 게시 계정 핸들 그대로인 경우"만 고친다(그때는 확실히 개선이다).
  const currentIsHandle =
    r.club_name_raw &&
    r.club_name_raw.toLowerCase().replace(/[^a-z0-9]/g, "") ===
      String(r.source_account).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (newName && newName !== r.club_name_raw && currentIsHandle) {
    patch.club_name_raw = newName;
    fixedName++;
  }

  if (Object.keys(patch).length === 0) continue;

  if (DRY_RUN) {
    console.log(`[${i + 1}] @${r.source_account}`);
    if (patch.club_name_raw) console.log(`   장소: "${r.club_name_raw}" → "${patch.club_name_raw}"`);
    if (patch.venue_area) console.log(`   지역: (없음) → "${patch.venue_area}"`);
  } else {
    await sb.from("club_events").update(patch).eq("id", r.id);
    if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${targets.length} (지역 ${filledArea} / 장소 ${fixedName})`);
  }
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 지역 채움 ${filledArea}건 / 장소 교정 ${fixedName}건 / 실패 ${failed}건`);
console.log(`   LLM 호출 ${cache.size}회 (캡션 중복 제거 후)`);
console.log("=".repeat(52));
