// 폼에 노출되는 메인 지역. 서울 그룹(강남·홍대·이태원) → 경기(수원) → 지방(부산·대구) 순서.
// 대구 함정 사례: 유저 A(23세) 대구 클럽 관심 → 폼에 대구 없음 → 이탈 확인 (2026-07-08).
// 수원 추가 (2026-07-09): 수원 클럽(피치라운지·클럽엔터) 등록 → MD 신청 지역에도 노출.
// 지방 도시(수원·부산·대구)는 MD 없어도 유저 등록 받은 후 그 지역 MD 영업 전략.
export const MAIN_AREAS = ["강남", "홍대", "이태원", "수원", "부산", "대구"] as const;
export type MainArea = (typeof MAIN_AREAS)[number];

export const OTHER_CITIES = ["인천", "광주", "대전", "울산", "세종"] as const;
export const ALL_AREAS = [...MAIN_AREAS, ...OTHER_CITIES] as const;

// ── 깃발 등록이 열린 지역 (단일 소스) ──
// 여기 없는 지역은 UI에서 자동으로 "준비중(Coming soon)"으로 잠김.
// 지역 온오프는 이 배열만 수정하면 됨 (폼 지역칩 / /en 홈 지역버튼 / 클럽상세 CTA 전부 참조).
// 이태원 오픈 (2026-07-08): MD 공급 없이 유저 등록 먼저 받는 전략.
// 수원 오픈 (2026-07-09): 국내 깃발/조각 선택 가능하게 준비중 해제.
export const OPEN_FLAG_AREAS = ["강남", "홍대", "이태원", "수원", "부산", "대구"] as const;
export const isFlagAreaOpen = (area: string): boolean =>
  (OPEN_FLAG_AREAS as readonly string[]).includes(area);
