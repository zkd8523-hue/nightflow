/**
 * TECHNO IN HANGANG (부산) 2026년 9월 첫 주 라인업 수동 입력
 *
 * 출처: @techno.in.hangang 인스타 캐러셀 3장 (사용자 캡처, 2026-08-31)
 *   1/3  FRI 2026/09/04  "WE CAME TO RAVE"
 *   2/3  SAT 2026/09/05  "STARRY STRRAY NIGHT"
 *   3/3  SUN 2026/09/06  "ONE MORE DANCE"
 *
 * 이 포스터는 **셋별 시작 시각이 다 적혀 있다**(2300/2400/0100...0600).
 * 그래서 앞선 import-sep-week1-lineups.mjs 와 달리 start_min 을 채운다.
 *
 * 규칙:
 *   - end_min = 다음 셋의 start_min. 마지막 셋은 0600(클럽 마감 표기)까지.
 *   - 포스터 맨 아래 "TECHNO IN HANGANG 0600" 은 클럽명이지 DJ 가 아니다.
 *     셋으로 넣지 않고, 직전 셋의 종료 시각으로만 쓴다.
 *   - 같은 DJ 가 하루에 두 번 나오는 날이 있다(9/4 KARIS 2300·0500,
 *     9/5 MUV 2300·0500 — 오프닝과 클로징). UNIQUE(lineup_id, start_min) 이라
 *     시작 시각이 다르면 그대로 들어간다. 중복이 아니라 실제 두 타임이다.
 *
 * 인스타 핸들은 포스터에 없어서 넣지 않는다 — 추측 입력 금지.
 *
 * 사용: DRY_RUN=1 node scripts/import-techno-in-hangang-sep.mjs
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

/**
 * 포스터의 "2300" / "0100" 표기 → 영업일 06:00 기준 경과 분.
 * 06시 이전(0100 등)은 다음날 새벽이므로 +24h. 23:00=1020, 06:00=1440.
 */
const hhmmToMin = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2));
  return ((h < 6 ? h + 24 : h) - 6) * 60 + m;
};

const CLUB_HANDLE = "techno.in.hangang";

// 포스터 마지막 줄(클럽명 "TECHNO IN HANGANG 0600")의 시각 = 영업 종료.
//
// ⚠️ hhmmToMin("0600") 을 그대로 쓰면 안 된다 — 06:00 은 영업일의 *시작* 기준점
//    이라 0 이 나오고, 마지막 셋이 05:00(1380) → 0 이 되어 end_min > start_min
//    제약에 걸린다. 여기서 06:00 은 "다음날 아침 마감"이므로 1440(=24h)이다.
//    lineup_sets.end_min 은 1620 까지 허용하므로 범위 안이다.
const CLOSING_MIN = 24 * 60; // 영업일 06:00 기준 +24시간 = 다음날 06:00

const DATA = [
  {
    date: "2026-09-04",
    title: "WE CAME TO RAVE",
    sets: [
      ["KARIS", "2300"], ["LIMZI", "2400"], ["JOHNYRIGHTHERE", "0100"],
      ["ZET", "0200"], ["MUV", "0300"], ["LUX", "0400"], ["KARIS", "0500"],
    ],
  },
  {
    date: "2026-09-05",
    title: "STARRY STRRAY NIGHT",
    sets: [
      ["MUV", "2300"], ["LUX", "2400"], ["VEX", "0100"], ["DIA", "0200"],
      ["JOHNYRIGHTHERE", "0300"], ["KARIS", "0400"], ["MUV", "0500"],
    ],
  },
  {
    date: "2026-09-06",
    title: "ONE MORE DANCE",
    sets: [
      ["JOHNYRIGHTHERE", "2300"], ["MOOS", "2400"], ["MUV", "0100"],
      ["LUX & BILL", "0200"], ["ZET", "0300"], ["JUMMY", "0400"], ["KARIS", "0500"],
    ],
  },
];

const { data: club, error: clubErr } = await sb
  .from("clubs").select("id, name").eq("instagram", CLUB_HANDLE).maybeSingle();
if (clubErr || !club) { console.error(`❌ 클럽 미등록: @${CLUB_HANDLE}`); process.exit(1); }
console.log(`클럽: ${club.name} (@${CLUB_HANDLE})\n`);

let done = 0, skipped = 0, failed = 0;

for (const row of DATA) {
  const { data: exist } = await sb
    .from("club_lineups").select("id, source")
    .eq("club_id", club.id).eq("event_date", row.date).maybeSingle();
  if (exist) {
    console.log(`⏭  ${row.date} — 이미 있음(${exist.source})`);
    skipped++;
    continue;
  }

  // 시작 시각 → 분. 종료는 다음 셋의 시작, 마지막은 마감(0600).
  const starts = row.sets.map(([, t]) => hhmmToMin(t));
  const closing = CLOSING_MIN;

  console.log(`\n▸ ${row.date} — ${row.title} — 셋 ${row.sets.length}개`);
  for (let i = 0; i < row.sets.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : closing;
    console.log(`   ${row.sets[i][1]}~${i + 1 < starts.length ? row.sets[i + 1][1] : "0600"}  ${row.sets[i][0]}`);
    if (end <= starts[i]) { console.log(`   ⚠️ 시간 역전 — 확인 필요`); }
  }
  if (DRY_RUN) continue;

  const sets = [];
  for (let i = 0; i < row.sets.length; i++) {
    const [name] = row.sets[i];
    const norm = normalizeDjName(name);
    if (!norm) continue;
    const { data: djId, error: djErr } = await sb.rpc("ensure_dj", { p_raw_name: name, p_normalized: norm });
    if (djErr || !djId) { console.log(`   ⚠️ DJ 실패: ${name} ${djErr?.message ?? ""}`); continue; }
    sets.push({
      dj_id: djId,
      start_min: starts[i],
      end_min: i + 1 < starts.length ? starts[i + 1] : closing,
      raw_name: name,
    });
  }
  if (!sets.length) { console.log("   ❌ 셋 0개 — 건너뜀"); failed++; continue; }

  const { error: rpcErr } = await sb.rpc("upsert_club_lineup", {
    p_club_id: club.id,
    p_event_date: row.date,
    p_door_open_min: starts[0], // 첫 셋 시작을 도어오픈으로 본다(포스터에 별도 표기 없음)
    p_event_title: row.title,
    p_poster_url: null,
    p_sets: sets,
    p_source: "admin_manual",
    p_draft_id: null,
  });
  if (rpcErr) { console.log(`   ❌ ${rpcErr.message}`); failed++; continue; }
  console.log(`   ✅ 저장 (셋 ${sets.length}개)`);
  done++;
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 저장 ${done}건 / 기존보유 스킵 ${skipped}건 / 실패 ${failed}건`);
