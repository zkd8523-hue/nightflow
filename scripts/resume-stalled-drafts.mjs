/**
 * parsed 는 있는데 normalized 가 비어 있는 pending 초안을 이어서 처리한다.
 *
 * 왜 생겼나(2026-08-27 확인):
 *   parsed 에 라인업이 멀쩡히 들어있는데(Lion 9셋, Bolero 11셋, Times 6셋 …)
 *   normalized 가 비어 화면에는 "셋 0개"로 뜬다. 검토도 게시도 못 하는 상태로
 *   실제 라인업 60여 개가 묶여 있었다. 생성 시각이 한 시점(8/26 17:17)에
 *   몰려 있는 걸로 보아, 그 실행이 파싱 직후 중단된 것으로 보인다
 *   (함수 재배포로 진행 중이던 인스턴스가 죽으면 이렇게 된다).
 *
 * LLM 재호출 없음 — 이미 저장된 parsed 를 그대로 쓴다. 비용 0원.
 *
 * 사용: DRY_RUN=1 node scripts/resume-stalled-drafts.mjs
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

const normalizeDjName = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "").replace(/^dj/, "").replace(/dj$/, "")
  || String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

const HANDLE_RE = /^[a-z0-9._]{2,30}$/;
const sanitizeHandle = (raw) => {
  if (!raw) return null;
  const h = String(raw).trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
};

/** "HH:MM" → 분. 프롬프트가 이미 24시간제로 변환해 주므로 여기선 파싱만 한다. */
function toMin(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** "MM-DD" + 게시시각 → ISO 날짜. 수집 함수의 resolveLineupDate 와 같은 규칙. */
function resolveDate(monthDay, postedAt) {
  if (!monthDay || !/^\d{2}-\d{2}$/.test(monthDay)) return null;
  const [mm, dd] = monthDay.split("-").map(Number);
  const posted = new Date(postedAt || Date.now());
  let year = posted.getUTCFullYear();
  if (posted.getUTCMonth() === 11 && mm === 1) year += 1;
  if (posted.getUTCMonth() === 0 && mm === 12) year -= 1;
  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const diff = (new Date(`${iso}T00:00:00Z`) - posted) / 864e5;
  return diff < -3 || diff > 90 ? null : iso;
}

const { data: drafts, error } = await sb
  .from("lineup_drafts")
  .select("id, club_id, parsed, normalized, ig_media_timestamp, clubs(name)")
  .eq("status", "pending")
  .not("parsed", "is", null);
if (error) { console.error(error.message); process.exit(1); }

const stalled = (drafts ?? []).filter((d) => (d.normalized?.sets?.length ?? 0) === 0);
console.log(DRY ? "🧪 [DRY RUN]" : "🚀 [실행]", `멈춘 초안 ${stalled.length}건\n`);

let published = 0, queued = 0, skipped = 0, failed = 0;

for (const d of stalled) {
  const events = d.parsed?.events ?? [];
  if (!events.length) { skipped++; continue; }

  for (const ev of events) {
    const eventDate = resolveDate(ev.event_date, d.ig_media_timestamp);
    if (!eventDate) {
      console.log(`⏭  ${d.clubs?.name} — 날짜 확정 불가 ("${ev.event_date}")`);
      skipped++;
      continue;
    }

    // DJ 만 club_lineups 로 간다(artist 는 공연 탭 소관이고, 그건 이미 처리됐다)
    const djRows = (ev.sets ?? []).filter((s) => (s.role ?? "dj") !== "artist" && String(s.dj_name ?? "").trim());
    if (!djRows.length) {
      console.log(`⏭  ${d.clubs?.name} ${eventDate} — DJ 없음(전부 artist)`);
      skipped++;
      continue;
    }

    console.log(`✅ ${d.clubs?.name} ${eventDate} — DJ ${djRows.length}명: ${djRows.map(r=>r.dj_name).join(", ").slice(0,70)}`);
    if (DRY) { published++; continue; }

    // 그 클럽·날짜에 이미 라인업이 있으면 건드리지 않는다
    const { data: exist } = await sb.from("club_lineups")
      .select("id").eq("club_id", d.club_id).eq("event_date", eventDate).maybeSingle();
    if (exist) { console.log(`   → 이미 존재, 건너뜀`); skipped++; continue; }

    const sets = [];
    const seen = new Set();
    for (const [i, row] of djRows.entries()) {
      const nm = String(row.dj_name).trim();
      const norm = normalizeDjName(nm);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const { data: djId, error: e1 } = await sb.rpc("ensure_dj", { p_raw_name: nm, p_normalized: norm });
      if (e1 || !djId) { console.log(`   ⚠️ ensure_dj(${nm}): ${e1?.message}`); continue; }
      const h = sanitizeHandle(row.instagram);
      if (h) await sb.from("djs").update({ instagram: h }).eq("id", djId).is("instagram", null);
      sets.push({
        dj_id: djId,
        start_min: toMin(row.start_hhmm),
        end_min: toMin(row.end_hhmm),
        raw_name: nm,
      });
    }
    if (!sets.length) { failed++; continue; }

    const { error: e2 } = await sb.rpc("upsert_club_lineup", {
      p_club_id: d.club_id, p_event_date: eventDate, p_door_open_min: null,
      p_event_title: ev.event_title || null, p_poster_url: null,
      p_sets: sets, p_source: "ig_auto", p_draft_id: d.id,
    });
    if (e2) { console.log(`   ⚠️ ${e2.message}`); failed++; continue; }
    published++;
  }
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY ? "예상" : "완료"} — 게시 ${published} / 건너뜀 ${skipped} / 실패 ${failed}`);
console.log("=".repeat(52));
