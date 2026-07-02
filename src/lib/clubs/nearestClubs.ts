/**
 * GPS 좌표 → 인증 area 안의 가까운 클럽 1-3개 추천
 * LIVE 작성 시 클럽 선택 보조 (Migration 341 패턴)
 */

import { createClient } from "@/lib/supabase/client";
import { distanceKm, type VerifiableArea } from "@/lib/chat/areas";

/** Migration 341 트리거의 area 매핑과 일치 */
const AREA_CODE_TO_KR: Record<VerifiableArea, string> = {
  gangnam: "강남",
  hongdae: "홍대",
  itaewon: "이태원",
};

export interface NearestClub {
  id: string;
  name: string;
  area: string;
  distance_km: number;
  latitude: number;
  longitude: number;
}

/**
 * 인증된 area 안의 좌표 기준 가까운 클럽 N개 (default 5)
 * @param area  인증된 area 코드
 * @param userLat 사용자 위도
 * @param userLng 사용자 경도
 * @param max     최대 N개 (기본 5)
 * @param withinKm 반경 km (기본 1.5km)
 */
export async function fetchNearestClubs(
  area: VerifiableArea,
  userLat: number,
  userLng: number,
  max = 5,
  withinKm = 1.5
): Promise<NearestClub[]> {
  const supabase = createClient();
  const krArea = AREA_CODE_TO_KR[area];
  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, area, latitude, longitude")
    .eq("area", krArea)
    .eq("is_test", false)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error || !data) {
    console.error("[nearestClubs] fetch error", error);
    return [];
  }

  return data
    .map((c) => {
      const lat = c.latitude as number;
      const lng = c.longitude as number;
      return {
        id: c.id,
        name: c.name,
        area: c.area,
        latitude: lat,
        longitude: lng,
        distance_km: distanceKm(userLat, userLng, lat, lng),
      };
    })
    .filter((c) => c.distance_km <= withinKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, max);
}
