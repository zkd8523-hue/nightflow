/**
 * 같은 장소에 서로 다른 지역이 붙은 것을 하나로 통일한다.
 *
 * 왜 생겼나:
 *   큐레이션 계정 캡션 하나에 공연이 10~16건 들어있다. LLM 백필이 캡션 전체를 보고
 *   지역을 뽑다 보니 **다른 항목의 지역**을 끌어온 경우가 있다.
 *   실측: "둔산동힙합클럽 세븐즈"(대전)에 홍대·서울이, "롤링홀"(홍대)에 강남이,
 *   "올림픽공원 올림픽홀"(송파)에 홍대가 붙었다.
 *
 * 방식: **KNOWN_AREA 에 등재된 장소만** 고친다.
 *
 *   최빈값 자동 선택은 시도했다가 폐기했다 — 대부분의 장소가 1건 대 1건이라 최빈값이
 *   사실상 무작위였고, 드라이런에서 "잠실실내체육관 → 홍대", "낙원악기상가 → 홍대",
 *   "JJ Mahoney's → 타이페이" 같은 명백한 오답을 만들어냈다.
 *   틀린 지역을 다른 틀린 지역으로 바꾸는 건 개선이 아니다. 확신 있는 것만 고치고
 *   나머지는 그대로 둔다(잘못된 값보다 손대지 않은 값이 낫다).
 *
 * 사용: DRY_RUN=1 node scripts/unify-venue-area.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * 실제 위치를 확인한 장소만 등재한다. 여기 없는 장소는 건드리지 않는다.
 *
 * 지역 값은 화면 칩(AREA_OPTIONS: 강남/홍대/이태원/수원/대구/부산/광주)과 맞아야 필터가
 * 동작한다. 그 칩에 없는 위치(송파·광진·중구 등)는 억지로 가까운 칩에 밀어넣지 않고
 * "서울"로 둔다 — 칩에는 안 잡히지만 텍스트로는 정확히 표시되고, 무엇보다 거짓말이 아니다.
 */
const KNOWN_AREA = new Map([
  // 홍대·합정·서교 권역
  ["롤링홀", "홍대"],
  ["벨로주 홍대", "홍대"],
  ["연남스페이스", "홍대"],
  ["무신사개러지", "홍대"],            // 서교동
  ["예스24 원더로크홀", "홍대"],       // 서교동
  ["YES24 원더로크홀", "홍대"],
  ["명화라이브홀", "홍대"],
  ["웨스트브릿지 라이브 홀", "홍대"],
  ["클럽 박스", "홍대"],
  ["플렉스 라운지", "홍대"],           // 합정
  ["TW RECORDS", "홍대"],
  // 이태원·한남 권역
  ["그레인 하우스", "이태원"],
  ["그레인 하우스 클럽", "이태원"],
  ["Grand Hyatt Seoul JJ Mahoney's Lounge", "이태원"],  // 한남동 그랜드하얏트
  ["JJ Mahoney's", "이태원"],
  ["신도시", "이태원"],
  // 지방
  ["둔산동힙합클럽 세븐즈", "대전"],
  // 칩에 없는 서울 권역 — "서울"로 정확히 둔다
  ["예스24 라이브홀", "서울"],         // 광진구 구의동
  ["올림픽공원 올림픽홀", "서울"],     // 송파구
  ["장충체육관", "서울"],              // 중구
  ["잠실실내체육관", "서울"],          // 송파구
  ["KBS 아레나", "서울"],              // 강서구
  ["낙원악기상가 2층", "서울"],        // 종로구
  // 해외
  ["Zepp New Taipei", "타이페이"],
  ["duo MUSIC EXCHANGE", "도쿄"],
]);

const { data: rows, error } = await sb
  .from("club_events")
  .select("id, club_name_raw, venue_area")
  .is("club_id", null)
  .not("club_name_raw", "is", null);
if (error) { console.error(error.message); process.exit(1); }

// ── 장소별 지역 분포 ──────────────────────────────────────────────
const byVenue = new Map();
for (const r of rows) {
  if (!byVenue.has(r.club_name_raw)) byVenue.set(r.club_name_raw, []);
  byVenue.get(r.club_name_raw).push(r);
}

let fixed = 0;
const report = [];

for (const [venue, list] of byVenue) {
  const dist = new Map();
  for (const r of list) if (r.venue_area) dist.set(r.venue_area, (dist.get(r.venue_area) ?? 0) + 1);

  // 확인된 장소만 고친다 — 추측으로 덮어쓰지 않는다
  const target = KNOWN_AREA.get(venue);
  if (!target) continue;

  const wrong = list.filter((r) => r.venue_area !== target);
  if (wrong.length === 0) continue;

  report.push(
    `  ${venue}: → ${target} (${wrong.length}건 수정, 기존 ${[...dist.entries()].map(([a, n]) => `${a}:${n}`).join(" ")})`
  );
  fixed += wrong.length;

  if (!DRY_RUN) {
    for (const r of wrong) {
      await sb.from("club_events").update({ venue_area: target }).eq("id", r.id);
    }
  }
}

console.log(DRY_RUN ? "🧪 [DRY RUN]" : "🚀 [실행]");
report.forEach((l) => console.log(l));
console.log(`\n📊 ${DRY_RUN ? "예상" : "완료"} — ${fixed}건 지역 통일`);
