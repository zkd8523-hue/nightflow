/**
 * club_events.club_name_raw 표기를 통일한다 (같은 장소가 여러 행으로 갈린 것 병합).
 *
 * 왜 필요한가:
 *   자동 파싱이 캡션 원문을 그대로 쓰기 때문에 같은 장소가 표기만 다르게 쌓인다.
 *   실측: "스페이스 브릭"/"SPACE BRICK"/"스페이스브릭" 3종, "무신사개러지"/"무신사 개러지",
 *   "예스24 원더로크홀"/"YES24 WANDERLOCH HALL", "세븐즈"/"둔산동힙합클럽 세븐즈".
 *   화면에서는 다른 장소처럼 보이고, 검색해도 한쪽만 걸린다.
 *
 * 방식:
 *   정규화 키(공백·기호 제거, 소문자, "클럽/CLUB" 접사 제거)로 묶고,
 *   그룹 안에서 **가장 많이 쓰인 표기**를 대표로 삼는다. 빈도가 같으면 긴 쪽
 *   (정보가 더 많은 쪽 — "둔산동힙합클럽 세븐즈")을 고른다.
 *
 *   ※ 한글↔영문은 정규화 키가 달라 자동으로 안 묶인다(예: 스페이스브릭 vs SPACEBRICK).
 *     그런 쌍은 ALIAS_MAP 에 수동 등록한다 — 자동 추론은 오연결 위험이 크다.
 *
 * 사용: DRY_RUN=1 node scripts/normalize-event-venue.mjs
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

/** 한글/영문 표기가 같은 장소 — 정규화 키로는 못 묶이므로 수동 등록 */
const ALIAS_MAP = new Map([
  ["spacebrick", "스페이스브릭"],
  ["yes24wanderlochhall", "예스24원더로크홀"],
  ["yes24livehall", "예스24라이브홀"],
  ["studioparanoid", "스튜디오파라노이드"],
]);

/**
 * 캡션에 붙는 수식어 — 장소 이름 자체가 아니라 설명이다.
 * "둔산동힙합클럽 세븐즈" / "힙합클럽 세븐즈" / "세븐즈 클럽" 은 전부 대전 세븐즈 한 곳이다.
 * 지역명·장르·업태를 떼고 남는 고유명으로 묶는다.
 */
const MODIFIERS = /(둔산동|서면|경성대|홍대|이태원|강남|건대|신촌|압구정|성수|부산|대구|광주|대전|인천)?(힙합|테크노|하우스|알앤비)?(클럽|club|라운지|lounge|바|bar)/g;

const key = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\s\-_.·,]/g, "")
    .replace(MODIFIERS, "")
    // 수식어를 떼고 나면 빈 문자열이 되는 경우(예: "클럽")가 있으므로 원본으로 되돌린다
    || String(s ?? "").toLowerCase().replace(/[\s\-_.·,]/g, "");

const { data: rows, error } = await sb
  .from("club_events")
  .select("id, club_name_raw")
  .is("club_id", null); // 클럽 연결된 건 이미 정식명이라 건드리지 않는다
if (error) { console.error(error.message); process.exit(1); }

// ── 그룹핑 ────────────────────────────────────────────────────────
const groups = new Map(); // key -> Map(표기 -> 건수)
for (const r of rows) {
  const raw = r.club_name_raw;
  if (!raw) continue;
  let k = key(raw);
  if (!k) continue;
  k = ALIAS_MAP.get(k) ?? k;
  if (!groups.has(k)) groups.set(k, new Map());
  const m = groups.get(k);
  m.set(raw, (m.get(raw) ?? 0) + 1);
}

// ── 대표 표기 선정 + 적용 ──────────────────────────────────────────
let changed = 0;
const plan = new Map(); // 원표기 -> 대표표기
for (const [, variants] of groups) {
  if (variants.size < 2) continue;
  const canonical = [...variants.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length
  )[0][0];
  for (const [v] of variants) if (v !== canonical) plan.set(v, canonical);
}

console.log(DRY_RUN ? "🧪 [DRY RUN]" : "🚀 [실행]", `통합 대상 표기 ${plan.size}종\n`);
for (const [from, to] of plan) console.log(`  "${from}" → "${to}"`);

if (!DRY_RUN) {
  for (const [from, to] of plan) {
    const { count } = await sb
      .from("club_events")
      .update({ club_name_raw: to }, { count: "exact" })
      .eq("club_name_raw", from)
      .is("club_id", null);
    changed += count ?? 0;
  }
}
console.log(`\n📊 ${DRY_RUN ? "예상" : "완료"} — 표기 ${plan.size}종 통합${DRY_RUN ? "" : ` / ${changed}건 수정`}`);
