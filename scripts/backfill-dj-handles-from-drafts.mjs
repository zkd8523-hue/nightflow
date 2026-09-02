/**
 * lineup_drafts.parsed 안에 이미 들어 있는 인스타 핸들로 djs.instagram 을 메운다.
 *
 * 배경(2026-08-31): 사용자가 BREED 게시물을 보며 "인스타가 있는데 다 안 긁어진 것
 * 같다"고 지적했다. 확인해 보니 수집기는 핸들을 제대로 저장하고 있었지만
 * (DJ 888명 중 621명 보유), 드래프트에 추출돼 있으면서도 djs 에 반영되지 않은
 * 건이 남아 있었다. LLM 호출 없이 DB 안의 값만으로 메울 수 있는 몫이다.
 *
 * ⚠️ 이 스크립트는 유료 API 를 전혀 호출하지 않는다. Supabase 조회/갱신만 한다.
 *
 * 두 가지 일을 한다:
 *   1) lineup_drafts.parsed 의 (dj_name, instagram) 쌍 → djs.instagram 백필
 *   2) MANUAL_HANDLES — 드래프트에 없어서 1)로는 못 메우는 건 수동 보정
 *
 * 기존 값은 절대 덮지 않는다(.is("instagram", null)).
 *
 * 사용: DRY_RUN=1 node scripts/backfill-dj-handles-from-drafts.mjs
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

// ⚠️ src/lib/lineups/djName.ts 의 normalizeDjName() 정본과 같아야 한다(소문자 키).
const normalizeDjName = (s) => {
  const stripped = String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const noLead = stripped.startsWith("dj") ? stripped.slice(2) : stripped;
  const noTrail = noLead.endsWith("dj") ? noLead.slice(0, -2) : noLead;
  return noTrail || stripped;
};

const sanitizeHandle = (h) => {
  const v = String(h ?? "").trim().replace(/^@/, "").toLowerCase();
  return /^[\w.]{2,30}$/.test(v) ? v : null;
};

/**
 * 사람이 아닌 계정 — DJ 프로필로 만들면 안 되는 것들.
 *
 * _shared/lineup-logic.ts 의 NON_PERFORMER_HANDLES(티켓·플랫폼)와 같은 취지지만
 * 여기서 거르는 건 종류가 다르다: 크루/레이블 계정이다. 클럽 계정은 하드코딩하지
 * 않고 아래에서 clubs 테이블을 조회해 자동으로 뺀다 — 클럽이 늘어나도 맞으려면
 * 목록을 손으로 관리하면 안 된다.
 */
const NON_PERSON_HANDLES = new Set([
  "romantic_music_crew", // 크루 계정
]);
// 이름 자체가 사람이 아님을 드러내는 경우(레코드샵·크루 표기)
const NON_PERSON_NAME_RE = /(_records?|레코드|crew|크루|company|엔터)/i;

/**
 * 드래프트에 없어서 1)로는 못 메우는 건. 전부 사용자가 준 인스타 캡처의 캡션에
 * 명시돼 있던 값이다 — 추측으로 채운 것은 하나도 없다.
 * (출처: @breed_official "CALFSKIN PRESENT" 2026-08-28 게시물 캡션)
 *
 * 이 게시물은 CLUB_POST_MAX_AGE_DAYS=3 창 밖이라 수집기가 읽지 않는다. 창을
 * 넓히면 Apify+Claude 비용이 비례해 늘어나므로(2026-08-30 사고) 수동 보정한다.
 */
const MANUAL_HANDLES = [
  { name: "CALFSKIN", handle: "calfskin.kr" },
  { name: "JUNTARO", handle: "juntaromusic" },
  { name: "LOOZBONE", handle: "loozbone", createIfMissing: true },
];

// ── 1) 드래프트에서 (정규화이름 → 핸들) 수집 ──────────────────────────────
const { data: drafts, error: dErr } = await sb
  .from("lineup_drafts").select("parsed").not("parsed", "is", null);
if (dErr) { console.error(dErr.message); process.exit(1); }

const pairs = new Map(); // normalized -> { name, handle }
for (const d of drafts) {
  for (const ev of d.parsed?.events ?? []) {
    for (const s of ev.sets ?? []) {
      const handle = sanitizeHandle(s?.instagram);
      if (!handle || !s?.dj_name) continue;
      const key = normalizeDjName(s.dj_name);
      if (!key || pairs.has(key)) continue;
      pairs.set(key, { name: s.dj_name, handle });
    }
  }
}

