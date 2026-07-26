// 외국인 트랙(en/ja/zh/zh-tw) 클럽 정렬 공용 로직.
// 목록의 "Recommend"와 홈 "Top clubs"가 동일 순서를 쓰도록 여기서 단일 정의.
//
// 규칙:
//  1) 기본 정렬 = MD 보유 클럽 우선 → 그 안에서 구글 리뷰수 많은 순
//  2) featured_rank = 지역 내 "고정 노출 위치"(1-based). Recommend/홈에서만 적용.
//     예) featured_rank=4 → 해당 지역 리스트에서 4번째 슬롯에 고정 삽입.
//     ⚠️ Most reviewed / Top rated 같은 명시적 정렬에는 절대 적용하지 않음(순수 정렬 유지).

export type SortableClub = {
  area?: string | null;
  has_md?: boolean;
  google_review_count?: number | null;
  featured_rank?: number | null;
};

/** MD 보유 우선 → 리뷰수 순 (Recommend 기본 비교자) */
export function recommendCompare(a: SortableClub, b: SortableClub): number {
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
  for (const p of pinned) {
    const idx = Math.min(Math.max((p.featured_rank ?? 1) - 1, 0), out.length);
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
