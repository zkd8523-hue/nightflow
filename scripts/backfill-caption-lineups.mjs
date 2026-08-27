/**
 * 이미 저장된 club_events.raw_caption 에서 라인업 블록을 뽑아 club_lineups 에 넣는다.
 *
 * 배경: 수집기의 라인업 경로는 포스터 Vision 전용이라 **동영상(Reel) 게시물이 통째로
 * 누락**됐다. 그런 게시물도 캡션에 "LINE UP / 이름 @핸들 ..." 이 다 적혀 있어서
 * 포스터를 볼 필요가 없다. 수집기는 고쳤고(saveCaptionLineup), 이 스크립트는
 * 그동안 놓친 과거분을 메운다.
 *
 * 실측 사고: lionseoul SOUNDCLASH 게시물이 DJ 9명짜리 파티인데
 *   - club_lineups: 없음 (Reel 이라 Vision 게이트 탈락)
 *   - club_events: YVES 한 명만 (캡션의 '(LIVE)' 를 가수 공연으로 오판)
 * 결과적으로 DJ 라인업 탭에 안 뜨고 공연 탭에 1명짜리로 떴다.
 *
 * 사용: DRY_RUN=1 node scripts/backfill-caption-lineups.mjs
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

// ── _shared/lineup-logic.ts 와 동일 규칙 (Deno 모듈이라 여기 복제) ──────────
const ROLE_PREFIX_RE = /^(dj|live|guest|host|opening|support|b2b|vj|mc)\s*[-:]?\s*/i;
const LINEUP_HEADER_RE = /^\s*(LINE\s*UP|LINEUP|라인업|TIME\s*TABLE|타임테이블)\s*:?\s*$/i;
const LINEUP_END_RE = /^\s*(RUNNING\s*HOURS?|TICKETS?|VENUE|ADDRESS|INFO|DATE|TIME|가격|티켓|장소|주소|문의|예약|OPEN|ENTRANCE|DOOR)\b/i;

function extractCaptionLineup(caption) {
  const lines = String(caption ?? "").split("\n");
  const start = lines.findIndex((l) => LINEUP_HEADER_RE.test(l));
  if (start === -1) return [];
  const rows = [];
  const seen = new Set();
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { if (rows.length > 0) break; continue; }
    if (LINEUP_END_RE.test(line)) break;
    if (LINEUP_HEADER_RE.test(line)) continue;
    const m = line.match(/^(.*?)\s*(?:@(\w[\w._]{1,29}))?\s*$/);
    if (!m) continue;
    const handle = m[2] ? m[2].toLowerCase() : null;
    const name = m[1].replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
      .replace(ROLE_PREFIX_RE, "").replace(/[-–—:•·,]+$/, "").trim();
    if (!name || name.length > 40) continue;
    if (/[.!?]$/.test(name) || /(입니다|합니다|해요|와 함께|과 함께)/.test(name)) continue;
    // "+Special Guests", "and more", "레지던트" 등은 특정 인물이 아니라 자리표시자다.
    // DJ 마스터에 등록하면 실존하지 않는 인물 행이 생기고 인스타를 영영 못 찾는다.
    if (/^[+\-]?\s*(special\s*guests?|guests?|and\s*more|more\s*tba|tba|tbd|residents?|레지던트|게스트|스페셜\s*게스트|외\s*\d+명)$/i.test(name)) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ raw_name: name, handle });
  }
  return rows;
}
const normalizeDjName = (s) =>
  String(s ?? "").toUpperCase().replace(ROLE_PREFIX_RE, "").replace(/[^\p{L}\p{N}]/gu, "").trim();

// ── 대상: 캡션에 LINE UP 블록이 있고 클럽이 연결된 이벤트 ─────────────────
const { data: events, error } = await sb
  .from("club_events")
  .select("id, club_id, event_date, title, raw_caption, source_url, source_post_id")
  .not("raw_caption", "is", null)
  .not("club_id", "is", null);
if (error) { console.error(error.message); process.exit(1); }

let published = 0, handles = 0, skipped = 0;
const seenPost = new Set();

for (const ev of events) {
  if (seenPost.has(ev.source_post_id)) continue;
  const rows = extractCaptionLineup(ev.raw_caption);
  if (rows.length < 2) continue;
  seenPost.add(ev.source_post_id);

  // 이미 이 날짜·클럽에 라인업이 있으면 건너뛴다(Vision 이 처리한 것)
  const { data: exist } = await sb
    .from("club_lineups")
    .select("id")
    .eq("club_id", ev.club_id)
    .eq("lineup_date", ev.event_date)
    .maybeSingle();
  if (exist) { skipped++; continue; }

  console.log(`\n▸ ${ev.event_date} ${ev.title ?? ""} — DJ ${rows.length}명`);
  console.log(`   ${rows.map((r) => r.raw_name + (r.handle ? `(@${r.handle})` : "")).join(", ")}`);
  if (DRY_RUN) continue;

  const sets = [];
  for (const r of rows) {
    const norm = normalizeDjName(r.raw_name);
    if (!norm) continue;
    const { data: djId } = await sb.rpc("ensure_dj", { p_raw_name: r.raw_name, p_normalized: norm });
    if (!djId) continue;
    if (r.handle) {
      const { data: upd } = await sb.from("djs").update({ instagram: r.handle })
        .eq("id", djId).is("instagram", null).select("id");
      if (upd?.length) handles++;
    }
    sets.push({ dj_id: djId, start_min: null, end_min: null, raw_name: r.raw_name });
  }
  if (sets.length < 2) continue;

  const { error: rpcErr } = await sb.rpc("upsert_club_lineup", {
    p_club_id: ev.club_id,
    p_event_date: ev.event_date,
    p_door_open_min: null,
    p_event_title: ev.title,
    p_poster_url: null,
    p_sets: sets,
    p_source: "ig_auto",
    p_draft_id: null,
  });
  if (rpcErr) { console.log(`   ❌ ${rpcErr.message}`); continue; }
  published++;
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 라인업 ${published}건 게시 / DJ 핸들 ${handles}개 / 기존보유 스킵 ${skipped}건`);
