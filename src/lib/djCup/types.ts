/** DJ 이상형 월드컵 — 후보 1명. 서버가 djs에서 뽑아 클라이언트로 그대로 넘기는 형태. */
export interface DjCupCandidate {
  id: string;
  display_name: string;
  slug: string;
  soundcloud_url: string | null;
  youtube_url: string | null;
  soundcloud_artwork_url: string | null;
}

export const ROUND_SIZES = [4, 8, 16, 32, 64, 128] as const;
export type RoundSize = (typeof ROUND_SIZES)[number];

export interface DjCupMatch {
  a: DjCupCandidate;
  b: DjCupCandidate;
}

/** 진행 중인 한 판의 대진 상태.
 *  current: 이번 라운드 참가자(셔플된 순서) / next: 이번 라운드 승자 누적.
 *  2의 거듭제곱만 다루므로 부전승 처리가 필요 없다. */
export interface DjCupBracketState {
  roundSize: RoundSize;
  current: DjCupCandidate[];
  next: DjCupCandidate[];
  matchIdx: number;
  winners: string[];
  losers: string[];
}

export interface DjCupSubmitResult {
  champion_rank: number;
  total_plays: number;
}

/**
 * next/image로 안전하게 렌더할 수 있는 아트워크 URL인지 판정한다.
 *
 * next.config.ts의 remotePatterns에 등록된 호스트는 i1.sndcdn.com 하나뿐이라,
 * 다른 호스트(사클 기본 이미지 soundcloud.com/images/fb_placeholder.png 등)를
 * <Image src>에 넘기면 렌더 시점에 예외가 던져지고 에러 바운더리가 페이지를
 * 통째로 덮는다 — onError로는 잡히지 않는다(실측: DJ컵에서 해당 DJ가 매치에
 * 나오는 순간 화면 전체가 회색 박스). 그래서 렌더 전에 호스트를 검증한다.
 */
export function usableDjArtwork(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https:\/\/i1\.sndcdn\.com\//i.test(url) ? url : null;
}
