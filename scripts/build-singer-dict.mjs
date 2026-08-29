/**
 * data/known-singers.json 생성 — 위키백과 가수/래퍼 분류 + 문서 별칭.
 *
 * 재분류(reclassify-events.mjs)의 1차 필터로 쓴다. "이 이름이 가수인가"를
 * LLM 판정보다 먼저 확정해, 아티스트가 자기 릴리즈 파티에서 DJ도 트는 밤이
 * 통째로 DJ 파티로 내려가는 걸 막는다.
 *
 * ⚠️ 재현율보다 정밀도를 노린 사전이다. 위키 분류에 빠진 가수가 있으므로
 *    "안 걸리면 DJ"로 쓰면 안 된다 — 걸리면 가수 확정으로만 쓴다.
 *
 * 사용: node scripts/build-singer-dict.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "fs";

const CATS = [
  "분류:대한민국의_남자_래퍼", "분류:대한민국의_여자_래퍼",
  "분류:대한민국의_힙합_가수", "분류:대한민국의_힙합_음악가",
  "분류:대한민국의_남자_가수", "분류:대한민국의_여자_가수",
  "분류:대한민국의_록_가수", "분류:대한민국의_싱어송라이터",
  "분류:대한민국의_아이돌", "분류:대한민국의_음악_그룹",
];

// 위키 분류에 없는 것으로 실측 확인된 이름들(2026-08-30). 분류가 보강되면 지워도 된다.
const MANUAL = [
  "NAFLA", "나플라", "SUMIN", "수민", "박재범", "Jay Park", "김하온", "HAON",
  "크라잉넛", "Khakii", "카키", "GOLDBUUDA", "골드부다", "POPXICK", "팝식",
  "Kid Milli", "키드밀리", "Paloalto", "팔로알토", "BE O", "비오",
  "JUSTHIS", "저스디스", "오카시", "OKASHII",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 위키 API는 짧은 간격으로 두드리면 JSON 대신 평문 에러를 준다 — 지수 백오프로 재시도.
async function api(params, tries = 4) {
  const u = new URL("https://ko.wikipedia.org/w/api.php");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("format", "json");
  for (let i = 0; i < tries; i++) {
    await sleep(700 * (i + 1));
    const res = await fetch(u, { headers: { "User-Agent": "NightFlow/1.0 (team@nightflow.kr)" } });
    const t = await res.text();
    try { return JSON.parse(t); } catch { /* rate limited — 재시도 */ }
  }
  return null;
}

const titles = new Set();
for (const cat of CATS) {
  let cont = null, before = titles.size;
  for (let guard = 0; guard < 40; guard++) {
    const p = { action: "query", list: "categorymembers", cmtitle: cat, cmlimit: "500" };
    if (cont) p.cmcontinue = cont;
    const j = await api(p);
    if (!j) break;
    for (const m of j.query?.categorymembers ?? []) if (m.ns === 0) titles.add(m.title);
    cont = j.continue?.cmcontinue ?? null;
    if (!cont) break;
  }
  console.log(`  ${cat}: +${titles.size - before}`);
}

// 문서 제목의 괄호 주석("비오 (가수)")은 떼고, 별칭(리다이렉트)도 함께 모은다 —
// 같은 사람이 "콜드"/"Colde", "비오"/"BE'O" 두 표기로 적히기 때문이다.
const strip = (t) => t.replace(/\s*\([^)]*\)\s*$/, "").trim();
const names = new Set([...titles].map(strip));
const arr = [...titles];
for (let i = 0; i < arr.length; i += 50) {
  const j = await api({ action: "query", prop: "redirects", titles: arr.slice(i, i + 50).join("|"), rdlimit: "max" });
  if (!j) continue;
  for (const p of Object.values(j.query?.pages ?? {}))
    for (const r of p.redirects ?? []) if (r.ns === 0) names.add(strip(r.title));
}
for (const n of MANUAL) names.add(n);

const out = "data/known-singers.json";
const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")).length : 0;
writeFileSync(out, JSON.stringify([...names]));
console.log(`\n${out}: ${prev} → ${names.size}개`);
