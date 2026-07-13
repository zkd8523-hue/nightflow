/**
 * 클럽 구글 평점·리뷰수·리뷰 미리보기 인제스션 (Google Places API New)
 *
 * 사용:
 *   1) .env.local 에 GOOGLE_PLACES_API_KEY=... 추가
 *   2) Supabase 대시보드에서 마이그레이션 317, 459 적용 (google_rating/google_reviews 컬럼 생성)
 *   3) 터미널에서 `gcloud auth login` (최초 1회, 리뷰 조회에 필요 — 아래 참고)
 *   4) node scripts/ingest-google-ratings.mjs
 *
 * 동작: 실제 클럽(is_test 제외)마다 "클럽명 + 주소"로 텍스트 검색(searchText) → 첫 결과의
 *       rating / userRatingCount / place_id 저장. place_id로 Place Details 2차 호출해
 *       리뷰 최대 5개(영어 자동번역)도 함께 저장.
 *       ⚠️ 리뷰 조회는 API 키가 아닌 gcloud 사용자 OAuth 토큰 사용 — reviews 필드는
 *       작성자명·프로필사진 등 PII 포함이라 API 키 인증으로는 항상 빈 값만 반환됨(실측 확인).
 * 비용: 클럽 1개 = 검색 1콜(Text Search) + 리뷰 1콜(Place Details Enterprise+Atmosphere,
 *       $25/1000콜·0~10만 콜 구간). 120개 ≈ $3. 평점·리뷰는 잘 안 변하니 월 1회면 충분.
 * 멱등: 재실행 시 같은 행을 UPDATE. 매칭 실패한 클럽은 다음 실행에서 재시도됨.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { execSync } from "child_process";

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

// 리뷰(reviews) 필드는 작성자 이름·프로필사진 등 PII 포함이라 API 키로는 항상 빈 값만 옴 —
// 실측 확인됨(2026-07-14): 동일 place_id·필드마스크로 API 키=빈 응답, OAuth=리뷰 5개 정상.
// 평점/장소검색은 그대로 API 키 사용, 리뷰만 gcloud 사용자 OAuth 토큰으로 호출.
const GOOGLE_CLOUD_PROJECT = env.GOOGLE_CLOUD_PROJECT || "project-e2f2fb9c-2690-4fed-8fb";
function getGcloudAccessToken() {
  try {
    return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("gcloud 미인증 — 터미널에서 `gcloud auth login` 먼저 실행하세요.");
  }
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

/**
 * Place Details(New)로 리뷰 최대 5개 조회 (Enterprise+Atmosphere SKU, $25/1000콜 — 클럽당 월 1회면 무시할 수준).
 * 텍스트는 languageCode=en으로 요청 → 구글이 자동 번역해 영어로 반환 (스크린샷의 "Translated by Google"과 동일 동작).
 * API 키가 아닌 gcloud OAuth 토큰 사용 (위 주석 참조 — API 키로는 reviews 필드가 항상 빈 값).
 * token은 호출부에서 1회만 발급해 재사용 (매 클럽마다 gcloud 프로세스 재기동 방지).
 */
async function fetchReviews(placeId, token) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Goog-User-Project": GOOGLE_CLOUD_PROJECT,
        "X-Goog-FieldMask": "reviews",
      },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reviews HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.reviews ?? []).slice(0, 5).map((r) => ({
    author_name: r.authorAttribution?.displayName ?? null,
    rating: r.rating ?? null,
    relative_time: r.relativePublishTimeDescription ?? null,
    text: r.text?.text ?? r.originalText?.text ?? null,
  })).filter((r) => r.text);
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
const gcloudToken = getGcloudAccessToken();
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
    let reviews = [];
    if (place.id) {
      try {
        reviews = await fetchReviews(place.id, gcloudToken);
      } catch (e) {
        console.log(`  ↳ 리뷰 조회 실패 (평점은 정상 저장): ${e.message}`);
      }
    }
    const { error: upErr } = await sb
      .from("clubs")
      .update({
        google_place_id: place.id ?? null,
        google_rating: place.rating ?? null,
        google_review_count: place.userRatingCount ?? null,
        google_reviews: reviews,
        google_synced_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (upErr) throw new Error(`DB update: ${upErr.message}`);
    ok++;
    console.log(
      `✓ ${c.name}  →  ${place.displayName?.text ?? "?"}  ⭐${place.rating ?? "-"} (${place.userRatingCount ?? 0})  📝${reviews.length}건`
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
