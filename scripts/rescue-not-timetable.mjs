/**
 * not_timetable 로 버려진 lineup_drafts 를 새 프롬프트(emit_lineup, 역할 분리 +
 * 시간 null 허용 + 게시물당 장소 개별화)로 다시 파싱해 건진다.
 *
 * 왜 다시 손대나:
 *   옛 파이프라인은 두 겹으로 정보를 버렸다.
 *     1) 포스터 타임테이블 전제 — 캡션에 라인업이 텍스트로 다 있어도, 포스터가
 *        없거나(동영상) Vision이 "타임테이블 아님"으로 판단하면 통째로 버렸다.
 *     2) sets.length < 2 게이트 — 게스트 1명 공지(진짜 흔한 형태)가 전부 탈락했다.
 *   Migration 573(시간 null 허용)과 이번 프롬프트 재작성(collect-club-events)으로
 *   두 문제 다 고쳤으니, 저장해 둔 캡션/포스터를 다시 돌리면 건질 수 있다.
 *
 * ⚠️ 소스 드리프트 방지: 이 스크립트는 자체 프롬프트를 만들지 않는다.
 *   src/lib/lineups/prompt.ts 에서 LINEUP_SYSTEM_PROMPT/LINEUP_EMIT_TOOL 를
 *   그대로 읽어와 쓴다 — 프로덕션과 다른 규칙으로 재처리하면 결과가 미묘하게
 *   갈린다(정확히 이 세션에서 고치고 있는 그 문제).
 *
 * Apify 재호출 없음 — 저장된 ig_caption 과 poster_url(있으면)만 쓴다.
 * 사용: DRY_RUN=1 node scripts/rescue-not-timetable.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 정본 프롬프트/툴을 소스에서 직접 읽는다 (check-lineup-prompt-sync.mjs와 동일 기법) ──
function extractExport(source, name) {
  const m = source.match(new RegExp(`export const ${name}[\\s\\S]*?=`));
  if (!m) throw new Error(`${name} 을 prompt.ts에서 못 찾음`);
  const rest = source.slice(m.index + m[0].length);
  const next = rest.search(/\nexport (const|function)/);
  return (next === -1 ? rest : rest.slice(0, next)).trim().replace(/;\s*$/, "").replace(/\s+as\s+const$/, "");
}
const promptSrc = readFileSync("src/lib/lineups/prompt.ts", "utf8");
const LINEUP_SYSTEM_PROMPT = new Function(`return (${extractExport(promptSrc, "LINEUP_SYSTEM_PROMPT")})`)();
const LINEUP_EMIT_TOOL = new Function(`return (${extractExport(promptSrc, "LINEUP_EMIT_TOOL")})`)();
const LINEUP_TEXT_MODEL = new Function(`return (${extractExport(promptSrc, "LINEUP_TEXT_MODEL")})`)();

const normalizeDjName = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
    .replace(/^dj/, "").replace(/dj$/, "") || String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

const HANDLE_RE = /^[a-z0-9._]{2,30}$/;
function sanitizeHandle(raw) {
  if (!raw) return null;
  const h = String(raw).trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

async function extract(caption, posterUrl, postedAt, clubName) {
  const content = [];
  if (posterUrl) content.push({ type: "image", source: { type: "url", url: posterUrl } });
  content.push({
    type: "text",
    text: `이 게시물은 "${clubName ?? "?"}" 계정이 올렸다. 이 계정 자체가 그 클럽이다 — ` +
      `캡션이 다른 장소를 명시하지 않는 한 모든 이벤트의 venue는 이 클럽이다. 게시 시각: ${postedAt ?? "?"}\n\n${String(caption ?? "").slice(0, 2500)}`,
  });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: LINEUP_TEXT_MODEL,
      // 8000: 3000 에서는 월간 스케줄/다이제스트가 잘려 빈 결과로 떨어졌다
      max_tokens: 8000,
      system: LINEUP_SYSTEM_PROMPT,
      tools: [LINEUP_EMIT_TOOL],
      tool_choice: { type: "tool", name: "emit_lineup" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  // 잘린 부분 결과는 "출연자 없음"과 구분이 안 되므로 실패로 센다
  if (data.stop_reason === "max_tokens") throw new Error(`max_tokens 에서 잘림 (캡션 ${String(caption ?? "").length}자)`);
  return data.content?.find((b) => b.type === "tool_use")?.input ?? null;
}

function resolveDate(monthDay, postedAt) {
  if (!monthDay || !/^\d{2}-\d{2}$/.test(monthDay)) return null;
  const [mm, dd] = monthDay.split("-").map(Number);
  const posted = new Date(postedAt || Date.now());
  let year = posted.getUTCFullYear();
  if (posted.getUTCMonth() === 11 && mm === 1) year += 1;
  if (posted.getUTCMonth() === 0 && mm === 12) year -= 1;
  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const diffDays = (new Date(`${iso}T00:00:00Z`) - posted) / 864e5;
  return diffDays < -3 || diffDays > 90 ? null : iso;
}

const { data: drafts, error } = await sb
  .from("lineup_drafts")
  .select("id, club_id, ig_caption, ig_media_timestamp, poster_url, clubs(name)")
  .eq("status", "not_timetable")
  .not("ig_caption", "is", null);
if (error) { console.error(error.message); process.exit(1); }

console.log(DRY_RUN ? "🧪 [DRY RUN]" : "🚀 [실행]", `대상 ${drafts.length}건\n`);

let saved = 0, promo = 0, noDate = 0, handles = 0, failed = 0, alreadyExist = 0;

for (const d of drafts) {
  let out;
  try {
    out = await extract(d.ig_caption, d.poster_url, d.ig_media_timestamp, d.clubs?.name);
    await sleep(150);
  } catch (e) { failed++; console.log(`❌ ${e.message}`); continue; }
  if (!out) { failed++; continue; }

  if (out.is_promo_only || !(out.events ?? []).length) { promo++; continue; }

  for (const ev of out.events) {
    const eventDate = resolveDate(ev.event_date, d.ig_media_timestamp);
    if (!eventDate) { noDate++; continue; }

    const djRows = (ev.sets ?? []).filter((s) => (s.role ?? "dj") !== "artist" && String(s.dj_name ?? "").trim());
    if (djRows.length === 0) continue;

    console.log(`✅ ${eventDate} ${d.clubs?.name} | ${ev.event_title || "(제목없음)"} — DJ ${djRows.length}명`);
    console.log(`     ${djRows.map((r) => r.dj_name + (r.instagram ? `(@${r.instagram})` : "")).join(", ")}`);
    if (DRY_RUN) { saved++; continue; }

    // 그 클럽·날짜에 이미 라인업이 있으면 건드리지 않는다(먼저 처리된 결과 우선)
    const { data: exist } = await sb.from("club_lineups")
      .select("id").eq("club_id", d.club_id).eq("event_date", eventDate).maybeSingle();
    if (exist) { alreadyExist++; continue; }

    const sets = [];
    const seen = new Set();
    for (const row of djRows) {
      const nm = String(row.dj_name).trim();
      const norm = normalizeDjName(nm);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const { data: djId } = await sb.rpc("ensure_dj", { p_raw_name: nm, p_normalized: norm });
      if (!djId) continue;
      const h = sanitizeHandle(row.instagram);
      if (h) {
        const { data: upd } = await sb.from("djs").update({ instagram: h })
          .eq("id", djId).is("instagram", null).select("id");
        if (upd?.length) handles++;
      }
      sets.push({ dj_id: djId, start_min: null, end_min: null, raw_name: nm });
    }
    if (sets.length === 0) continue;

    const { error: e2 } = await sb.rpc("upsert_club_lineup", {
      p_club_id: d.club_id, p_event_date: eventDate, p_door_open_min: null,
      p_event_title: ev.event_title || null, p_poster_url: null,
      p_sets: sets, p_source: "ig_auto", p_draft_id: d.id,
    });
    if (e2) { console.log(`   ⚠️ ${e2.message}`); failed++; continue; }
    await sb.from("lineup_drafts").update({ status: "auto_published" }).eq("id", d.id);
    saved++;
  }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 라인업 건짐 ${saved}건 / 핸들 ${handles}개`);
console.log(`   단순홍보(정당한 탈락) ${promo}건 / 날짜불명 ${noDate}건 / 이미존재 ${alreadyExist}건 / 실패 ${failed}건`);
console.log("=".repeat(56));
