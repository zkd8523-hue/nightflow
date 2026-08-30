/**
 * 링크 미리보기 공용 헬퍼 — URL 정규화
 * 클라이언트/서버 양쪽에서 쓰이므로 node 전용 모듈(crypto 등) 금지.
 * 해시 계산은 서버 전용(linkPreview.server.ts)에 둔다.
 */

/** 미리보기 대상 URL 정규화. 불가하면 null.
 *  - www. 로 시작하면 https:// 부착
 *  - 추적 파라미터(utm_* 등) 제거 → 같은 링크가 다른 캐시로 갈라지는 것 방지
 *  - fragment 제거
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".")) return null;

    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "igshid"].includes(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}
