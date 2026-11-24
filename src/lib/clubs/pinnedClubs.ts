// 상위 고정 클럽(셔플 제외). 게스트 혜택이 있으면 혜택 그룹 맨 앞, 없으면 혜택 없는
// 그룹 맨 앞에 온다 — 혜택 클럽보다 위로 새치기하지는 않는다. 홈 "어디갈래?"
// (clubBenefitData)와 지역별 클럽 목록(ClubList)이 같이 쓴다. 클럽명은 바뀔 수
// 있어 id로 지정한다(2026-09-30).
//
// until(만료일) 지정 시 그 날짜까지만 고정 — 지나면 코드 수정 없이 자동으로
// 일반 정렬로 복귀한다(2026-11-25, Palace 3주 상위노출 건으로 도입).
// until 생략 시 영구 고정(기존 La Rosa 케이스 유지).
type PinnedEntry = { id: string; until?: string; newBadge?: boolean };

const PINNED_ENTRIES: PinnedEntry[] = [
  { id: "4004d7b6-b3d2-4ec4-8c42-32d82405ded0" }, // La Rosa (홍대) — 영구 고정
  { id: "c99d9dc1-058f-4348-b795-cf0bc00d54d8", until: "2026-12-16", newBadge: true }, // Palace (강남) — 3주 NEW 상위노출
];

function isActive(e: PinnedEntry): boolean {
  return !e.until || new Date(e.until).getTime() > Date.now();
}

/** 현재 유효한(만료 안 된) 고정 클럽 id 목록, 순서 그대로. */
export const PINNED_CLUB_IDS: string[] = PINNED_ENTRIES.filter(isActive).map((e) => e.id);

/** 고정 순서(배열 index). 고정 대상이 아니면 Infinity. */
export function pinnedRank(clubId: string): number {
  const i = PINNED_CLUB_IDS.indexOf(clubId);
  return i === -1 ? Infinity : i;
}

/** 카드에 "NEW" 배지를 띄울지 — 고정 + newBadge:true + 만료 전. */
export function isNewPinned(clubId: string): boolean {
  const e = PINNED_ENTRIES.find((x) => x.id === clubId);
  return !!e && !!e.newBadge && isActive(e);
}
