/**
 * 공연(club_events) 지역 칩 목록.
 *
 * 클럽 동네 단위(AREA_OPTIONS: 강남·홍대·이태원)를 그대로 쓰되, 공연에만 나오는
 * 값을 덧붙인다. 공연은 클럽과 달리 포스터마다 장소가 달라서 구 단위로 안 찍히는
 * 값이 섞인다 — "서울"(구 미상), "인천"·"고양"(수도권 외곽), 해외 도시까지.
 *
 * ⚠️ 구 단위를 광역으로 뭉치지 않는다. 실측(2026-08-30, 승인 공연 499건):
 *    홍대 137 · 이태원 87 · 강남 37 로 구 단위가 이 서비스의 핵심 축이다.
 *    이걸 "수도권" 하나로 합치면 정작 사람들이 쓰는 구분이 사라진다.
 *
 * ⚠️ 새 지역이 수집되면 EVENT_AREAS에 추가해야 칩에 잡힌다 — 안 넣으면 그 공연은
 *    "전체"에서만 보이고 개별 칩으로는 못 찾는다(목록에서 사라지지는 않는다).
 */

export const EVENT_AREAS = [
  // 서울 구 단위 — 클럽 탭(AREA_OPTIONS)과 같은 값을 쓴다
  "홍대",
  "이태원",
  "강남",
  // 구가 안 찍힌 서울 공연(공연장·아레나 등 캡션에 동네가 없는 경우)
  "서울",
  // 수도권 외곽·지방
  "인천",
  "수원",
  "고양",
  "대전",
  "대구",
  "부산",
  "광주",
  "제주",
  // 해외
  "타이페이",
  "도쿄",
  "홍콩",
  "오사카",
] as const;

export type EventArea = (typeof EVENT_AREAS)[number];

const AREA_SET = new Set<string>(EVENT_AREAS);

/** 원문 venue_area가 칩으로 쓸 수 있는 값인지. 아니면 null(“전체”에만 남는다). */
export function eventAreaOf(rawArea: string | null | undefined): EventArea | null {
  if (!rawArea) return null;
  const s = rawArea.trim();
  return AREA_SET.has(s) ? (s as EventArea) : null;
}
