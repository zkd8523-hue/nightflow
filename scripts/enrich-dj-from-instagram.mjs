/**
 * DJ·아티스트 정보를 인스타 프로필에서 채운다 — 사진 · 소개 · 사운드클라우드 링크.
 *
 * 왜 이 방법인가 (2026-10-05 실측으로 다른 길을 전부 닫고 남은 것):
 *   - MusicBrainz: 매칭률 **7%**. 겉보기 80% 는 전부 동명이인이었다
 *     (JASON→Jason Graves, THEO→Theo Parrish, PEBBLE→Pebble[벨기에]).
 *     클럽 레귤러 DJ 는 국제 음악 DB 에 없다.
 *   - 사운드클라우드 주소 추측(match-dj-soundcloud.mjs): 규칙을 세 번 고쳤지만
 *     @aster_djofficial → /aster("Laster", 다른 사람)를 못 걸렀다. oEmbed 는
 *     계정 제목이 주소 복창이거나 프로필 사진이 기본 이미지라 본인 확인이 불가능하다.
 *   - **인스타 프로필의 externalUrl 은 본인이 직접 적어둔 링크다.** 추측이 아니다.
 *     그리고 같은 호출로 사진·소개까지 온다 — 지금 둘 다 0% 다.
 *
 * ⚠️ 유료 호출이다(Apify). 이번 주 출연자 32명이면 약 $0.08.
 *    범위를 안 좁히면 1,500명이 되니 WEEK=1 을 기본으로 쓴다.
 *
 * ⚠️ 인스타 CDN 이미지 URL 은 서명에 만료시각이 박혀 있어 시간이 지나면 403 이 된다.
 *    뉴스레터에 핫링크하면 나중에 전부 깨지므로 **Supabase Storage 에 복사 저장**한다.
 *
 * 개인정보: 공개 프로필만 읽고, 연락처성 정보는 저장하지 않는다.
 *
 * 사용:
 *   DRY_RUN=1 WEEK=1 node scripts/enrich-dj-from-instagram.mjs   # 비용 0, 대상만 확인
 *   WEEK=1 node scripts/enrich-dj-from-instagram.mjs
 *   LIMIT=10 node scripts/enrich-dj-from-instagram.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const WEEK_ONLY = process.env.WEEK === "1";
const LIMIT = Number(process.env.LIMIT || 0);

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APIFY = env.APIFY_API_TOKEN;
if (!APIFY && !DRY_RUN) { console.log("❌ APIFY_API_TOKEN 이 없습니다"); process.exit(1); }

const BUCKET = "dj-photos";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** bio 와 외부링크에서 음악 링크를 캐낸다. 본인이 적은 것만 쓴다. */
function musicLinks(profile) {
  const pool = [
    profile.externalUrl, profile.external_url,
    ...(profile.bioLinks ?? []).map((b) => b?.url),
    profile.biography,
  ].filter(Boolean).join(" ");
  const sc = pool.match(/soundcloud\.com\/([A-Za-z0-9_\-.]+)/i);
  const yt = pool.match(/(?:youtube\.com\/(?:@|channel\/|c\/)|youtu\.be\/)([A-Za-z0-9_\-.]+)/i);
  const mx = pool.match(/mixcloud\.com\/([A-Za-z0-9_\-.]+)/i);
  return {
    soundcloud: sc ? `https://soundcloud.com/${sc[1]}` : null,
    youtube: yt ? (pool.match(/https?:\/\/[^\s"']*(?:youtube\.com|youtu\.be)[^\s"']*/i)?.[0] ?? null) : null,
    mixcloud: mx ? `https://mixcloud.com/${mx[1]}` : null,
  };
}

// ── 대상 추리기 ───────────────────────────────────────────────────────────
let ids = null;
if (WEEK_ONLY) {
  // 기본은 **다음 주**다. 뉴스레터는 목요일에 다음 주 밤을 알리는 물건이라,
  // 지난주 출연자를 채워봐야 실리지 않는다(2026-10-05 실측: 지난주 25명을 채웠는데
  // 이번 호 54명과 6명만 겹쳤다). FROM/TO 로 명시해 덮어쓸 수 있다.
  const t = new Date();
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) + (process.env.FROM ? 0 : 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  if (process.env.FROM) mon.setTime(Date.parse(process.env.FROM));
  if (process.env.TO) sun.setTime(Date.parse(process.env.TO));
  const { data: cl } = await sb.from("club_lineups").select("id")
    .gte("event_date", mon.toISOString().slice(0, 10))
    .lte("event_date", sun.toISOString().slice(0, 10));
  const { data: st } = await sb.from("lineup_sets").select("dj_id").in("lineup_id", (cl ?? []).map((x) => x.id));
  ids = [...new Set((st ?? []).map((s) => s.dj_id).filter(Boolean))];
  console.log(`이번 주(${mon.toISOString().slice(5, 10)}~${sun.toISOString().slice(5, 10)}) 출연 DJ ${ids.length}명`);
}

let q = sb.from("djs").select("id,display_name,instagram,photo_url,bio,soundcloud_url,youtube_url")
  .not("instagram", "is", null).is("deleted_at", null);
if (ids) q = q.in("id", ids);
let { data: djs, error } = await q;
if (error) { console.log("❌", error.message); process.exit(1); }

// 사진·소개·미리듣기가 **하나라도** 빈 사람만. 다 찬 사람은 건드리지 않는다.
djs = djs.filter((d) => !d.photo_url || !d.bio || (!d.soundcloud_url && !d.youtube_url));
if (LIMIT) djs = djs.slice(0, LIMIT);

const cost = (djs.length * 0.0026).toFixed(3);
console.log(`대상 ${djs.length}명 · 예상 비용 약 $${cost}\n`);
if (!djs.length) { console.log("채울 것이 없습니다"); process.exit(0); }

if (DRY_RUN) {
  for (const d of djs) {
    const need = [!d.photo_url && "사진", !d.bio && "소개",
      (!d.soundcloud_url && !d.youtube_url) && "미리듣기"].filter(Boolean).join("·");
    console.log(`  @${String(d.instagram).padEnd(22)} ${String(d.display_name).padEnd(18)} 필요: ${need}`);
  }
  console.log(`\n[DRY RUN] 호출하지 않았습니다 (비용 0)`);
  process.exit(0);
}

// ── Apify 프로필 조회 ─────────────────────────────────────────────────────
const handles = djs.map((d) => String(d.instagram).replace(/^@/, ""));
console.log(`Apify 프로필 조회 ${handles.length}건…`);

const run = await fetch(
  `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: handles }),
    signal: AbortSignal.timeout(300_000),
  }
);
if (!run.ok) { console.log(`❌ Apify HTTP ${run.status}: ${(await run.text()).slice(0, 200)}`); process.exit(1); }
const items = await run.json();
console.log(`응답 ${Array.isArray(items) ? items.length : 0}건\n`);

const byHandle = new Map();
for (const it of items ?? []) {
  const u = (it.username || it.userName || "").toLowerCase();
  if (u) byHandle.set(u, it);
}

let okPhoto = 0, okBio = 0, okLink = 0, failed = 0;
for (const d of djs) {
  const h = String(d.instagram).replace(/^@/, "").toLowerCase();
  const p = byHandle.get(h);
  if (!p) { failed++; continue; }

  const patch = {};

  // 소개 — 공개 프로필의 bio 를 그대로. 연락처성 줄은 버린다.
  if (!d.bio && p.biography) {
    const clean = String(p.biography)
      .split("\n")
      .filter((l) => !/\b(01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|kakao|문의|예약)\b/i.test(l))
      .join(" ").replace(/\s+/g, " ").trim();
    if (clean) { patch.bio = clean.slice(0, 500); okBio++; }
  }

  // 음악 링크 — 본인이 적어둔 것만
  const L = musicLinks(p);
  if (!d.soundcloud_url && L.soundcloud) { patch.soundcloud_url = L.soundcloud; okLink++; }
  if (!d.youtube_url && L.youtube) { patch.youtube_url = L.youtube; }

  // 사진 — CDN URL 은 만료되므로 Storage 에 복사한다
  const pic = p.profilePicUrlHD || p.profilePicUrl;
  if (!d.photo_url && pic) {
    try {
      const img = await fetch(pic, { signal: AbortSignal.timeout(20_000) });
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        const path = `${d.id}.jpg`;
        const { error: upErr } = await sb.storage.from(BUCKET)
          .upload(path, buf, { contentType: "image/jpeg", upsert: true });
        if (!upErr) {
          const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
          patch.photo_url = pub.publicUrl; okPhoto++;
        } else if (/not found/i.test(upErr.message)) {
          console.log(`  ⚠️ 버킷 '${BUCKET}' 이 없습니다 — Storage 에서 먼저 만들어 주세요`);
        }
      }
    } catch { /* 사진 하나 실패로 나머지를 막지 않는다 */ }
  }

  if (Object.keys(patch).length) {
    const { error: e } = await sb.from("djs").update(patch).eq("id", d.id);
    if (e) console.log(`  ❌ ${d.display_name}: ${e.message}`);
    else console.log(`  ✓ ${String(d.display_name).padEnd(18)} ${Object.keys(patch).join(", ")}`);
  }
  await sleep(120);
}

console.log(`\n사진 ${okPhoto} · 소개 ${okBio} · 음악링크 ${okLink} · 응답없음 ${failed}`);
console.log(`실제 비용은 Apify 콘솔에서 확인하세요 (예상 $${cost})`);
