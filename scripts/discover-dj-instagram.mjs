/**
 * 클럽 인스타 "팔로잉 목록"에서 레지던트 DJ 계정을 찾아 djs.instagram 을 채운다.
 *
 * 왜 이 방법인가:
 *   레지던트 DJ는 웹 검색으로 안 나오고(동명 브랜드·해외 DJ만 잡힘), 클럽이
 *   게시물에 태그하지도 않는다. 그런데 클럽 계정은 팔로잉이 20~60개로 매우 적고
 *   거기에 자기 레지던트 DJ가 들어있다 — 실측으로 확인된 유일하게 통하는 경로.
 *   (예: bermuda_hongdae 팔로잉 20개 중 VICTA·SWEED·MINUTE·BRIXX·ZESTURE 발견)
 *
 * 판정: 팔로잉 계정의 fullName / username / biography 를 DJ 표기와 대조해
 *   - strong: 이름이 정확히 일치하거나 바이오에 "DJ {이름}" 이 그대로 있음 → 자동 저장
 *   - weak  : 부분 일치 → 저장하지 않고 목록만 출력(사람이 확인)
 *   느슨하게 저장하면 "Ash → @ash.island" 같은 오연결이 난 전례가 있어 보수적으로 간다.
 *
 * 사용: DRY_RUN=1 node scripts/discover-dj-instagram.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
/** djName.ts 규약 — 선행/후행 "dj" 제거 */
function normalizeDjName(raw) {
  const s = norm(raw);
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}

async function apify(actor, body) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

// ── 1) 대상 클럽: 라인업이 있는 클럽 + 인스타 보유 ──────────────────────
const { data: lineups } = await sb.from("club_lineups").select("clubs(name, instagram)");
const clubHandles = [
  ...new Set(
    (lineups ?? [])
      .map((l) => (Array.isArray(l.clubs) ? l.clubs[0] : l.clubs)?.instagram)
      .filter(Boolean)
  ),
];
console.log(`🔍 대상 클럽 ${clubHandles.length}곳: ${clubHandles.join(", ")}\n`);

// ── 2) 팔로잉 수집 (한 곳이 실패해도 나머지는 살리려고 개별 호출) ────────
const followings = [];
for (const h of clubHandles) {
  const rows = await apify("dead00~instagram-followers-following-scraper-no-cookies", {
    usernames: [h],
    dataToScrape: "Followings",
    maxResultsPerUser: 80,
  });
  const ok = rows.filter((r) => r.username);
  console.log(`  @${h} → 팔로잉 ${ok.length}개`);
  followings.push(...ok);
}
console.log(`\n📦 팔로잉 총 ${followings.length}건 수집\n`);

// ── 3) 인스타 없는 DJ 목록 ────────────────────────────────────────────
const { data: djs } = await sb.from("djs").select("id, display_name").is("instagram", null).is("deleted_at", null);
const { data: aliases } = await sb.from("dj_aliases").select("dj_id, normalized");
const aliasByDj = new Map();
for (const a of aliases ?? []) {
  if (!aliasByDj.has(a.dj_id)) aliasByDj.set(a.dj_id, []);
  aliasByDj.get(a.dj_id).push(a.normalized);
}

// ── 4) 후보 프로필 상세 조회 (바이오에 "DJ 이름"이 있는지 보려면 필요) ──
const candidateHandles = [...new Set(followings.map((f) => f.username))];
const profiles = new Map();
const CHUNK = 30;
for (let i = 0; i < candidateHandles.length; i += CHUNK) {
  const slice = candidateHandles.slice(i, i + CHUNK);
  const rows = await apify("apify~instagram-scraper", {
    directUrls: slice.map((u) => `https://www.instagram.com/${u}/`),
    resultsType: "details",
    resultsLimit: 1,
  });
  rows.forEach((p) => p.username && profiles.set(p.username.toLowerCase(), p));
  console.log(`  프로필 ${Math.min(i + CHUNK, candidateHandles.length)}/${candidateHandles.length} 조회`);
}
console.log("");

// ── 5) 매칭 ───────────────────────────────────────────────────────────
const strong = [];
const weak = [];

for (const dj of djs ?? []) {
  const keys = [normalizeDjName(dj.display_name), ...(aliasByDj.get(dj.id) ?? [])].filter(Boolean);
  for (const [handle, p] of profiles) {
    const full = norm(p.fullName);
    const user = normalizeDjName(handle);
    const bio = String(p.biography ?? "");
    const bioNorm = norm(bio);

    const hit = keys.some((k) => {
      if (k.length < 3) return false;
      // 바이오에 "DJ {이름}" 그대로 = 가장 강한 근거 (예: "DJ ZESTURE / CLUB BERMUDA MANAGER")
      if (bioNorm.includes("dj" + k)) return true;
      if (full === k || user === k) return true;
      return false;
    });
    if (!hit) continue;

    const isStrong =
      keys.some((k) => bioNorm.includes("dj" + k)) ||
      keys.some((k) => norm(p.fullName) === k) ||
      keys.some((k) => normalizeDjName(handle) === k);

    const row = {
      dj_id: dj.id,
      name: dj.display_name,
      handle,
      fullName: p.fullName ?? "",
      followers: p.followersCount ?? 0,
      bio: bio.replace(/\n/g, " / ").slice(0, 90),
    };
    (isStrong ? strong : weak).push(row);
    break;
  }
}

console.log("=== ✅ 확실 (자동 저장) ===");
strong.forEach((r) =>
  console.log(`  ${r.name.padEnd(18)} → @${r.handle}  (${r.fullName}, 팔로워 ${r.followers})\n     ${r.bio}`)
);
console.log("\n=== ⚠️ 의심 (수동 확인 필요) ===");
weak.forEach((r) =>
  console.log(`  ${r.name.padEnd(18)} → @${r.handle}  (${r.fullName}, 팔로워 ${r.followers})\n     ${r.bio}`)
);

if (!DRY_RUN) {
  for (const r of strong) {
    await sb.from("djs").update({ instagram: r.handle }).eq("id", r.dj_id);
  }
  console.log(`\n💾 ${strong.length}건 저장 완료`);
} else {
  console.log("\n(DRY RUN — 저장하지 않음)");
}

const { count } = await sb.from("djs").select("*", { count: "exact", head: true }).not("instagram", "is", null);
console.log(`DJ 인스타 보유: ${count} / ${(djs ?? []).length + count}명`);
