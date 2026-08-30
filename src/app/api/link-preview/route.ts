import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { normalizeUrl } from "@/lib/chat/linkPreview";
import { urlHash } from "@/lib/chat/linkPreview.server";

/**
 * 링크 OG 미리보기 API
 * 요청: POST /api/link-preview  본문: { url: "https://..." }
 * 응답: { preview: { url, title, description, image_url, site_name } | null }
 *
 * 캐시: link_previews 테이블 (URL 단위 공용). 실패도 기록해 재시도 폭주 방지.
 *
 * ⚠️ 유저가 채팅에 붙인 임의 URL을 서버가 대신 요청하므로 SSRF 방어 필수:
 *   - http/https 만 허용
 *   - DNS 해석 후 사설/루프백 IP 대역 차단
 *   - 리다이렉트 수동 추적(최대 3회) + 각 홉마다 IP 재검사
 *   - 응답 크기·시간 상한
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024; // OG 메타는 <head>에 있으므로 512KB면 충분
const MAX_REDIRECTS = 3;
// 실패한 URL 재시도 간격 — 그 전엔 캐시된 실패를 그대로 반환
const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;

/** 사설·내부 대역인지 검사 (SSRF 차단) */
function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true; // 10/8
    if (p[0] === 127) return true; // 루프백
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // 링크로컬(=클라우드 메타데이터 169.254.169.254)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true; // 192.168/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // 멀티캐스트/예약
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // 링크로컬
    // IPv4-mapped (::ffff:10.0.0.1) 는 내부 v4 검사로 위임
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // 해석 불가 → 차단
}

/** 호스트가 안전한 공인 주소로 해석되는지 확인 */
async function assertPublicHost(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isBlockedAddress(bare)) throw new Error("blocked address");
    return;
  }
  if (/^localhost$/i.test(bare) || /\.local$|\.internal$/i.test(bare)) {
    throw new Error("blocked host");
  }
  const records = await lookup(bare, { all: true });
  if (records.length === 0) throw new Error("dns empty");
  for (const r of records) {
    if (isBlockedAddress(r.address)) throw new Error("blocked address");
  }
}

interface OgMeta {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // amp는 마지막 (이중 디코딩 방지)
}

/** <meta> 태그에서 OG/트위터/기본 메타 추출 — property·name 속성 순서 무관 */
function parseOg(html: string, baseUrl: string): OgMeta {
  const head = html.slice(0, 200_000);
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
        "i"
      );
      const tag = head.match(re)?.[0];
      if (!tag) continue;
      const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i)?.[1];
      if (content && content.trim()) return decodeEntities(content.trim());
    }
    return null;
  };

  let title = pick(["og:title", "twitter:title"]);
  if (!title) {
    const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (t && t.trim()) title = decodeEntities(t.trim());
  }

  let image = pick(["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  if (image) {
    try {
      // 상대경로 이미지를 절대 URL로
      image = new URL(image, baseUrl).toString();
      if (!/^https?:$/.test(new URL(image).protocol)) image = null;
    } catch {
      image = null;
    }
  }

  return {
    title: title ? title.slice(0, 300) : null,
    description: (pick(["og:description", "twitter:description", "description"]) ?? "").slice(0, 500) || null,
    image_url: image,
    site_name: pick(["og:site_name"])?.slice(0, 100) ?? null,
  };
}

/** SSRF 안전 fetch — 리다이렉트를 직접 따라가며 매 홉 IP 검사 */
async function safeFetchHtml(
  startUrl: string
): Promise<{ html: string; finalUrl: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // 봇 차단 사이트 대응 + OG 태그를 주는 크롤러 UA
          "User-Agent":
            "Mozilla/5.0 (compatible; NightFlowBot/1.0; +https://nightflow.kr)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) return null;

    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ctype)) return null;

    // 크기 상한 — 큰 페이지는 앞부분만 읽고 끊는다
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});

    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, total - off)), off);
      off += c.length;
      if (off >= total) break;
    }

    // charset 대응 (한국 사이트에 euc-kr 잔존)
    const charset = ctype.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
    let html: string;
    try {
      html = new TextDecoder(charset && charset !== "utf-8" ? charset : "utf-8").decode(buf);
    } catch {
      html = new TextDecoder("utf-8").decode(buf);
    }
    return { html, finalUrl: current };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const normalized = normalizeUrl(url);
    if (!normalized) {
      return NextResponse.json({ preview: null });
    }
    const hash = urlHash(normalized);

    const supabase = createAdminClient();
    const { data: cached } = await supabase
      .from("link_previews")
      .select("url, title, description, image_url, site_name, fetch_failed, updated_at")
      .eq("url_hash", hash)
      .maybeSingle();

    if (cached) {
      const stale =
        cached.fetch_failed &&
        Date.now() - new Date(cached.updated_at).getTime() > RETRY_FAILED_AFTER_MS;
      if (!stale) {
        return NextResponse.json({
          preview: cached.fetch_failed ? null : cached,
        });
      }
    }

    let meta: OgMeta | null = null;
    try {
      const fetched = await safeFetchHtml(normalized);
      if (fetched) meta = parseOg(fetched.html, fetched.finalUrl);
    } catch (e) {
      // 차단된 주소·타임아웃 등 — 실패로 기록만 하고 조용히 넘어간다
      logger.warn("link-preview fetch failed:", (e as Error).message);
    }

    // 제목도 이미지도 없으면 카드로서 의미 없음 → 실패 취급
    const usable = meta && (meta.title || meta.image_url);

    await supabase.from("link_previews").upsert(
      {
        url_hash: hash,
        url: normalized,
        title: usable ? meta!.title : null,
        description: usable ? meta!.description : null,
        image_url: usable ? meta!.image_url : null,
        site_name: usable ? meta!.site_name : null,
        fetch_failed: !usable,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url_hash" }
    );

    return NextResponse.json({
      preview: usable
        ? { url: normalized, ...meta }
        : null,
    });
  } catch (e) {
    logger.error("link-preview error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
