/**
 * XX (홍대, 1호점) 9/9~9/12 라인업 수동 입력.
 *
 * 배경(2026-09-14): @hongdae_xx 계정 하나가 XX(서교동)·XX2(와우산로) 두 매장의
 * 라인업을 한 게시물에 같이 올린다. 수집기는 핸들→클럽이 1:1 이라 XX2 로만
 * 귀속했고, XX1 4일치는 통째로 버려졌다(실측: XX2 는 9/11·12 저장됨, XX 는 0건).
 * 그래서 XX 가 "한 번도 안 잡힌 클럽"으로 집계됐다 — 계정이 죽은 게 아니라
 * 한 계정이 두 매장을 대표하는 구조를 수집기가 모르는 것이다.
 *
 * 출처: https://www.instagram.com/p/DdEAFbjSjos/ (2026-09-09 게시)
 * 시간·핸들 전부 캡션에 명시돼 있다. 추측 입력 없음.
 *
 * 시간 표기: "12:00~01:15" 의 12:00 은 자정(00:00)이다 — 12시간제 함정.
 * 영업일 06:00 기준 분으로 환산하면 00:00 → 1080, 06:30 → 1470.
 * "05:00-END" 는 XX DJ(클럽 이름) 이라 셋으로 넣지 않고 직전 셋의 종료로만 쓴다.
 *
 * 사용: DRY_RUN=1 node scripts/import-xx1-sep-w2.mjs
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

const normalizeDjName = (s) => {
  const x = String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const a = x.startsWith("dj") ? x.slice(2) : x;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || x;
};

/**
 * "HH:MM" → 영업일 06:00 기준 분. 이 캡션은 12시간제 밤 시각이다.
 *
 * DRY_RUN 으로 잡은 함정 두 개:
 *   "11:10" → 밤 23:10 이다(금·토 오픈). 오전 11시로 읽으면 310 이 되어
 *             다음 셋(12:10=1090)보다 앞서 버린다. 6~11시는 +12h.
 *   "06:30" → 다음날 아침 06:30 = 1470 이다. h<6 에 안 걸려 30 이 됐다.
 *             06:xx 는 영업일 종료 쪽이므로 +24h.
 * 즉 이 표기에서 06~11 은 저녁(+12), 12 는 자정(0→+24), 00~05 는 새벽(+24).
 */
const toMin = (hhmm) => {
  let [h, m] = hhmm.split(":").map(Number);
  if (h === 12) h = 24;               // 12:xx = 자정 = 다음날 0시
  else if (h <= 6) h += 24;            // 00~06 = 새벽·아침 마감 (06:30 → 1470)
  else if (h <= 11) h += 12;           // 07~11 = 저녁 19~23시
  return (h - 6) * 60 + m;
};

const CLUB_ID = "85d91b4f-1e9d-4281-a8f7-400c22161e43"; // XX (서교동)
const SOURCE_URL = "https://www.instagram.com/p/DdEAFbjSjos/";

// [이름, 핸들, 시작, 종료]. 종료 "END" 는 다음 셋(XX DJ) 시작 = 그 시각.
const DATA = [
  { date: "2026-09-09", sets: [
    ["TNT","tnt_young_xx","12:00","01:15"], ["J1","deejayj1","01:15","02:30"],
    ["SUKI","sukion","02:30","03:45"], ["SOMA","djssoma","03:45","05:00"],
  ]},
  { date: "2026-09-10", sets: [
    ["TNT","tnt_young_xx","12:00","01:15"], ["EBONY","djebony87","01:15","02:30"],
    ["PEBBLE","pebble_______","02:30","03:45"], ["J1","deejayj1","03:45","05:00"],
  ]},
  { date: "2026-09-11", sets: [
    ["STONER","stoner_imma","11:10","12:10"], ["TNT","tnt_young_xx","12:10","01:20"],
    ["OSTIN","dj_ostin_","01:20","02:10"], ["BOOGIE","boogie.kr","02:10","03:30"],
    ["JIGGY","jiggy_wit_","03:30","04:30"], ["XX_NOWHERE","xx_nowhere","04:30","05:30"],
    ["HUE","dj__hue","05:30","06:30"],
  ]},
  { date: "2026-09-12", sets: [
    ["STONER","stoner_imma","11:10","12:10"], ["TNT","tnt_young_xx","12:10","01:20"],
    ["OSTIN","dj_ostin_","01:20","02:10"], ["BOOGIE","boogie.kr","02:10","03:30"],
    ["FLACKO","ucancallmeflacko","03:30","04:30"], ["EBONY","djebony87","04:30","05:30"],
    ["HUE","dj__hue","05:30","06:30"],
  ]},
];

let done = 0, skipped = 0, failed = 0, handleSet = 0;
for (const row of DATA) {
  const { data: exist } = await sb.from("club_lineups").select("id,source").eq("club_id", CLUB_ID).eq("event_date", row.date).maybeSingle();
  if (exist) { console.log(`⏭  ${row.date} 이미 있음(${exist.source})`); skipped++; continue; }

  console.log(`\n▸ ${row.date} — 셋 ${row.sets.length}개`);
  for (const [n, h, s, e] of row.sets) {
    const sm = toMin(s), em = toMin(e);
    console.log(`   ${s}~${e}  ${n.padEnd(12)} @${h}  (${sm}→${em})${em <= sm ? "  ⚠️ 역전" : ""}`);
  }
  if (DRY_RUN) continue;

  const sets = [];
  for (const [name, handle, s, e] of row.sets) {
    const { data: djId, error } = await sb.rpc("ensure_dj", { p_raw_name: name, p_normalized: normalizeDjName(name) });
    if (error || !djId) { console.log(`   ⚠️ DJ 실패 ${name}: ${error?.message}`); continue; }
    const { data: upd } = await sb.from("djs").update({ instagram: handle }).eq("id", djId).is("instagram", null).select("id");
    if (upd?.length) handleSet++;
    sets.push({ dj_id: djId, start_min: toMin(s), end_min: toMin(e), raw_name: name });
  }
  const { error: rpcErr } = await sb.rpc("upsert_club_lineup", {
    p_club_id: CLUB_ID, p_event_date: row.date, p_door_open_min: sets[0]?.start_min ?? null,
    p_event_title: null, p_poster_url: null, p_sets: sets, p_source: "admin_manual", p_draft_id: null,
  });
  if (rpcErr) { console.log(`   ❌ ${rpcErr.message}`); failed++; continue; }
  await sb.from("club_lineups").update({ source_url: SOURCE_URL }).eq("club_id", CLUB_ID).eq("event_date", row.date);
  console.log(`   ✅ 저장`); done++;
}
console.log(`\n📊 ${DRY_RUN ? "예상" : "완료"} — 저장 ${done} / 스킵 ${skipped} / 실패 ${failed} / 핸들 ${handleSet}`);
