/**
 * 인스타 라인업 파이프라인 무료 검증 — DB 쿼리만으로 결함을 찾는다.
 *
 * 왜(2026-08-27): 오늘 발견된 결함 6개 중 4개는 사용자가 앱 화면을 눈으로 보다가
 * 찾았고, 그 4개는 전부 숫자만 봤어도 당일 잡혔을 것들이었다(빈 카드, 낮 시작
 * 라인업, shortcode 오추출 등). 매 수집 후 이걸 돌리면 같은 방식으로 또
 * 찾아야 하는 일이 없어진다.
 *
 * 비용 0원 — Apify/LLM 호출 없음, 이미 저장된 데이터만 검사한다.
 *
 * ⚠️ start_min은 벽시계가 아니다 — 영업일 06시 기준 경과분이다.
 *    (min/60+6)%24 로 환산해야 한다. 오독하면 정상 데이터를 오류로 잘못 판정한다.
 *
 * 사용: node scripts/verify-lineup-pipeline.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function all(table, select, filter) {
  const out = [];
  let from = 0;
  for (;;) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const results = [];
function check(label, count, detail) {
  const pass = count === 0;
  results.push({ label, pass, count, detail });
}

const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ── 2-1. 유저 노출 데이터 ───────────────────────────────────────────────────

{
  const lineups = await all(
    "club_lineups",
    "id,event_date,club_id,lineup_sets(start_min,end_min,raw_name)",
    (q) => q.gte("event_date", todayKST)
  );

  const emptySets = lineups.filter((l) => !(l.lineup_sets ?? []).length);
  check("앞으로 뜰 라인업 중 셋 0개", emptySets.length, emptySets.map((l) => l.id));

  const dayStart = [];
  for (const l of lineups) {
    const timed = (l.lineup_sets ?? []).filter((s) => s.start_min != null);
    if (!timed.length) continue;
    const first = Math.min(...timed.map((s) => s.start_min));
    const hour = (Math.floor(first / 60) + 6) % 24; // 벽시계 환산 — 오독 금지
    if (hour >= 9 && hour <= 19) dayStart.push({ id: l.id, date: l.event_date, hour });
  }
  check("낮(09~19시) 시작 라인업", dayStart.length, dayStart);

  // ⚠️ "이름 중복 = 오류"는 틀린 가정이었다(자체 확인) — 같은 DJ가 밤중 두 번
  // (오프닝+마감 등) 트는 건 실제 클럽 타임테이블에서 흔한 정상 패턴이다.
  // 파싱 오류로 좁히려면 "같은 시간대에 같은 이름이 겹치는가"만 봐야 한다.
  const overlapDup = [];
  for (const l of lineups) {
    const timed = (l.lineup_sets ?? []).filter((s) => s.start_min != null);
    const byName = new Map();
    for (const s of timed) {
      if (!byName.has(s.raw_name)) byName.set(s.raw_name, []);
      byName.get(s.raw_name).push(s);
    }
    for (const [name, sets] of byName) {
      if (sets.length < 2) continue;
      const overlaps = sets.some((a, i) =>
        sets.slice(i + 1).some((b) => a.start_min < (b.end_min ?? b.start_min) && b.start_min < (a.end_min ?? a.start_min))
      );
      if (overlaps) overlapDup.push({ id: l.id, date: l.event_date, name });
    }
  }
  check("같은 시간대에 이름 겹침 (파싱 오류 의심)", overlapDup.length, overlapDup);
}

{
  const events = await all("club_events", "id,event_date,lineup", (q) =>
    q.eq("status", "approved").gte("event_date", todayKST)
  );
  const noPerformer = events.filter((e) => !(e.lineup ?? []).length);
  check("공연 중 출연자 0명", noPerformer.length, noPerformer.map((e) => e.id));
}

// 핸들 규격 위반 — 인스타 핸들 문법 자체를 벗어난 것만 잡는다.
// ⚠️ "11자면 shortcode다"는 틀린 휴리스틱이었다(2026-08-27 자체 발견): groovenspot,
// rosso_seoul, boleroseoul 전부 정상 핸들인데 우연히 11자라 전부 오탐이었다.
// shortcode는 형태(대소문자 랜덤 조합)로 구분이 안 되므로 길이 추정을 버리고
// 실제 인스타 핸들 문법(길이 1~30, 마침표 연속 금지, 시작/끝 마침표 금지)만 본다.
const HANDLE_RE = /^(?!\.)(?!.*\.\.)[a-zA-Z0-9._]{1,30}(?<!\.)$/;
async function checkHandles(table, col, extraFilter) {
  const rows = await all(table, `id,${col}`, (q) => {
    let x = q.not(col, "is", null);
    if (extraFilter) x = extraFilter(x);
    return x;
  });
  const bad = rows.filter((r) => !HANDLE_RE.test(r[col]));
  check(`핸들 문법 위반: ${table}.${col}`, bad.length, bad.map((r) => ({ id: r.id, [col]: r[col] })));
}
await checkHandles("clubs", "instagram");
await checkHandles("club_name_registry", "instagram_handle");
await checkHandles("artists", "instagram");
await checkHandles("djs", "instagram");

// 같은 클럽·날짜 중복 이벤트 (Migration 572 부분 UNIQUE 가 보장해야 함)
{
  const events = await all("club_events", "club_id,club_name_raw,event_date", (q) =>
    q.not("event_date", "is", null)
  );
  const seen = new Map();
  const dups = [];
  for (const e of events) {
    const key = `${e.club_id ?? e.club_name_raw}|${e.event_date}`;
    if (seen.has(key)) dups.push(key);
    seen.set(key, true);
  }
  check("같은 클럽·날짜 중복 이벤트", dups.length, dups);
}

// ── 2-2. 파싱 품질 회귀 ─────────────────────────────────────────────────────

{
  const recent = await all("lineup_drafts", "id,parsed,created_at", (q) =>
    q.not("parsed", "is", null).order("created_at", { ascending: false }).limit(200)
  );
  const noEvidence = recent.filter((d) => {
    const sets = (d.parsed?.events ?? []).flatMap((e) => e.sets ?? []);
    return sets.length > 0 && sets.some((s) => !s.evidence);
  });
  // evidence는 574 이후 신규 저장분에만 required이므로 오래된 행은 없을 수 있다 —
  // "최근 200건 중" 으로 범위를 좁혀 신규 저장 회귀만 잡는다.
  check("최근 초안 중 evidence 없는 set (신규 저장 회귀)", noEvidence.length, noEvidence.map((d) => d.id));
}

{
  const events = await all("club_events", "id,event_date", (q) => q.not("event_date", "is", null));
  const broken = events.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.event_date ?? ""));
  check("깨진 event_date 값", broken.length, broken);
}

// ── 2-3. 실행 기록 정합성 ────────────────────────────────────────────────────

{
  const runs = await all("collection_runs", "id,started_at", (q) =>
    q.eq("source", "club-events").order("started_at", { ascending: false })
  );
  const acctRows = await all("collection_account_results", "id,run_id");
  const orphans = acctRows.filter((a) => !a.run_id);
  check("run_id NULL 고아 행 (collection_account_results)", orphans.length, orphans.length);

  // ⚠️ 577/1-2 배포 이전 run이 만든 옛 행은 새 로직으로 안 찍혔으니 당연히
  // 위반처럼 보인다(자체 발견: 첫 run 84건 vs 배포 후 run 0건). 최신 run만 본다.
  const latestRunId = runs[0]?.id ?? null;
  const latestAcct = latestRunId ? acctRows.filter((a) => a.run_id === latestRunId) : [];
  const latestAcctFull = await all(
    "collection_account_results",
    "id,ig_handle,posts_processed,lineups_saved,outcome",
    (q) => q.eq("run_id", latestRunId)
  );

  const zeroProcNoLineup = latestAcctFull.filter((r) => r.posts_processed === 0 && r.outcome === "no_lineup");
  check(
    "최신 실행: posts_processed=0인데 outcome='no_lineup' (577 목적 위반)",
    zeroProcNoLineup.length,
    zeroProcNoLineup.map((r) => r.ig_handle)
  );

  const oddAttribution = latestAcctFull.filter((r) => r.posts_processed === 0 && r.lineups_saved > 0);
  check(
    "최신 실행: posts_processed=0인데 lineups_saved>0 (동시성 오염, 1-2 검증)",
    oddAttribution.length,
    oddAttribution.map((r) => r.ig_handle)
  );

  console.log(
    `ℹ️  collection_runs: ${runs.length}건 / collection_account_results: ${acctRows.length}건 (최신 run 계정 ${latestAcct.length}곳)`
  );
}

// ── 결과 출력 ────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
const passed = results.filter((r) => r.pass);
const failed = results.filter((r) => !r.pass);
console.log(`✅ ${passed.length}개 통과 / ❌ ${failed.length}개 실패\n`);
for (const r of results) {
  console.log(`${r.pass ? "✅" : "❌"} ${r.label}${r.pass ? "" : `: ${r.count}건`}`);
}
if (failed.length) {
  console.log(`\n${"─".repeat(60)}\n실패 상세:\n`);
  for (const r of failed) {
    console.log(`■ ${r.label}`);
    console.log(JSON.stringify(r.detail, null, 1).slice(0, 2000));
  }
}
console.log("=".repeat(60));
process.exit(failed.length ? 1 : 0);
