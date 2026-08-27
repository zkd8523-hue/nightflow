/**
 * parsed 가 비어 있는 pending 초안을 현재 프롬프트로 다시 파싱해 살린다.
 *
 * 왜(2026-08-27 확인):
 *   Modeci / THE HENZ CLUB 초안이 parsed=null 인 채 pending 에 남아 있었다.
 *   캡션에는 라인업이 멀쩡히 있는데(Modeci "Roof / Acidwork / Odd J / 2ndfloor",
 *   HENZ 10명) 옛 코드가 못 잡은 것이다. 현재 프롬프트로 돌리니 각각 8명·10명이
 *   정확히 나온다. "+82"("Um...")는 홍보물로 올바르게 판정된다.
 *
 * 안전장치:
 *   - 그 클럽·날짜에 이미 라인업이 있으면 건드리지 않는다
 *   - 신뢰도가 낮으면(핸들도 시간도 없는 한 명짜리) 게시하지 않고 pending 유지
 *
 * 사용: DRY_RUN=1 node scripts/reparse-unparsed-pending.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY = process.env.DRY_RUN === "1";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 정본 프롬프트를 소스에서 직접 읽는다 — 재처리가 프로덕션과 다른 규칙으로
// 돌면 결과가 미묘하게 갈린다(이 프로젝트에서 이미 겪은 문제).
function ex(src, name) {
  const m = src.match(new RegExp(`export const ${name}[\\s\\S]*?=`));
  if (!m) throw new Error(`${name} 못 찾음`);
  const r = src.slice(m.index + m[0].length);
  const n = r.search(/\nexport (const|function)/);
  return (n === -1 ? r : r.slice(0, n)).trim().replace(/;\s*$/, "").replace(/\s+as\s+const$/, "");
}
const src = readFileSync("src/lib/lineups/prompt.ts", "utf8");
const SYS = new Function(`return (${ex(src, "LINEUP_SYSTEM_PROMPT")})`)();
const TOOL = new Function(`return (${ex(src, "LINEUP_EMIT_TOOL")})`)();
const MODEL = new Function(`return (${ex(src, "LINEUP_TEXT_MODEL")})`)();

const normalizeDjName = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "").replace(/^dj/, "").replace(/dj$/, "")
  || String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
const HANDLE_RE = /^[a-z0-9._]{2,30}$/;
const sanitizeHandle = (r) => {
  if (!r) return null;
  const h = String(r).trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
};
const toMin = (t) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h > 23 || m > 59 ? null : h * 60 + m;
};
function resolveDate(md, posted) {
  if (!md || !/^\d{2}-\d{2}$/.test(md)) return null;
  const [mm, dd] = md.split("-").map(Number);
  const p = new Date(posted || Date.now());
  let y = p.getUTCFullYear();
  if (p.getUTCMonth() === 11 && mm === 1) y++;
  if (p.getUTCMonth() === 0 && mm === 12) y--;
  const iso = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const df = (new Date(`${iso}T00:00:00Z`) - p) / 864e5;
  return df < -3 || df > 90 ? null : iso;
}

const { data: drafts } = await sb
  .from("lineup_drafts")
  .select("id, club_id, ig_caption, ig_media_timestamp, poster_url, clubs(name)")
  .eq("status", "pending")
  .is("parsed", null)
  .not("ig_caption", "is", null);

console.log(DRY ? "🧪 [DRY RUN]" : "🚀 [실행]", `대상 ${drafts?.length ?? 0}건\n`);

let saved = 0, promo = 0, skipped = 0, failed = 0;

for (const d of drafts ?? []) {
  const name = d.clubs?.name ?? "?";
  const content = [];
  if (d.poster_url) content.push({ type: "image", source: { type: "url", url: d.poster_url } });
  content.push({
    type: "text",
    text: `이 게시물은 "${name}" 계정이 올렸다. 이 계정 자체가 그 클럽이다. 게시 시각: ${d.ig_media_timestamp}\n\n${String(d.ig_caption).slice(0, 3000)}`,
  });

  let out;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000, system: SYS, tools: [TOOL],
        tool_choice: { type: "tool", name: "emit_lineup" },
        messages: [{ role: "user", content }],
      }),
    });
    const j = await res.json();
    if (j.stop_reason === "max_tokens") throw new Error("max_tokens 에서 잘림");
    out = j.content?.find((b) => b.type === "tool_use")?.input;
    await new Promise((r) => setTimeout(r, 150));
  } catch (e) { console.log(`❌ ${name}: ${e.message}`); failed++; continue; }

  if (!out || out.is_promo_only || !(out.events ?? []).length) {
    console.log(`⏭  ${name} — 홍보물`);
    promo++;
    if (!DRY) await sb.from("lineup_drafts").update({ parsed: out ?? null, status: "not_timetable" }).eq("id", d.id);
    continue;
  }

  if (!DRY) await sb.from("lineup_drafts").update({ parsed: out }).eq("id", d.id);

  for (const ev of out.events) {
    const date = resolveDate(ev.event_date, d.ig_media_timestamp);
    if (!date) { console.log(`⏭  ${name} — 날짜 불명 ("${ev.event_date}")`); skipped++; continue; }

    const djRows = (ev.sets ?? []).filter((s) => (s.role ?? "dj") !== "artist" && String(s.dj_name ?? "").trim());
    if (!djRows.length) { console.log(`⏭  ${name} ${date} — DJ 없음`); skipped++; continue; }

    console.log(`✅ ${name} ${date} — DJ ${djRows.length}명: ${djRows.map((r) => r.dj_name).join(", ").slice(0, 70)}`);
    if (DRY) { saved++; continue; }

    const { data: exist } = await sb.from("club_lineups")
      .select("id").eq("club_id", d.club_id).eq("event_date", date).maybeSingle();
    if (exist) { console.log(`   → 이미 존재, 건너뜀`); skipped++; continue; }

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
      if (h) await sb.from("djs").update({ instagram: h }).eq("id", djId).is("instagram", null);
      sets.push({ dj_id: djId, start_min: toMin(row.start_hhmm), end_min: toMin(row.end_hhmm), raw_name: nm });
    }
    if (!sets.length) { failed++; continue; }

    const { error } = await sb.rpc("upsert_club_lineup", {
      p_club_id: d.club_id, p_event_date: date, p_door_open_min: null,
      p_event_title: ev.event_title || null, p_poster_url: d.poster_url ?? null,
      p_sets: sets, p_source: "ig_auto", p_draft_id: d.id,
    });
    if (error) { console.log(`   ⚠️ ${error.message}`); failed++; continue; }
    saved++;
  }
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY ? "예상" : "완료"} — 게시 ${saved} / 홍보물 ${promo} / 건너뜀 ${skipped} / 실패 ${failed}`);
console.log("=".repeat(52));
