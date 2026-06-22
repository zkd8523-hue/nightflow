/**
 * 클럽 구글 평점·리뷰수 인제스션 (Google Places API New — searchText)
 *
 * 사용:
 *   1) .env.local 에 GOOGLE_PLACES_API_KEY=... 추가
 *   2) Supabase 대시보드에서 마이그레이션 317 적용 (google_rating 등 컬럼 생성)
 *   3) node scripts/ingest-google-ratings.mjs
 *
 * 동작: 실제 클럽(is_test 제외)마다 "클럽명 + 주소"로 텍스트 검색 → 첫 결과의
 *       rating / userRatingCount / place_id 를 clubs 테이블에 저장.
 * 비용: 클럽 1개 = 1 콜. 120개 ≈ $4 (월 $200 무료크레딧 내). 평점은 잘 안 변하니
 *       월 1회 정도 재실행하면 충분.
 * 멱등: 재실행 시 같은 행을 UPDATE. 매칭 실패한 클럽은 다음 실행에서 재시도됨.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// --- .env.local 파싱 ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY 가 .env.local 에 없습니다.");
  process.exit(1);
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Places API(New) 텍스트 검색 → 첫 결과 반환 (없으면 null) */
async function searchPlace(query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      // rating/userRatingCount 는 Enterprise SKU 필드 (그래도 120개면 무료크레딧 내)
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "en", regionCode: "KR" }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.places?.[0] ?? null;
}

// --- 노출 클럽만 조회 (클럽 리스트/지도와 동일 필터) ---
// deleted_at IS NULL + 이름에 '운영자' 없음 → 유령/정크/운영자 클럽 제외해 할당량 절약
const { data: allClubs, error } = await sb
  .from("clubs")
  .select("id,name,address,area,google_rating")
  .is("deleted_at", null)
  .not("name", "ilike", "%운영자%");
if (error) {
  console.error("DB 조회 실패:", error.message);
  process.exit(1);
}
// 기본: 평점 없는 클럽만 처리 (재실행 시 빠진 것만 → 할당량 절약, 멱등)
// 전체 새로고침하려면 REFRESH_ALL=1 환경변수로 실행.
const clubs = process.env.REFRESH_ALL
  ? allClubs
  : allClubs.filter((c) => c.google_rating == null);
console.log(
  process.env.REFRESH_ALL
    ? "[전체 새로고침 모드]"
    : "[증분 모드 — 평점 없는 클럽만]"
);

console.log(`총 ${clubs.length}개 클럽 인제스션 시작...\n`);
let ok = 0, miss = 0, fail = 0;

for (const c of clubs) {
  const query = `${c.name} ${c.address ?? c.area ?? ""}`.trim();
  try {
    const place = await searchPlace(query);
    if (!place) {
      miss++;
      console.log(`✗ MISS  ${c.name}`);
      await sleep(150);
      continue;
    }
    const { error: upErr } = await sb
      .from("clubs")
      .update({
        google_place_id: place.id ?? null,
        google_rating: place.rating ?? null,
        google_review_count: place.userRatingCount ?? null,
        google_synced_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (upErr) throw new Error(`DB update: ${upErr.message}`);
    ok++;
    console.log(
      `✓ ${c.name}  →  ${place.displayName?.text ?? "?"}  ⭐${place.rating ?? "-"} (${place.userRatingCount ?? 0})`
    );
    await sleep(150); // 과도한 QPS 방지
  } catch (e) {
    fail++;
    console.log(`✗ FAIL  ${c.name} — ${e.message}`);
    await sleep(300);
  }
}

console.log(
  `\n완료 — 성공 ${ok} / 매칭없음 ${miss} / 실패 ${fail} (총 ${clubs.length})`
);
console.log("매칭없음/실패 클럽은 이름·주소를 보정 후 재실행하면 다시 시도됩니다.");
