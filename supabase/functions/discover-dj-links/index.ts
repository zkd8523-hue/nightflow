/**
 * DJ 미리듣기 링크 자동 발굴 — 인스타 프로필 → 사운드클라우드/유튜브.
 *
 * 배경(2026-09-03):
 *   collect-club-events 는 캡션에서 DJ 이름과 @핸들까지만 저장하고 끝난다.
 *   그 핸들로 프로필을 열어 사클/유튜브를 찾는 일은 scripts/discover-dj-soundcloud*.mjs
 *   가 했는데 cron 에 없어 사람이 손으로 돌려야 했다. 마지막 실행이 8/30 이었고,
 *   그 뒤 새로 들어온 DJ 279명은 미리듣기가 영영 비어 있었다(실측).
 *
 *   수집이 매일 도는데 발굴만 수동이면 커버리지가 시간이 갈수록 떨어진다.
 *   카드뉴스가 "미리듣기 가능한 DJ"만 고르는 구조라 소재도 같이 마른다.
 *
 * 비용 통제(중요):
 *   Apify 프로필 조회는 건당 $0.0023 이다. links_checked_at(Migration 630)으로
 *   "이미 봤는데 없더라"를 기억해 재조회를 막는다. 이게 없으면 매일 278명을
 *   다시 조회해 월 $19 가 나간다 — 있으면 새로 생긴 DJ 만 보므로 월 $1 미만이다.
 *   MAX_PER_RUN 으로 1회 상한도 둔다(폭주 방지).
 *
 * 안전성:
 *   DJ 본인 인스타 → 본인이 걸어둔 주소만 쓴다. 이름 추측으로 만들지 않는다
 *   (WAVY→lurz 오연결 전례). 사클은 oEmbed 로 실존까지 확인한다.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;

/** 1회 실행 상한. 하루 새 DJ 는 보통 10~20명이라 넉넉하면서, 뭔가 잘못돼도
 *  피해가 $0.12 를 넘지 않는다. */
const MAX_PER_RUN = 50;
/** 못 찾은 DJ 를 다시 볼 때까지의 유예. 프로필은 자주 안 바뀌므로 길게 둔다. */
const RECHECK_DAYS = 90;
const CHUNK = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RESERVED = new Set([
  "pages", "discover", "stream", "upload", "you", "search", "tags",
  "people", "charts", "terms", "legal", "imprint", "jobs", "mobile", "oembed",
]);

/** 사클 프로필 핸들만 남긴다. 트랙 주소가 와도 프로필로 올린다. */
function toProfileUrl(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([A-Za-z0-9_-]+)/i.exec(String(raw).trim());
  if (!m) return null;
  const handle = m[1].toLowerCase();
  if (RESERVED.has(handle)) return null;
  return `https://soundcloud.com/${handle}`;
}

/** 채널 우선. 없으면 개별 영상도 받는다 — 자기 믹스 하나만 걸어두는 DJ 가 많다. */
function toYoutubeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const str = String(raw);
  const ch = /https?:\/\/(?:www\.|m\.)?youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)/i.exec(str);
  if (ch) return `https://www.youtube.com/${ch[1]}`;
  const v = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|live\/))([A-Za-z0-9_-]{11})/i.exec(str);
  if (v) return `https://www.youtube.com/watch?v=${v[1]}`;
  return null;
}

/** 인스타 externalUrls 의 lynx_url 은 추적 래퍼다 — 원본만 꺼낸다. */
function unwrapLynx(u: string | null): string | null {
  if (!u) return null;
  const m = /[?&]u=([^&]+)/.exec(u);
  if (!m) return u;
  try { return decodeURIComponent(m[1]); } catch { return u; }
}

/** on.soundcloud.com / soundcloud.app.goo.gl 은 302 를 따라가야 핸들이 나온다. */
async function resolveShort(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
    const loc = res.headers.get("location");
    if (loc) return toProfileUrl(loc);
    const res2 = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
    const html = await res2.text();
    const hit = /https:\/\/soundcloud\.com\/[A-Za-z0-9_-]+/i.exec(html);
    return hit ? toProfileUrl(hit[0]) : null;
  } catch { return null; }
}

