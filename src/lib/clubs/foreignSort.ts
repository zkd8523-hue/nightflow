// 외국인 트랙(en/ja/zh/zh-tw) 클럽 정렬 공용 로직.
// 목록의 "Recommend"와 홈 "Top clubs"가 동일 순서를 쓰도록 여기서 단일 정의.
//
// 규칙:
//  1) 기본 정렬 = 즉시 예약 가능(MD+주대) 우선 → MD만 있는 곳 → 그 안에서 리뷰수 순
//  2) featured_rank = 지역 내 "고정 노출 위치"(1-based). Recommend/홈에서만 적용.
//     예) featured_rank=4 → 해당 지역 리스트에서 4번째 슬롯에 고정 삽입.
//     ⚠️ Most reviewed / Top rated 같은 명시적 정렬에는 절대 적용하지 않음(순수 정렬 유지).

import { isBookable } from "./bookable";

export type SortableClub = {
  area?: string | null;
  has_md?: boolean;
  /** 주대(club_menu_items)가 등록됐는지. 예약 성립의 필수 조건. */
  has_menu?: boolean;
  /** 콜드 DM 승인 플래그(clubs.foreign_booking_agreed). has_md의 대체 축. */
  agreed?: boolean;
  /** 제외 목록(Awesome Red·Waikiki) 대조용 — isBookable에 그대로 넘긴다. */
  name?: string | null;
  google_review_count?: number | null;
  featured_rank?: number | null;
};

/**
 * 즉시 예약 가능 우선 → MD 보유 → 리뷰수 순 (Recommend 기본 비교자).
 *
 * 1순위 판정은 isBookable()에 위임한다(2026-09-10). 예전엔 여기서 has_md && has_menu를
 * 직접 계산했는데, 그러면 규칙이 두 벌이 되어 갈린다 — 실제로 제외 목록(Awesome Red·
 * Waikiki)과 승인 플래그(agreed)를 정렬만 모르고 있었다.
 * 2순위 has_md 가산점은 남긴다: 담당자가 실제로 붙은 곳을 같은 조건에서 위로 올린다.
 */
export function recommendCompare(a: SortableClub, b: SortableClub): number {
  const bookable = Number(isBookable(b)) - Number(isBookable(a));
  if (bookable !== 0) return bookable;
  const md = (b.has_md ? 1 : 0) - (a.has_md ? 1 : 0);
  if (md !== 0) return md;
  return (b.google_review_count ?? 0) - (a.google_review_count ?? 0);
}

/**
 * featured_rank 를 "고정 위치"로 적용. 이미 정렬된 한 지역의 배열을 받아,
 * featured_rank>0 인 클럽을 (featured_rank-1) 인덱스에 삽입해 반환.
 * 여러 개면 rank 오름차순으로 순서대로 삽입.
 */
export function pinFeatured<T extends SortableClub>(sortedAreaItems: T[]): T[] {
  const pinned = sortedAreaItems
    .filter((c) => (c.featured_rank ?? 0) > 0)
    .sort((a, b) => (a.featured_rank ?? 0) - (b.featured_rank ?? 0));
  if (pinned.length === 0) return sortedAreaItems;
  const out = sortedAreaItems.filter((c) => !((c.featured_rank ?? 0) > 0));

  // 예약 가능한 클럽은 고정 노출보다 앞에 둔다(2026-09-06).
  // 이태원에서 BADASS(featured_rank=3, 리뷰 7, 예약 불가)가 3번 자리를 차지해
  // 실제로 잡아줄 수 있는 Dawn을 뒤로 밀어냈다. 고정 노출은 "같은 조건일 때의
  // 자리"지, 예약되는 곳을 밀어낼 권한은 아니다.
  const bookableCount = out.filter(isBookable).length;

  for (const p of pinned) {
    const wanted = Math.max((p.featured_rank ?? 1) - 1, 0);
    const floor = isBookable(p) ? 0 : bookableCount;
    const idx = Math.min(Math.max(wanted, floor), out.length);
    out.splice(idx, 0, p);
  }
  return out;
}

/**
 * 홈(지역 혼합 flat 배열)용: 지역별로 recommendCompare 정렬 + featured 고정위치 적용.
 * 홈은 지역 섹션으로 렌더되므로 지역 내 순서만 맞으면 됨.
 */
export function orderForeignHome<T extends SortableClub>(flat: T[]): T[] {
  const byArea = new Map<string, T[]>();
  for (const c of flat) {
    const k = c.area ?? "";
    if (!byArea.has(k)) byArea.set(k, []);
    byArea.get(k)!.push(c);
  }
  const out: T[] = [];
  for (const arr of byArea.values()) {
    arr.sort(recommendCompare);
    out.push(...pinFeatured(arr));
  }
  return out;
}
