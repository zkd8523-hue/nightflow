// media_url(만료되는 IG CDN URL)을 서버에서 fetch해 Supabase Storage에 옮긴다.
//
// src/lib/utils/upload.ts 는 브라우저 Canvas API를 쓰므로 Deno(서버)에서 재사용할
// 수 없다 — 이게 이 프로젝트에 없던 "서버사이드 이미지 저장" 인프라를 새로 채우는 부분.
//
// 순서가 중요하다: media_url 은 IG CDN의 서명 URL이라 만료된다. Vision 호출보다
// 먼저 이 함수로 Storage에 옮기고, Vision에는 Storage의 public URL을 넘겨야 한다.
// 반대로 하면 검토 큐에서 며칠 뒤 열었을 때 포스터 이미지가 깨져 있다.
//
// 실패 시 null을 반환한다 — 포스터 저장 실패가 draft 생성을 막으면 안 된다.
// 포스터는 감사용 첨부일 뿐이고, 파싱된 라인업 데이터가 본체다.

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 8_000_000;

// 실제 사고(2026-08-27): 이 fetch에 타임아웃이 없어서 IG CDN 하나가 응답 없이
// 연결만 물고 있자 워커 전체가 영원히 멈췄다. catch(){return null} 이 있어도
// await가 안 풀리면 그 코드에 도달할 기회 자체가 없다 — 25분 예산 로직도
// runCollection() 안의 반복문 사이에서만 체크하므로 이 한 줄에 걸리면 못 빠져나온다.
// 결과: collection_runs 에 실행 기록조차 안 남고 함수가 그대로 죽는다.
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export async function fetchImageToStorage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  mediaUrl: string,
  bucket: string,
  path: string
): Promise<string | null> {
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, new Uint8Array(buf), { contentType, upsert: false });
    if (error) return null;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

/** permalink 를 파일명 안전한 짧은 해시로 변환 (경로 충돌·특수문자 방지). */
export async function permalinkHash(permalink: string): Promise<string> {
  const data = new TextEncoder().encode(permalink);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
