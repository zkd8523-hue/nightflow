/**
 * 2026년 9월 첫 주 라인업 수동 입력 — TIMES / BREED / SOAP
 *
 * 출처: 사용자가 준 인스타 캡처 (2026-08-31)
 *   - @timesapgu  "SEP WEEK 1" 포스터 + 캡션(핸들 포함) → 9/3~9/5
 *   - @breed_official 주간 스케줄 포스터 → 9/2~9/6
 *   - @soapseoul  9월 월간 포스터 → 9/5 이후 (9/4 Sidechain 은 이미 ig_auto 로 수집됨)
 *
 * 시간 정보:
 *   TIMES 는 캡션에 요일별 영업시간이 있다(목 22-04, 금·토 22-05). 다만 DJ별
 *   개별 셋 시간은 없으므로 start_min/end_min 은 NULL 로 둔다 — Migration 573 이
 *   허용하고, 순서는 sort_order 로 보존된다. 없는 시간을 균등분할로 지어내면
 *   포스터에 없는 정보가 사실처럼 박힌다.
 *
 *   BREED / SOAP 도 같은 이유로 시간 없음.
 *
 * 사용: DRY_RUN=1 node scripts/import-sep-week1-lineups.mjs
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

// 영업일 06:00 기준 경과 분 (22:00=960)
const toMin = (h, m = 0) => ((h < 6 ? h + 24 : h) - 6) * 60 + m;

// ── 입력 데이터 ────────────────────────────────────────────────────────────
// handle 은 캡션에 명시된 것만 넣는다. 포스터에만 이름이 있는 경우 null —
// 추측해서 넣으면 엉뚱한 계정이 DJ 프로필에 박힌다(SAM(KOR) 사클 오입력 전례).
const DATA = [
  {
    club: "timesapgu",
    date: "2026-09-03",
    title: "TIMES X SOAP [STAFF TAKEOVER]",
    door: toMin(22),
    djs: [
      ["CHAXIN", "jeongdahyung"], ["HWN", "hwn"], ["CAKELAB", "cakelaaaab"],
      ["OGE", "ogeow"], ["KENNID", "kennid"], ["ANDREW SON", "andrewson"],
      ["UNGKIM", "ungkim"], ["ILLSUNG", "illsungprinxess"], ["KAMI", "ononkami"],
      ["ASSCHIHO", "asschiho"],
    ],
  },
  {
    club: "timesapgu",
    date: "2026-09-04",
    title: null,
    door: toMin(22),
    djs: [
      ["JADA", "jada23"], ["MULTIVSN", "multivsn"], ["DANSE", "madeindanse"],
      ["LAZYBOI", "iobyzal"], ["EGO", "ejiihyo"], ["FULLTIME", "freethefulltime"],
    ],
  },
  {
    club: "timesapgu",
    date: "2026-09-05",
    title: null,
    door: toMin(22),
    djs: [
      ["DOBERMAN", "doberman___kr"], ["GHOSTEX", "ghostexx"], ["MERPIK", "merpik_"],
      ["PHILLIP", "pgcphill"], ["CONOR", "notreallyconor"], ["ANDREW SON", "andrewson"],
    ],
  },
  // ── BREED 주간 스케줄 (포스터만, 핸들 없음) ──
  {
    club: "breed_official",
    date: "2026-09-02",
    title: "CAMPUS TO BREED",
    door: null,
    djs: [["ASH"], ["BIXXB"], ["CALFSKIN"], ["LAZY"], ["NOJU"], ["GROZ"], ["TRY"]],
  },
  {
    club: "breed_official",
    date: "2026-09-03",
    title: "ALL KINDS SOUND",
    door: null,
    djs: [["ASH"], ["BIXXB"], ["CALFSKIN"], ["LAZY"], ["NOJU"], ["PEACE:BLUR"], ["ROREN"], ["TRY"]],
  },
  {
    club: "breed_official",
    date: "2026-09-04",
    title: "ORIGINAL GROUND",
    door: null,
    djs: [["ASH"], ["BIXXB"], ["CALFSKIN"], ["GROZ"], ["DOONG2"], ["LAZY"], ["NOJU"], ["PEACE:BLUR"], ["ROREN"], ["TRY"]],
  },
  {
    club: "breed_official",
    date: "2026-09-05",
    title: "WHO'S NEXT?",
    door: null,
    djs: [["ASH"], ["BIXXB"], ["CALFSKIN"], ["GROZ"], ["LAZY"], ["PEACE:BLUR"], ["NOJU"], ["ROREN"], ["TRY"]],
  },
  {
    club: "breed_official",
    date: "2026-09-06",
    title: "BLACK OUT",
    door: null,
    djs: [["BIXXB"], ["CALFSKIN"], ["LAZY"], ["GROZ"], ["PEACE:BLUR"], ["ROREN"], ["TRY"]],
  },
  // ── SOAP 월간 포스터: 실존 DJ 로 확인되는 날만 ──
  // 9/4 는 이미 ig_auto 로 5명짜리 상세 라인업이 있다. upsert 는 replace-all 이라
  // 여기서 헤드라이너 1명으로 덮으면 4명이 사라진다 — 제외한다.
  //
  // ⚠️ 아래 날짜들은 일부러 뺐다. 포스터의 그 줄은 사람 이름이 아니라 파티명이다:
  //   09.12 DOUBLE VISION / 09.19 SCAMSTERDAM / 09.23 SOAP UNIVERSITY / 09.25 CHUSOAP
  //   (CHUSOAP = 추석 + SOAP). djs 에 넣으면 실존하지 않는 DJ 행이 생기고
  //   인스타를 영영 못 찾는다 — backfill-caption-lineups 가 'and more'·'레지던트'를
  //   거르는 것과 같은 이유다. 라인업이 공개되면 그때 수집기가 채운다.
  //
  // "A PRESENTS B" 는 A=주최, B=게스트로 둘 다 실존 아티스트라 함께 넣는다.
  { club: "soapseoul", date: "2026-09-05", title: "DAN SHAKE (UK)", door: null, djs: [["DAN SHAKE"]] },
  { club: "soapseoul", date: "2026-09-10", title: "DABEULL (FR / DJ SET)", door: null, djs: [["DABEULL"]] },
  { club: "soapseoul", date: "2026-09-11", title: "KOLLIN PRESENTS OLI XL (SWE)", door: null, djs: [["KOLLIN"], ["OLI XL"]] },
  { club: "soapseoul", date: "2026-09-17", title: "COLDE PRESENTS ICE BREAK CLUB", door: null, djs: [["COLDE"]] },
  { club: "soapseoul", date: "2026-09-18", title: "SCREAM PRESENTS YOUNG FRANCO", door: null, djs: [["SCREAM"], ["YOUNG FRANCO"]] },
  { club: "soapseoul", date: "2026-09-26", title: "SAIDAH (NL)", door: null, djs: [["SAIDAH"]] },
];

// ── 클럽 핸들 → id ─────────────────────────────────────────────────────────
const handles = [...new Set(DATA.map((d) => d.club))];
const { data: clubs, error: clubErr } = await sb
  .from("clubs").select("id, name, instagram").in("instagram", handles);
if (clubErr) { console.error(clubErr.message); process.exit(1); }
const clubBy = Object.fromEntries(clubs.map((c) => [c.instagram, c]));
for (const h of handles) if (!clubBy[h]) { console.error(`❌ 클럽 미등록: @${h}`); process.exit(1); }

let done = 0, skipped = 0, handleSet = 0, failed = 0;

for (const row of DATA) {
  const club = clubBy[row.club];

  // 이미 있으면 건너뛴다 — upsert 는 replace-all 이라 기존 셋을 지워버린다.
  const { data: exist } = await sb
    .from("club_lineups").select("id, source")
    .eq("club_id", club.id).eq("event_date", row.date).maybeSingle();
  if (exist) {
    console.log(`⏭  ${row.date} ${club.name} — 이미 있음(${exist.source})`);
    skipped++;
    continue;
  }

  console.log(`\n▸ ${row.date} ${club.name} — ${row.title ?? "(제목없음)"} — DJ ${row.djs.length}명`);
  console.log(`   ${row.djs.map(([n, h]) => n + (h ? `(@${h})` : "")).join(", ")}`);
  if (DRY_RUN) continue;

  const sets = [];
  for (const [name, handle] of row.djs) {
    const norm = normalizeDjName(name);
    if (!norm) continue;
    const { data: djId, error: djErr } = await sb.rpc("ensure_dj", { p_raw_name: name, p_normalized: norm });
    if (djErr || !djId) { console.log(`   ⚠️ DJ 실패: ${name} ${djErr?.message ?? ""}`); continue; }
    if (handle) {
      const { data: upd } = await sb.from("djs").update({ instagram: handle })
        .eq("id", djId).is("instagram", null).select("id");
      if (upd?.length) handleSet++;
    }
    sets.push({ dj_id: djId, start_min: null, end_min: null, raw_name: name });
  }
  if (!sets.length) { console.log("   ❌ 셋 0개 — 건너뜀"); failed++; continue; }

  const { error: rpcErr } = await sb.rpc("upsert_club_lineup", {
    p_club_id: club.id,
    p_event_date: row.date,
    p_door_open_min: row.door,
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
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 저장 ${done}건 / 기존보유 스킵 ${skipped}건 / 실패 ${failed}건 / DJ 핸들 ${handleSet}개`);
