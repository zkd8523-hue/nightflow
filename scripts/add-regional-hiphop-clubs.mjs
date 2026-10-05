/**
 * 경기·지방 힙합 클럽 신규 등록 (2026-10-05)
 *
 * 왜: 래퍼 게스트 공연(클럽에 래퍼를 초청하는 공연)은 도어 현매라 티켓 플랫폼에
 * 아예 없다. StagePick 888건 전수 확인 결과 0건이었다. 인스타가 유일한 소스인데
 * 정작 그 클럽들이 수집 목록에 없었다.
 *
 * ⚠️ 조사로 뒤집힌 전제: "경기 남부(용인·성남·안산·부천·일산)가 비어 있다"가 아니라
 * 그 지역엔 힙합 클럽이 **애초에 없다**. 경기권 힙합은 군부대 벨트(평택·동두천)와
 * 수원 인계동에 몰려 있다. 수원은 현존 4곳 중 이미 2곳을 갖고 있었다.
 *
 * 좌표: Kakao Local 검색으로 채웠다. 못 찾은 곳은 null 로 두고 나중에 보완한다
 * (좌표가 없으면 지도 핀이 안 뜬다 — feedback_club_geocode_on_register).
 * status 는 반드시 'approved' 여야 상세 페이지가 404 가 아니다.
 *
 * 사용: DRY_RUN=1 node scripts/add-regional-hiphop-clubs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY = process.env.DRY_RUN === "1";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CLUBS = [
  { name: "Club Velvet", name_en: "Club Velvet", area: "평택",
    instagram: "clubvelvetrok", address: "경기 평택시 신장동 (송탄)",
    latitude: null, longitude: null,          // 카카오 검색이 엉뚱한 가게를 줘서 비워둔다
    tags: ["genre:hiphop", "genre:trap", "venue_type:club"],
    operating_hours: "확인 필요",
    note: "팔로워 7.2만. bio 'Hiphop and trap music club'. 미군 기반이라 외국인 트랙과도 겹친다" },

  { name: "064 힙합라운지", name_en: "064 Hiphop Lounge", area: "제주",
    instagram: "064_lounge.jeju", address: "제주특별자치도 제주시 연동7길 22",
    latitude: 33.48812928360083, longitude: 126.4905617967469,
    tags: ["genre:hiphop", "venue_type:lounge"],
    operating_hours: "확인 필요",
    note: "래퍼 게스트 공연이 실제 확인된 유일한 곳(8/1 포스터에 10팀·티켓 12,000원)" },

  { name: "CHAIN", name_en: "Chain", area: "인천",
    instagram: "hiphop_chain", address: "인천 부평구 경원대로1403번길 5",
    latitude: 37.4916911169503, longitude: 126.72487805563,
    tags: ["genre:hiphop", "venue_type:lounge"],
    operating_hours: "수~일",
    note: "프로필에 '대관·파티·공연 문의 DM' 명시 = 게스트 공연 운영 구조" },

  { name: "파인애플", name_en: "Pineapple", area: "인천",
    instagram: "pine_hip", address: "인천 부평구 시장로30번길 5",
    latitude: 37.49335108192579, longitude: 126.72617690141075,
    tags: ["genre:hiphop", "venue_type:club"],
    operating_hours: "수~일 21:00-06:00", note: "부평 힙합" },

  { name: "CLUB ARIRANG", name_en: "Club Arirang", area: "수원",
    instagram: "clubarirang_suwon", address: "경기 수원시 팔달구 효원로249번길 50",
    latitude: 37.2645069942255, longitude: 127.030131091899,
    tags: ["genre:hiphop", "genre:rnb", "venue_type:club"],
    operating_hours: "금·토·공휴일 전날", note: "수원 인계동. 피치 다음가는 힙합 베이스" },

  { name: "CLUB YOLO", name_en: "Club Yolo", area: "평택",
    instagram: "yolo.no.1", address: "경기 평택시 평택2로 7",
    latitude: 36.9925639587881, longitude: 127.087491232323,
    tags: ["genre:hiphop", "venue_type:club"],
    operating_hours: "금·토", note: "Pyeongtaek Hip Hop Bar & Club" },

  { name: "SCRAMBLE", name_en: "Scramble", area: "전주",
    instagram: "scramblejeonju", address: "전북특별자치도 전주시 덕진구 명륜3길 17-2",
    latitude: 35.8430842615513, longitude: 127.127750118871,
    tags: ["genre:techno", "genre:house", "genre:hiphop", "venue_type:club"],
    operating_hours: "확인 필요", note: "전북대 인근 언더그라운드" },
];

// 중복 방어 — ClubForm 무검사 insert 가 중복을 만든 전례가 있다
const { data: existing } = await sb.from("clubs").select("id,name,instagram");
const have = new Set((existing ?? []).map((c) => (c.instagram ?? "").replace(/^@/, "").toLowerCase()));

let added = 0, skipped = 0;
for (const c of CLUBS) {
  if (have.has(c.instagram.toLowerCase())) {
    console.log(`⏭  ${c.name} — 이미 등록됨`); skipped++; continue;
  }
  const row = {
    name: c.name, name_en: c.name_en, area: c.area,
    instagram: c.instagram, address: c.address,
    latitude: c.latitude, longitude: c.longitude,
    tags: c.tags, operating_hours: c.operating_hours,
    status: "approved",            // active 면 상세가 404 다
    is_test: false,
    lineup_collect: true,
    lineup_post_limit: 2,          // 신규는 보수적으로. 성과 보고 올린다
  };
  if (DRY) {
    console.log(`[DRY] ${c.name.padEnd(16)} ${c.area.padEnd(4)} @${c.instagram.padEnd(20)} ${c.latitude ? "좌표O" : "좌표X"}`);
    console.log(`      ${c.note}`);
    added++; continue;
  }
  const { error } = await sb.from("clubs").insert(row);
  if (error) console.log(`❌ ${c.name}: ${error.message}`);
  else { console.log(`✅ ${c.name} (${c.area})`); added++; }
}
console.log(`\n${DRY ? "[DRY RUN] " : ""}추가 ${added} · 건너뜀 ${skipped}`);
if (!DRY) console.log("좌표 없는 곳: Club Velvet — 나중에 보완 필요");
