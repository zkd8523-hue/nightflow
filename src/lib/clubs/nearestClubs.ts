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

/**
 * 지역 인증 없이 GPS 좌표 기준 전체 클럽에서 가까운 N개 (거리순).
 * LIVE 진입 시 즉시 위치 → 가까운 클럽 추천용. area 필터 없음.
 */
export async function fetchNearestClubsAnyArea(
  userLat: number,
  userLng: number,
  max = 10
): Promise<NearestClub[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, area, latitude, longitude")
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
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, max);
}

/**
 * 이름/별칭으로 클럽 검색 (LIVE 클럽 픽 — 가까운 순 목록에 없을 때 직접 검색).
 * 좌표가 있으면 거리도 함께 계산해 표시.
 */
export async function searchClubsByName(
  query: string,
  userLat?: number,
  userLng?: number,
  max = 20
): Promise<NearestClub[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, area, latitude, longitude")
    .eq("is_test", false)
    .ilike("name", `%${q}%`)
    .limit(max);

  if (error || !data) {
    console.error("[searchClubs] fetch error", error);
    return [];
  }

  return data.map((c) => {
    const lat = c.latitude as number | null;
    const lng = c.longitude as number | null;
    const hasCoords = lat != null && lng != null && userLat != null && userLng != null;
    return {
      id: c.id,
      name: c.name,
      area: c.area,
      latitude: lat ?? 0,
      longitude: lng ?? 0,
      distance_km: hasCoords ? distanceKm(userLat!, userLng!, lat!, lng!) : -1,
    };
  });
}
