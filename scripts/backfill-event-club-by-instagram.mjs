/**
 * club_events.club_id 가 비어 있는 행을 clubs.instagram 기준으로 다시 매칭한다.
 *
 * 왜 필요한가:
 *   파싱이 장소를 클럽명이 아니라 인스타 핸들로 저장한 경우가 많다("rosso_seoul").
 *   기존 매칭은 clubs.name / name_en / aliases 만 봤기 때문에 핸들 표기는 전부
 *   미매칭으로 남았고, 그 결과 화면에서 썸네일도 클럽 링크도 안 나온다.
 *
 * 매칭 근거 두 가지 (둘 다 정확 일치만 — 부분 일치는 오연결 원인):
 *   1. club_name_raw 에 들어있는 핸들 토큰  ("rosso_seoul, mousebeltclub" → 둘 다 시도)
 *   2. source_account (그 계정이 클럽이면 그 클럽이 장소)
 *
 * 사용: DRY_RUN=1 node scripts/backfill-event-club-by-instagram.mjs
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

const norm = (s) => String(s ?? "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._]/g, "");

// ── 클럽 핸들 색인 ────────────────────────────────────────────────
const { data: clubs, error: ce } = await sb
  .from("clubs")
  .select("id, name, instagram")
  .not("instagram", "is", null)
  .is("deleted_at", null);
if (ce) { console.error("clubs 조회 실패:", ce.message); process.exit(1); }

const byHandle = new Map();
for (const c of clubs) {
  const h = norm(c.instagram);
  if (h) byHandle.set(h, c);
}
console.log(`클럽 핸들 색인 ${byHandle.size}개\n`);

// ── 대상: club_id 미연결 ──────────────────────────────────────────
const { data: rows, error } = await sb
  .from("club_events")
  .select("id, club_name_raw, source_account")
  .is("club_id", null);
if (error) { console.error("events 조회 실패:", error.message); process.exit(1); }

let matched = 0;
const hits = new Map(); // 클럽명 -> 건수

for (const r of rows) {
  // club_name_raw 는 "a, b" 형태로 여러 핸들이 들어있을 수 있다
  const tokens = String(r.club_name_raw ?? "").split(/[,/·|]+/).map(norm).filter(Boolean);
  tokens.push(norm(r.source_account));

  let club = null;
  for (const t of tokens) {
    const c = byHandle.get(t);
    if (c) { club = c; break; }
  }
  if (!club) continue;

  matched++;
  hits.set(club.name, (hits.get(club.name) ?? 0) + 1);
  if (!DRY_RUN) {
    // 표기도 클럽 정식 이름으로 바꾼다 — 핸들이 화면에 그대로 뜨는 걸 막는다
    await sb.from("club_events").update({ club_id: club.id, club_name_raw: club.name }).eq("id", r.id);
  }
}

console.log(`${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 미연결 ${rows.length}건 중 ${matched}건 매칭`);
console.log("=".repeat(52));
for (const [name, n] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}