/** 링크트리류 페이지를 한 단계 더 판다. 그냥 HTML fetch 라 비용 0원. */
async function digLinkPage(pageUrl: string): Promise<{ sc: string | null; yt: string | null } | null> {
  try {
    const res = await fetch(pageUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    let html = await res.text();
    html = html.replace(/\\\//g, "/"); // JSON 안에서는 슬래시가 이스케이프돼 있다
    const yt = toYoutubeUrl(/https?:\/\/(?:www\.|m\.)?youtube\.com\/[^\s"'<\\]+/i.exec(html)?.[0] ?? null);
    const direct = /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[A-Za-z0-9_-]+/i.exec(html);
    if (direct) return { sc: toProfileUrl(direct[0]), yt };
    const short = /https?:\/\/(?:on\.soundcloud\.com|soundcloud\.app\.goo\.gl)\/[A-Za-z0-9_-]+/i.exec(html);
    if (short) return { sc: await resolveShort(short[0]), yt };
    return { sc: null, yt };
  } catch { return null; }
}

/** oEmbed 로 실존 확인 — 없는 프로필을 저장하면 재생이 깨진다. */
async function verifySoundcloud(profileUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(profileUrl)}`, { signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch { return false; }
}

/**
 * Apify 호출.
 *
 * ⚠️ 실패를 삼키지 않는다. 전에는 try/catch 로 감싸 null 을 돌려줬는데, 그러면
 * 토큰 만료·크레딧 소진(401/402)이 "결과 0건"과 구분되지 않는다. 실제로
 * 2026-09-06 에 이 함수가 checked:0 을 HTTP 200 으로 돌려주면서 25명이 조용히
 * 건너뛰어졌고, 원인을 찾는 데 한참 걸렸다.
 *
 * scripts/discover-dj-soundcloud.mjs 는 같은 이유로 이미 던지도록 고쳐져 있었는데
 * (그 파일 39-58행 주석 참조) Edge Function 으로 옮기며 되살아난 회귀다.
 *
 * 호출부는 이 예외를 잡아 result.errors 에 남기고, 그 배치의 DJ 는
 * links_checked_at 을 찍지 않는다 — 안 본 것을 봤다고 기록하면 안 된다.
 */
async function apify(body: unknown): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) },
  );
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    const msg = (data as any)?.error?.message ?? JSON.stringify(data ?? {}).slice(0, 200);
    throw new Error(`Apify ${res.status}: ${msg}`);
  }
  return data;
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_PER_RUN), MAX_PER_RUN);

  // ── 대상: 라인업에 있고 · 인스타 있고 · 링크 둘 다 없고 · 최근에 안 본 DJ ──
  const cutoff = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("djs")
    .select("id, display_name, instagram, links_checked_at")
    .is("deleted_at", null)
    // 둘 다 없을 때만 대상. 하나라도 있으면 재생이 되므로 목적을 달성했다고 본다
    // (사용자 결정 2026-09-03). 유튜브만 있는 143명은 사클을 얻을 기회가 없지만,
    // 그건 의도된 절충이다 — 조회 104명분을 아끼는 쪽을 택했다.
    .is("soundcloud_url", null)
    .is("youtube_url", null)
    .not("instagram", "is", null)
    .eq("is_test", false)
    .or(`links_checked_at.is.null,links_checked_at.lt.${cutoff}`)
    .order("links_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  if (!candidates?.length) {
    return new Response(JSON.stringify({ ok: true, targets: 0, message: "채울 DJ 없음" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = {
    targets: candidates.length, soundcloud: 0, youtube: 0, checked: 0,
    not_found: 0, private: 0, linkpage_failed: 0, dry_run: dryRun,
    errors: [] as string[],
  };
  if (dryRun) {
    return new Response(JSON.stringify({ ...result, names: candidates.map((d) => d.display_name) }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const linkPages: { dj: any; page: string }[] = [];

  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    let rows: any[];
    try {
      rows = await apify({
        directUrls: slice.map((d) => `https://www.instagram.com/${d.instagram}/`),
        resultsType: "details",
        resultsLimit: 1,
      });
    } catch (e) {
      // 조회 자체가 실패했다 — 이 배치는 links_checked_at 을 찍지 않고 넘어간다.
      // 안 본 것을 봤다고 기록하면 90일간 재조회에서 빠진다(2026-08-30 사고).
      const msg = String((e as Error)?.message ?? e);
      result.errors.push(msg.slice(0, 200));
      console.error(`[discover-dj-links] Apify 실패, ${slice.length}명 건너뜀: ${msg}`);
      continue;
    }

    const byUser = new Map<string, any>();
    // Apify 가 error 를 돌려준 핸들. "계정이 없다"일 수도 있지만 rate-limit·일시적
    // fetch 실패도 같은 모양으로 온다 — 구분이 안 되므로 "못 봤다"로 취급한다.
    const errored = new Set<string>();
    for (const p of rows) {
      if (!p.username) continue;
      if (p.error) { result.not_found++; errored.add(String(p.username).toLowerCase()); continue; }
      byUser.set(String(p.username).toLowerCase(), p);
    }

    for (const dj of slice) {
      const p = byUser.get(String(dj.instagram).toLowerCase());

      // 비공개 계정은 "링크가 없다"가 아니라 "볼 수 없다"이다. stamp 를 찍으면
      // 90일간 재조회에서 빠지는데, 그 사이 공개로 바뀌어도 영영 못 본다.
      // 다음 실행에서 다시 시도하도록 아무것도 기록하지 않고 넘어간다.
      if (p?.private === true) {
        result.private++;
        continue;
      }

      // Apify 가 이 핸들에 error 를 준 경우도 stamp 하지 않는다. private 와 같은
      // 이유다 — 없는 계정인지 일시적 실패인지 알 수 없는데 "봤다"고 찍으면
      // 90일 잠긴다. Migration 632 가 되돌린 것이 바로 이 종류의 오염이다.
      if (errored.has(String(dj.instagram).toLowerCase())) continue;

      // 조회를 시도한 사실 자체를 남긴다 — 못 찾은 경우를 기억해야 재조회를 막는다.
      // 응답에 행 자체가 없는 경우(부분 잘림 등)는 "핸들 삭제"와 구분이 안 된다.
      // stamp 는 하되(무한 재조회 방지) 눈에 보이게 남긴다.
      if (!p) result.errors.push(`no apify row: ${dj.instagram}`);

      const patch: Record<string, unknown> = { links_checked_at: new Date().toISOString() };
      result.checked++;

      if (p) {
        const urls = [p.externalUrl, ...(p.externalUrls ?? []).map((u: any) => unwrapLynx(u?.lynx_url ?? u?.url ?? u))].filter(Boolean);
        const blob = [String(p.biography ?? ""), ...urls].join(" ");

        // 사클: 프로필 직접 → 단축링크 해제 순
        let sc: string | null = null;
        for (const u of [...urls, blob]) {
          sc = toProfileUrl(u) ?? toProfileUrl(/https?:\/\/[^\s]*soundcloud\.com\/[^\s]+/i.exec(String(u))?.[0] ?? null);
          if (sc) break;
        }
        if (!sc) {
          const short = /https?:\/\/(?:on\.soundcloud\.com|soundcloud\.app\.goo\.gl)\/[A-Za-z0-9_-]+/i.exec(blob);
          if (short) { sc = await resolveShort(short[0]); await sleep(200); }
        }
        if (sc && await verifySoundcloud(sc)) { patch.soundcloud_url = sc; result.soundcloud++; }

        // 유튜브: 같은 응답에 있으면 같이 챙긴다(추가 비용 0)
        const yt = toYoutubeUrl(urls.find((u: string) => toYoutubeUrl(u)) ?? null)
          ?? toYoutubeUrl(/https?:\/\/[^\s]*youtube\.com\/[^\s"']+/i.exec(blob)?.[0] ?? null);
        if (yt) { patch.youtube_url = yt; result.youtube++; }

        // 둘 다 못 찾았고 링크트리가 있으면 한 단계 더 (HTML fetch, 비용 0)
        if (!patch.soundcloud_url && !patch.youtube_url) {
          // linktree.com 도 받는다 — 공식 단축 도메인은 linktr.ee 지만 프로필에
          // 풀 도메인을 적어두는 사람이 있다(@kingmck 실측). 전에는 못 잡았다.
          const lt = /https?:\/\/(?:www\.)?(?:linktr\.ee|linktree\.com|bio\.link|lnk\.bio|campsite\.bio|taplink\.[a-z]+|litelink\.[a-z]+|url\.kr)\/[A-Za-z0-9_.\-]+/i.exec(blob);
          if (lt) {
            // 링크트리를 아직 안 봤다 — 여기서 stamp 하면 그 페이지 fetch 가
            // 실패했을 때 "봤는데 없더라"로 90일 잠긴다(@kingmck 시나리오 그대로).
            // 2차 패스에서 결과를 보고 그때 찍는다.
            delete patch.links_checked_at;
            result.checked--;
            linkPages.push({ dj, page: lt[0] });
          }
        }
      }

      // 링크트리 대기 중이면 patch 가 비어 있다 — 빈 update 왕복을 아낀다.
      if (Object.keys(patch).length) {
        const { error: upErr } = await supabase.from("djs").update(patch).eq("id", dj.id);
        if (upErr) result.errors.push(`update ${dj.display_name}: ${upErr.message}`);
      }
    }
    await sleep(500);
  }

  // ── 링크트리 파기 (Apify 를 더 쓰지 않는다 — 그냥 HTML fetch 라 비용 0) ──
  //
  // 첫 패스에서 이 DJ 들의 links_checked_at 은 일부러 미뤄 뒀다. 페이지를 못
  // 읽었는데 "봤다"고 찍으면 90일 잠기기 때문이다.
  for (const { dj, page } of linkPages) {
    const dug = await digLinkPage(page);
    await sleep(300);

    if (!dug) {
      // 페이지 fetch 실패(429·타임아웃 등) — 아직 안 본 것이다. stamp 하지 않아
      // 다음 실행에서 다시 시도한다.
      result.linkpage_failed++;
      continue;
    }

    const patch: Record<string, unknown> = { links_checked_at: new Date().toISOString() };
    result.checked++;
    if (dug.sc && await verifySoundcloud(dug.sc)) { patch.soundcloud_url = dug.sc; result.soundcloud++; }
    if (dug.yt) { patch.youtube_url = dug.yt; result.youtube++; }

    const { error: upErr } = await supabase.from("djs").update(patch).eq("id", dj.id);
    if (upErr) result.errors.push(`update ${dj.display_name}: ${upErr.message}`);
  }

  console.log(`[discover-dj-links] ${JSON.stringify(result)}`);
  return new Response(JSON.stringify(result, null, 2), { headers: { "Content-Type": "application/json" } });
});
