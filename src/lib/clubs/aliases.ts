// 클럽별 검색 별칭 (SEO 최적화용)
// 사람들이 실제로 부르는 변형 이름을 메타데이터·JSON-LD에 노출하기 위한 매핑.
// 키는 clubs.id (UUID).
export const CLUB_ALIASES: Record<string, string[]> = {
  // 홍대 CLUB BERMUDA
  "285ed0d2-983f-49da-8873-f3d00a165d88": [
    "버뮤다",
    "클럽 버뮤다",
    "홍대 버뮤다",
  ],
  // 강남 Club ACE (구 레이스)
  "e2e6e10a-e574-472c-af49-6380a05032ee": [
    "Club ACE",
    "ACE",
    "에이스",
    "강남 ACE",
    "강남 에이스",
    "레이스",
    "강남 레이스",
  ],
  // 강남 DM 라운지
  "14ed8351-1117-4210-b289-eec759bd9b07": ["DM", "디엠", "디엠라운지"],
  // 강남 아르쥬 청담 라운지
  "c6e747de-140f-4a76-857d-6ed51d09b217": ["아르쥬", "청담 아르쥬"],
  // 강남 컬러 압구
  "80ba0738-ffbb-4463-b97e-7e68e4c0da60": ["컬러", "압구정 컬러"],
  // 강남 HYPE SEOUL
  "67b2286c-63e9-46a1-bb90-e9ca4ccf6fae": ["하잎서울", "하잎 서울", "하잎"],
  // 광주 VEIL CLUB
  "bb929c21-bd6d-4766-85c6-2b51452058da": ["베일", "베일 클럽", "광주 베일", "광주 VEIL"],
  // 강남 플팔
  "6a19815e-c22b-4bc5-8bb5-dd84b872a7b4": ["Plus82", "플러스82"],
  // 홍대 OCEAN
  "bd820f57-46b6-4d95-822a-4f0cf8e84542": ["오션", "홍대 오션"],
  // 부산 그루브&스팟
  "0d24b754-6c1d-40f6-badd-b398d03a4b3f": ["그루브", "스팟", "부산 그루브"],
};

export function getClubAliases(clubId: string): string[] {
  return CLUB_ALIASES[clubId] ?? [];
}
