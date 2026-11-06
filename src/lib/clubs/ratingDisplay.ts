// 외국어 화면의 구글 평점·리뷰 노출 기준(2026-11-06, 운영자 결정).
// 클럽 상세 페이지의 기존 기준(평점 4.0 이상만 별점, 리뷰도 4점 이상만)을 목록·패널·가격표에도 똑같이 쓴다.
// 화면마다 달라서 상세에선 숨긴 낮은 평점·리뷰가 카드를 누른 패널에는 그대로 보였다.
// 특정 클럽 예외를 두지 않는다. 구글 원문은 "구글에서 리뷰 보기" 링크로 누구나 볼 수 있게 둔다.

export const MIN_SHOWN_RATING = 4;

export const isRatingShown = (rating: number | null | undefined): rating is number =>
  rating != null && rating >= MIN_SHOWN_RATING;

export function shownReviews<T extends { rating?: number | null }>(reviews: T[] | null | undefined): T[] {
  return (reviews ?? []).filter((r) => (r.rating ?? 0) >= MIN_SHOWN_RATING);
}
