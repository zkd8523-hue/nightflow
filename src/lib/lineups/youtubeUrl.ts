/** 유튜브 주소에서 영상 ID만 뽑는다. 채널 주소(@handle, /channel/…)면 null —
 *  채널은 임베드가 막혀 있어(실측: 200이지만 unavailable) 재생할 수 없다.
 *  DjPreviewButton(클라이언트)과 dj-cup 후보 필터(서버) 양쪽에서 쓰므로
 *  "use client" 경계가 없는 순수 유틸로 둔다 — 클라 전용 파일에서 이 함수만
 *  가져오면 서버 컴포넌트 번들에 useState/useEffect까지 딸려 들어가 500이 난다. */
export function youtubeVideoId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/i.exec(
    raw
  );
  return m ? m[1] : null;
}
