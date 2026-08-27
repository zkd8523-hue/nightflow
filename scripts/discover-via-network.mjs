/**
 * 확보된 DJ 인스타 계정들의 "팔로잉 네트워크"에서 미확보 DJ를 찾는다.
 *
 * 왜 이 방법인가 (docs/INSTAGRAM_ENRICHMENT_GUIDE.md 3번):
 *   DJ는 무작위가 아니라 같은 클럽·같은 씬끼리 서로 팔로우한다. 클럽 계정
 *   팔로잉(discover-dj-instagram.mjs)으로 못 찾은 인원도, 이미 확보된 DJ의
 *   팔로잉에는 있을 수 있다. 시드를 "아무 확보 인원"이 아니라 "같은 레지던트
 *   클럽 소속 확보 인원"으로 좁혀야 오연결이 줄어든다.
 *
 * 판정 기준은 discover-dj-instagram.mjs와 동일 (strong/weak).
 * 추가 안전장치: 이름에 공백이 2개 이상이거나 명백히 사람이 아닌 통칭
 *   (클럽명·이벤트명 오파싱)으로 의심되면 애초에 대상에서 제외한다 —
 *   TECHNO IN HANGANG이 MUV 계정에 바이오 부분일치로 오연결된 전례가 있다.
 *
 * 사용: DRY_RUN=1 node scripts/discover-via-network.mjs
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
function normalizeDjName(raw) {
  const s = norm(raw);
  const a = s.startsWith("dj") ? s.slice(2) : s;
  const b = a.endsWith("dj") ? a.slice(0, -2) : a;
  return b || s;
}

/** 사람 이름이 아닐 가능성이 높은 것들 제외 (클럽/이벤트명 오파싱 방지) */
function looksLikePerson(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 3) return false; // "TECHNO IN HANGANG" 같은 3단어 이상
  if (/^(RESIDENTS?|WHO'?S NEXT\??|GUEST|VARIOUS|TBA|LINEUP)$/i.test(name.trim())) return false;
  return true;
}

async function apify(actor, body) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

// ── 1) 시드: 레지던트 클럽이 있는 확보 DJ 우선, 없으면 전체 확보 DJ ──────
const { data: allDjs } = await sb.from("djs").select("id, display_name, instagram, resident_club_id").is("deleted_at", null);
const seeds = (allDjs ?? []).filter((d) => d.instagram);
const missingDjs = (allDjs ?? []).filter((d) => !d.instagram && looksLikePerson(d.display_name));
const skipped = (allDjs ?? []).filter((d) => !d.instagram && !looksLikePerson(d.display_name));

console.log(`🌱 시드 DJ ${seeds.length}명 (팔로잉 네트워크 조회 대상)`);
console.log(`🎯 탐색 대상 미확보 DJ ${missingDjs.length}명 (사람 아닌 것으로 판단해 제외: ${skipped.length}명)`);
if (skipped.length) console.log(`   제외: ${skipped.map((d) => d.display_name).join(", ")}`);
console.log("");

// ── 2) 팔로잉 수집 (시드 계정마다) ───────────────────────────────────
const followings = [];
const seedHandles = [...new Set(seeds.map((s) => s.instagram))];
for (const h of seedHandles) {
  const rows = await apify("dead00~instagram-followers-following-scraper-no-cookies", {
    usernames: [h],
    dataToScrape: "Followings",
    maxResultsPerUser: 80,
  });
  const ok = rows.filter((r) => r.username);
  console.log(`  @${h} → 팔로잉 ${ok.length}개`);
  followings.push(...ok);
}
console.log(`\n📦 팔로잉 총 ${followings.length}건 수집 (중복 포함)\n`);

// ── 3) 별칭 ───────────────────────────────────────────────────────────
const { data: aliases } = await sb.from("dj_aliases").select("dj_id, normalized");
const aliasByDj = new Map();
for (const a of aliases ?? []) {
  if (!aliasByDj.has(a.dj_id)) aliasByDj.set(a.dj_id, []);
  aliasByDj.get(a.dj_id).push(a.normalized);
}

// ── 4) 후보 프로필 상세 조회 ─────────────────────────────────────────
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

for (const dj of missingDjs) {
  const keys = [normalizeDjName(dj.display_name), ...(aliasByDj.get(dj.id) ?? [])].filter((k) => k && k.length >= 3);
  if (!keys.length) continue;

  for (const [handle, p] of profiles) {
    const full = norm(p.fullName);
    const user = normalizeDjName(handle);
    const bio = String(p.biography ?? "");
    const bioNorm = norm(bio);

    // 정확 일치 = 가장 강한 근거. 바이오 부분일치는 "DJ {이름}" 형태로만 인정하되
    // 짧은 키(4자 미만)는 다른 단어에 우연히 포함될 위험이 커서 정확 일치만 허용.
    const exactHit = keys.some((k) => full === k || user === k);
    const bioHit = keys.some((k) => k.length >= 4 && bioNorm.includes("dj" + k));
    if (!exactHit && !bioHit) continue;

    const row = {
      dj_id: dj.id,
      name: dj.display_name,
      handle,
      fullName: p.fullName ?? "",
      followers: p.followersCount ?? 0,
      bio: bio.replace(/\n/g, " / ").slice(0, 90),
    };
    (exactHit || bioHit ? strong : weak).push(row);
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
    await sb.from("djs").update({ instagram: r.handle }).eq("id", r.dj_id).is("instagram", null);
  }
  console.log(`\n💾 ${strong.length}건 저장 완료`);
} else {
  console.log("\n(DRY RUN — 저장하지 않음)");
}

const { count } = await sb.from("djs").select("*", { count: "exact", head: true }).not("instagram", "is", null);
const { count: totalCount } = await sb.from("djs").select("*", { count: "exact", head: true }).is("deleted_at", null);
console.log(`DJ 인스타 보유: ${count} / ${totalCount}명`);
