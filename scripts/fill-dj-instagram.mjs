/**
 * 캡션의 "이름 @핸들" 패턴에서 DJ 인스타그램을 추출해 djs.instagram 을 채운다.
 *
 * 배경: 레지던트 DJ는 웹 검색으로 찾기 어렵다(동명 브랜드·소프트웨어가 섞여 나옴).
 * 반면 클럽은 포스터 캡션에 "SKIIDA @skiida" "MODAEEE @modaeee__" 처럼 이름과
 * 핸들을 나란히 적는 경우가 많다 — 클럽이 직접 태그한 것이라 신뢰도가 높다.
 *
 * 매칭 규칙(보수적): 캡션에서 "표기 @핸들" 인접 쌍을 뽑고, 표기의 정규화 키가
 * djs 의 별칭 키와 정확히 일치할 때만 채운다. 유사 매칭은 하지 않는다 —
 * 이전에 느슨한 매칭으로 "Ash → @ash.island" 같은 오연결이 났던 전례가 있다.
 *
 * 멱등: 이미 instagram 이 있는 DJ 는 건드리지 않는다.
 * 사용: DRY_RUN=1 node scripts/fill-dj-instagram.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** djName.ts / ensure_dj 와 동일한 정규화 규약 */
function normalizeDjName(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}

// 클럽 공식 계정은 개인 DJ 핸들이 아니다 — "BERMUDA DJ @bermuda_hongdae" 같은
// 오연결을 막기 위해 제외 목록으로 쓴다.
const { data: clubRows } = await sb.from("clubs").select("instagram").not("instagram", "is", null);
const clubHandles = new Set((clubRows ?? []).map((c) => c.instagram.toLowerCase()));

// 캡션 수집 — 라인업 draft + 공연 아카이브 양쪽
const [{ data: drafts }, { data: events }] = await Promise.all([
  sb.from("lineup_drafts").select("ig_caption").not("ig_caption", "is", null),
  sb.from("club_events").select("raw_caption"),
]);
const captions = [
  ...(drafts ?? []).map((d) => d.ig_caption),
  ...new Set((events ?? []).map((e) => e.raw_caption)),
].filter(Boolean);

/**
 * "표기 @핸들" 인접 쌍 추출.
 * 예) "SKIIDA @skiida", "DJ MAD (@iamdjmad )", "MODAEEE @modaeee__"
 * 핸들 바로 앞의 이름 토큰(한글/영문/숫자/&/. 조합)을 잡는다.
 */
const pairs = new Map(); // normalizedName -> Map(handle -> count)
const PAIR_RE = /([A-Za-z0-9가-힣&._'\- ]{2,30}?)\s*[({\[]?\s*@([a-zA-Z0-9._]{2,30})/g;
for (const cap of captions) {
  for (const m of cap.matchAll(PAIR_RE)) {
    const rawName = m[1].trim().replace(/[:\-–—]+$/, "").trim();
    const handle = m[2].toLowerCase();
    if (!rawName || clubHandles.has(handle)) continue;
    // "이름 뒤에 핸들이 연달아 여러 개" = 개인 태그가 아니라 **소속 명단 블록**이다.
    //   예) "DEEP OCEAN / @dada_hyeeeee / @justgerila / @moro_from_gard…"
    //       → DEEP OCEAN 은 광주의 클럽이고 아래는 그 클럽 DJ들이다. 첫 핸들을
    //         DEEP OCEAN 에 붙이면 남의 개인 계정을 클럽 이름에 다는 오연결이 된다.
    // 뒤따르는 공백/줄바꿈을 건너뛴 다음 글자가 또 @ 면 그 쌍은 통째로 버린다.
    if (/^[\s)\]}]*@/.test(cap.slice(m.index + m[0].length))) continue;
    const key = normalizeDjName(rawName);
    if (!key || key.length < 2) continue;
    if (!pairs.has(key)) pairs.set(key, new Map());
    const hm = pairs.get(key);
    hm.set(handle, (hm.get(handle) ?? 0) + 1);
  }
}
console.log(`캡션 ${captions.length}건에서 "이름 @핸들" 쌍 ${pairs.size}개 추출\n`);

// djs + 별칭 로드
// 소프트 삭제된 행(중복 병합으로 정리된 패자)은 채워봐야 아무 데도 안 보인다 — 제외
const { data: djs } = await sb.from("djs").select("id, display_name, instagram").is("deleted_at", null);
const { data: aliases } = await sb.from("dj_aliases").select("dj_id, normalized");
const aliasByDj = new Map();
for (const a of aliases ?? []) {
  if (!aliasByDj.has(a.dj_id)) aliasByDj.set(a.dj_id, []);
  aliasByDj.get(a.dj_id).push(a.normalized);
}

let filled = 0, skipped = 0;
const ambiguous = [];
for (const dj of djs ?? []) {
  if (dj.instagram) { skipped++; continue; }
  const keys = [normalizeDjName(dj.display_name), ...(aliasByDj.get(dj.id) ?? [])];
  let picked = null;
  for (const k of keys) {
    const hm = pairs.get(k);
    if (!hm) continue;
    // 같은 이름이 서로 다른 핸들로 잡히면 어느 쪽이 맞는지 알 수 없다 → 둘 다 버린다.
    // (예전엔 "가장 자주 등장한 핸들"을 택했는데, 이건 오연결이 미입력보다 나쁘다는
    //  이 프로젝트의 원칙과 어긋난다 — @ash.island 사고와 같은 계열의 위험이다)
    if (hm.size > 1) {
      ambiguous.push(`${dj.display_name} → ${[...hm.keys()].map((h) => "@" + h).join(" vs ")}`);
      continue;
    }
    picked = [...hm.keys()][0];
    break;
  }
  if (!picked) continue;
  console.log(`  ${dj.display_name.padEnd(20)} → @${picked}`);
  if (!DRY_RUN) await sb.from("djs").update({ instagram: picked }).eq("id", dj.id);
  filled++;
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 채움 ${filled}명 / 이미 있음 ${skipped}명 / 전체 ${(djs ?? []).length}명`);
if (ambiguous.length) {
  console.log(`\n⚠ 핸들이 충돌해 건너뜀 ${ambiguous.length}건 (사람이 확인):`);
  for (const a of ambiguous) console.log(`   ${a}`);
}
console.log("=".repeat(52));
