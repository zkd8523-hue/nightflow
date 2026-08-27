/**
 * club_events.lineup(TEXT[]) → artists 마스터 + club_event_performers 조인 생성.
 *
 * 재파싱(reparse-club-events)으로 DJ를 걸러낸 뒤 실행한다.
 * ensure_artist() RPC가 artist_aliases.normalized UNIQUE 로 동일인 분열을 막는다.
 *
 * 캡션에 "@핸들"이 함께 언급된 아티스트는 instagram 도 같이 채운다
 * (문자열 유사 매칭 — 정확도 우선이라 느슨하게 잡지 않는다).
 *
 * 멱등: 재실행해도 같은 artist_id 로 수렴하고 조인은 UNIQUE 로 중복 방지.
 * 사용: node scripts/extract-artists.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** djName.ts / ensure_dj 와 동일한 정규화 규약 */
function normalizeName(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}

console.log("🔍 club_events 조회...");
const { data: events, error } = await sb
  .from("club_events")
  .select("id, lineup, raw_caption");
if (error) { console.error("조회 실패:", error.message); process.exit(1); }

// 캡션에서 발견되는 @핸들 수집 (아티스트 인스타 후보)
const handles = new Set();
for (const cap of new Set(events.map((e) => e.raw_caption))) {
  (cap.match(/@[a-zA-Z0-9._]{2,30}/g) || []).forEach((h) => handles.add(h.slice(1).toLowerCase()));
}
console.log(`📦 이벤트 ${events.length}건 / 캡션 내 핸들 ${handles.size}개\n`);

/** 아티스트명과 핸들이 충분히 유사하면 그 핸들을 반환 */
function findHandle(name) {
  const na = normalizeName(name);
  if (na.length < 3) return null;
  for (const h of handles) {
    const nh = normalizeName(h);
    if (nh === na || nh.startsWith(na) || na.startsWith(nh)) return h;
  }
  return null;
}

const artistCache = new Map(); // normalized -> artist_id
let created = 0, linked = 0, withIg = 0, failed = 0;

for (const [i, ev] of events.entries()) {
  const names = (ev.lineup ?? []).map((n) => String(n).trim()).filter(Boolean);
  for (const [idx, name] of names.entries()) {
    const norm = normalizeName(name);
    if (!norm || norm.length < 2) continue;

    let artistId = artistCache.get(norm);
    if (!artistId) {
      const { data, error: rpcErr } = await sb.rpc("ensure_artist", {
        p_raw_name: name,
        p_normalized: norm,
      });
      if (rpcErr || !data) { failed++; continue; }
      artistId = data;
      artistCache.set(norm, artistId);
      created++;

      // 캡션에 핸들이 있으면 함께 저장
      const h = findHandle(name);
      if (h) {
        await sb.from("artists").update({ instagram: h }).eq("id", artistId).is("instagram", null);
        withIg++;
      }
    }

    const { error: joinErr } = await sb.from("club_event_performers").upsert(
      { event_id: ev.id, artist_id: artistId, raw_name: name, sort_order: idx },
      { onConflict: "event_id,artist_id" }
    );
    if (!joinErr) linked++;
  }
  if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/${events.length} 처리`);
}

console.log(`\n${"=".repeat(56)}`);
console.log(`📊 완료`);
console.log(`   생성된 아티스트: ${created}명`);
console.log(`   인스타 자동 연결: ${withIg}명 (캡션 @핸들 기반)`);
console.log(`   공연-아티스트 연결: ${linked}건`);
console.log(`   실패: ${failed}건`);
console.log("=".repeat(56));
