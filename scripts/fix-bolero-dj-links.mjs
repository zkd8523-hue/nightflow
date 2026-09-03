/**
 * BOLERO 9/4 라인업 DJ들의 미리듣기 링크 수동 입력 (2026-09-03).
 *
 * 출처: 사용자가 준 인스타 프로필 캡처 + 직접 준 링크. 전부 본인 계정에서 나온
 * 주소이고, soundcloud/youtube oEmbed 로 실존과 소유자를 확인했다.
 * 이름 추측으로 만든 주소는 하나도 없다(WAVY→lurz 오연결 전례).
 *
 * ⚠️ ANDOW 정정: 기존 값이 https://soundcloud.com/discotropic 이었다.
 *    oEmbed 로 확인하니 author_name 이 "Discotropic" — ANDOW 본인이 아니라
 *    그를 초대한 파티/레이블 채널이다. 발굴 스크립트가 트랙 URL
 *    (soundcloud.com/discotropic/andow-live-set-...) 에서 프로필 부분만 잘라내
 *    생긴 오연결이다. 트랙 주소를 그대로 쓴다 — 재생이 목적이라 트랙이어도 된다.
 *
 * 우선순위는 사클 > 유튜브(기존 규약: 유튜브는 muted 자동재생만 되고 곡 넘기기 없음).
 *
 * 사용: DRY_RUN=1 node scripts/fix-bolero-dj-links.mjs
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

// instagram 핸들로 찾는다 — 이름은 표기가 흔들리지만(ANDOW/Andow) 핸들은 유일하다.
const LINKS = [
  {
    handle: "gracektown",
    soundcloud: "https://soundcloud.com/gracektown",   // on.soundcloud.com 단축 해제
    youtube: "https://youtu.be/f5r-vBWzuSA",           // Passenger Princess 라이브 믹스
  },
  {
    handle: "unkelchubbz",
    soundcloud: "https://soundcloud.com/deejay-chubbz", // goo.gl 단축 해제
  },
  {
    handle: "co_kr",
    soundcloud: "https://soundcloud.com/co_kr",
  },
  {
    handle: "andow",
    // 프로필이 아니라 트랙. discotropic 채널에 올라간 ANDOW 의 라이브 셋이다.
    soundcloud: "https://soundcloud.com/discotropic/andow-live-set-for-discotropic-x-rbma",
    overwrite: true, // 잘못 들어간 discotropic 프로필을 덮어써야 한다
  },
  {
    handle: "daulbydaul",
    youtube: "https://www.youtube.com/watch?v=-a6bGOPUMAg", // Rinse France b2b 셋
  },
  {
    handle: "neverthelessthan",
    // 사클 단축주소(on.soundcloud.com/lguL8...)는 해제가 안 된다(만료/앱전용).
    // 유튜브 SCR 라이브만 넣는다.
    youtube: "https://www.youtube.com/live/ZAnE9OTA77w",
  },
];

let updated = 0, skipped = 0, missing = 0;

for (const row of LINKS) {
  // djs / artists 양쪽에 같은 사람이 있을 수 있다(CO.KR 실측) — 둘 다 채운다.
  for (const table of ["djs", "artists"]) {
    const { data: found } = await sb
      .from(table).select("id, display_name, soundcloud_url, youtube_url")
      .eq("instagram", row.handle).is("deleted_at", null);
    if (!found?.length) continue;

    for (const rec of found) {
      const patch = {};
      if (row.soundcloud && (row.overwrite || !rec.soundcloud_url)) patch.soundcloud_url = row.soundcloud;
      if (row.youtube && !rec.youtube_url) patch.youtube_url = row.youtube;

      if (!Object.keys(patch).length) {
        console.log(`⏭  ${table}/${rec.display_name} — 이미 있음`);
        skipped++;
        continue;
      }
      const was = rec.soundcloud_url ? ` (기존: ${rec.soundcloud_url})` : "";
      console.log(`▸ ${table}/${rec.display_name.padEnd(14)} ${JSON.stringify(patch)}${row.overwrite ? was : ""}`);
      if (DRY_RUN) { updated++; continue; }

      const { error } = await sb.from(table).update(patch).eq("id", rec.id);
      if (error) { console.log(`   ❌ ${error.message}`); continue; }
      updated++;
    }
  }
  const { data: anyDj } = await sb.from("djs").select("id").eq("instagram", row.handle).limit(1);
  const { data: anyAr } = await sb.from("artists").select("id").eq("instagram", row.handle).limit(1);
  if (!anyDj?.length && !anyAr?.length) { console.log(`⚠️ @${row.handle} — 대상 없음`); missing++; }
}

console.log(`\n${"=".repeat(52)}`);
console.log(`📊 ${DRY_RUN ? "예상" : "완료"} — 갱신 ${updated}건 / 스킵 ${skipped}건 / 대상없음 ${missing}건`);
