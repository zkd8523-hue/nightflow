/**
 * 채팅방 지역 정의 + GPS 좌표 → 지역 코드 판정
 *
 * - 좌표는 서버에 저장하지 않음. 클라이언트에서 판정만 함.
 * - 강남/홍대/이태원 반경 안이면 해당 지역, 아니면 null (지원 지역 외)
 */

/** 광역 채팅방 코드 (Migration 421) */
export type ChatRegionCode = "sudogwon" | "gyeongsang" | "jeolla";
/** 레거시 코드(기존 데이터/LIVE GPS 인증)까지 포함한 전체 room 코드 */
export type ChatRoomCode = ChatRegionCode | "all" | "gangnam" | "hongdae" | "itaewon";
/** LIVE GPS 인증 지역 (채팅방과 별개 — 클럽 픽 근접용) */
export type VerifiableArea = "gangnam" | "hongdae" | "itaewon";

/**
 * 채팅 탭 목록 — 전국 광역 3방 (Migration 421).
 * 인증 없이 누구나 읽기/쓰기. 클럽이 있는 지역을 광역으로 묶음.
 *   수도권 = 강남·홍대·이태원 / 경상권 = 부산·대구 / 전라권 = 광주
 */
export const CHAT_ROOMS: { code: ChatRegionCode; label: string }[] = [
  { code: "sudogwon", label: "수도권" },
  { code: "gyeongsang", label: "경상권" },
  { code: "jeolla", label: "전라권" },
];

/** 기본 방 (클럽 최다 지역) */
export const DEFAULT_CHAT_ROOM: ChatRegionCode = "sudogwon";

/** 클럽 area(한글) → 광역 채팅방 매핑. 미매핑 지역은 수도권 폴백. */
export const AREA_TO_REGION: Record<string, ChatRegionCode> = {
  강남: "sudogwon",
  홍대: "sudogwon",
  이태원: "sudogwon",
  서울: "sudogwon",
  경기: "sudogwon",
  인천: "sudogwon",
  부산: "gyeongsang",
  대구: "gyeongsang",
  울산: "gyeongsang",
  경북: "gyeongsang",
  경남: "gyeongsang",
  광주: "jeolla",
  전북: "jeolla",
  전남: "jeolla",
};

export function areaToRegion(area: string | null | undefined): ChatRegionCode {
  if (!area) return DEFAULT_CHAT_ROOM;
  return AREA_TO_REGION[area] ?? DEFAULT_CHAT_ROOM;
}

export const VERIFIABLE_AREAS: { code: VerifiableArea; label: string; lat: number; lng: number; radiusKm: number }[] = [
  { code: "gangnam", label: "강남", lat: 37.4979, lng: 127.0276, radiusKm: 1.5 },
  { code: "hongdae", label: "홍대", lat: 37.5563, lng: 126.9236, radiusKm: 1.5 },
  { code: "itaewon", label: "이태원", lat: 37.5340, lng: 126.9944, radiusKm: 1.2 },
];

/** 코드 → 라벨 (광역 + 레거시/LIVE 인증 지역 배지용) */
export const ROOM_LABEL: Record<ChatRoomCode, string> = {
  sudogwon: "수도권",
  gyeongsang: "경상권",
  jeolla: "전라권",
  all: "전체",
  gangnam: "강남",
  hongdae: "홍대",
  itaewon: "이태원",
};

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
