/**
 * 채팅방 지역 정의 + GPS 좌표 → 지역 코드 판정
 *
 * - 좌표는 서버에 저장하지 않음. 클라이언트에서 판정만 함.
 * - 강남/홍대/이태원 반경 안이면 해당 지역, 아니면 null (지원 지역 외)
 */

export type ChatRoomCode = "all" | "gangnam" | "hongdae" | "itaewon";
export type VerifiableArea = Exclude<ChatRoomCode, "all">;

export const CHAT_ROOMS: { code: ChatRoomCode; label: string }[] = [
  { code: "all", label: "전체" },
  { code: "gangnam", label: "강남" },
  { code: "hongdae", label: "홍대" },
  { code: "itaewon", label: "이태원" },
];

export const VERIFIABLE_AREAS: { code: VerifiableArea; label: string; lat: number; lng: number; radiusKm: number }[] = [
  { code: "gangnam", label: "강남", lat: 37.4979, lng: 127.0276, radiusKm: 1.5 },
  { code: "hongdae", label: "홍대", lat: 37.5563, lng: 126.9236, radiusKm: 1.5 },
  { code: "itaewon", label: "이태원", lat: 37.5340, lng: 126.9944, radiusKm: 1.2 },
];

export const ROOM_LABEL: Record<ChatRoomCode, string> = Object.fromEntries(
  CHAT_ROOMS.map((r) => [r.code, r.label])
) as Record<ChatRoomCode, string>;

/** 두 좌표 간 거리 (km, Haversine) */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * GPS 좌표 → 지역 코드
 * 강남/홍대/이태원 반경 안이면 해당 코드, 아니면 null (지원 지역 외)
 */
export function detectArea(lat: number, lng: number): VerifiableArea | null {
  for (const a of VERIFIABLE_AREAS) {
    if (distanceKm(lat, lng, a.lat, a.lng) <= a.radiusKm) {
      return a.code;
    }
  }
  return null;
}

/** 인증 유효시간: 2시간 */
export const AREA_VERIFICATION_TTL_HOURS = 2;
export const AREA_VERIFICATION_TTL_MS =
  AREA_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;

/** 만료 N분 전부터 자동 갱신 시도 */
export const AREA_AUTO_REFRESH_BEFORE_MS = 10 * 60 * 1000;
