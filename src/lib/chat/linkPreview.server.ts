import { createHash } from "crypto";

/** 정규화된 URL → sha256 hex (link_previews.url_hash) — 서버 전용 */
export function urlHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}
