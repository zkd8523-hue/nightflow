/**
 * 클럽 구글 지도/리뷰 링크 생성 유틸.
 *
 * 배경: 외국인은 네이버보다 구글을 신뢰하고, 구글 리뷰는 사용자 언어로 자동 번역된다.
 * place_id를 따로 저장하지 않아도 클럽명 + 주소(또는 지역)로 구글맵 검색 URL을 만들면
 * 해당 장소 페이지로 연결되고, 리뷰는 한 탭 거리에서 번역되어 보인다.
 * → 외국인 오퍼 평가 화면에서 신뢰 확보용. MD 추가 입력/새 컬럼 0.
 */

/** getGoogleReviewsUrl에 필요한 최소 클럽 형태 (Club / ClubLite 모두 호환) */
export interface ClubLocationLike {
  name: string;
  address?: string | null;
  area?: string | null;
}

/**
 * 클럽의 구글맵 검색 URL 반환. 클럽명 + 주소(없으면 지역)로 장소를 특정한다.
 * 주소가 구체적일수록 정확한 장소로 바로 연결된다.
 *
 * @example
 *   getGoogleReviewsUrl({ name: "옥타곤", address: "서울 강남구 논현로...", area: "강남" })
 *   // → "https://www.google.com/maps/search/?api=1&query=옥타곤%20서울%20강남구%20논현로..."
 */
// 앱 언어(Lang) → 구글 hl 파라미터 (UI·리뷰 자동번역 언어)
const HL_BY_LANG: Record<string, string> = { en: "en", ja: "ja", zh: "zh-CN" };

export function getGoogleReviewsUrl(club: ClubLocationLike, lang?: string): string {
  // 클럽명 + (주소 우선, 없으면 지역) — 동명 클럽 혼동을 줄이기 위해 위치 정보 동반
  const locationHint = club.address?.trim() || club.area?.trim() || "";
  const query = [club.name.trim(), locationHint]
    .filter(Boolean)
    .join(" ")
    .trim();

  const hl = lang ? HL_BY_LANG[lang] : undefined;
  const hlParam = hl ? `&hl=${hl}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${hlParam}`;
}