// ── 클럽 계정은 제외 (DJ 가 아니라 장소다) ────────────────────────────────
const { data: clubRows } = await sb.from("clubs").select("instagram").not("instagram", "is", null);
const clubHandles = new Set(clubRows.map((c) => c.instagram.toLowerCase()));

// ── 별칭 → dj 조회 ─────────────────────────────────────────────────────────
const { data: aliases } = await sb.from("dj_aliases").select("normalized, dj_id");
const aliasMap = Object.fromEntries(aliases.map((a) => [a.normalized, a.dj_id]));
const { data: djs } = await sb.from("djs").select("id, display_name, instagram").is("deleted_at", null);
const djById = Object.fromEntries(djs.map((d) => [d.id, d]));

const targets = [];
const excluded = [];
for (const [key, v] of pairs) {
  const djId = aliasMap[key];
  if (!djId) continue;
  const dj = djById[djId];
  if (!dj || dj.instagram) continue; // 이미 있으면 건드리지 않는다

  if (clubHandles.has(v.handle)) { excluded.push([dj.display_name, v.handle, "클럽 계정"]); continue; }
  if (NON_PERSON_HANDLES.has(v.handle)) { excluded.push([dj.display_name, v.handle, "크루 계정"]); continue; }
  if (NON_PERSON_NAME_RE.test(dj.display_name)) { excluded.push([dj.display_name, v.handle, "이름이 사람 아님"]); continue; }

  targets.push({ djId, djName: dj.display_name, handle: v.handle });
}

console.log(`드래프트 ${drafts.length}건에서 (이름,핸들) 쌍 ${pairs.size}개 추출`);
console.log(`\n▶ 채울 DJ ${targets.length}명`);
for (const t of targets) console.log(`   ${t.djName.padEnd(18)} → @${t.handle}`);
if (excluded.length) {
  console.log(`\n⏭  제외 ${excluded.length}건 (사람이 아님)`);
  for (const [n, h, why] of excluded) console.log(`   ${n.padEnd(20)} @${h}  — ${why}`);
}

// ── 2) 수동 보정분 ─────────────────────────────────────────────────────────
console.log(`\n▶ 수동 보정 ${MANUAL_HANDLES.length}건 (캡처 캡션 출처)`);
const manualPlan = [];
for (const m of MANUAL_HANDLES) {
  const key = normalizeDjName(m.name);
  const djId = aliasMap[key];
  const dj = djId ? djById[djId] : null;
  if (dj?.instagram) { console.log(`   ⏭ ${m.name} — 이미 @${dj.instagram}`); continue; }
  if (!dj && !m.createIfMissing) { console.log(`   ⚠️ ${m.name} — DJ 미등록, 생성 안 함`); continue; }
  console.log(`   ${m.name.padEnd(18)} → @${m.handle}${dj ? "" : "  (신규 DJ 생성)"}`);
  manualPlan.push({ ...m, djId: dj?.id ?? null, normalized: key });
}

if (DRY_RUN) {
  console.log(`\n${"=".repeat(52)}`);
  console.log(`📊 예상 — 백필 ${targets.length}명 / 수동 ${manualPlan.length}건 (DRY_RUN, 변경 없음)`);
  process.exit(0);
}

// ── 실행 ───────────────────────────────────────────────────────────────────
let filled = 0, created = 0, failed = 0;

for (const t of targets) {
  const { data, error } = await sb.from("djs")
    .update({ instagram: t.handle }).eq("id", t.djId).is("instagram", null).select("id");
  if (error) { console.log(`❌ ${t.djName}: ${error.message}`); failed++; continue; }
  if (data?.length) filled++;
}

for (const m of manualPlan) {
  let djId = m.djId;
  if (!djId) {
    const { data, error } = await sb.rpc("ensure_dj", { p_raw_name: m.name, p_normalized: m.normalized });
    if (error || !data) { console.log(`❌ ${m.name} 생성 실패: ${error?.message ?? ""}`); failed++; continue; }
    djId = data;
    created++;
  }
  const { data: upd, error: uErr } = await sb.from("djs")
    .update({ instagram: m.handle }).eq("id", djId).is("instagram", null).select("id");
  if (uErr) { console.log(`❌ ${m.name}: ${uErr.message}`); failed++; continue; }
  if (upd?.length) filled++;
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 완료 — 핸들 채움 ${filled}건 / DJ 신규생성 ${created}건 / 실패 ${failed}건`);
