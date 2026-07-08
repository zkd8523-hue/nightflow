// 폼에 노출되는 메인 지역. 서울 그룹(강남·홍대·이태원) → 지방(대구·부산) 순서.
// 이태원은 UI에서 disabled(Coming soon)이지만 서울 그룹으로 묶어 표시.
// 대구 함정 사례: 유저 A(23세) 대구 클럽 관심 → 폼에 대구 없음 → 이탈 확인 (2026-07-08).
// 지방 도시(대구·부산)는 MD 없어도 유저 등록 받은 후 그 지역 MD 영업 전략.
export const MAIN_AREAS = ["강남", "홍대", "이태원", "부산", "대구"] as const;
export type MainArea = (typeof MAIN_AREAS)[number];

export const OTHER_CITIES = ["인천", "광주", "대전", "울산", "세종"] as const;
export const ALL_AREAS = [...MAIN_AREAS, ...OTHER_CITIES] as const;
