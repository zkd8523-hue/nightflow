// 상위 고정 클럽(셔플 제외). 게스트 혜택이 있으면 혜택 그룹 맨 앞, 없으면 혜택 없는
// 그룹 맨 앞에 온다 — 혜택 클럽보다 위로 새치기하지는 않는다. 홈 "어디갈래?"
// (clubBenefitData)와 지역별 클럽 목록(ClubList)이 같이 쓴다. 클럽명은 바뀔 수
// 있어 id로 지정한다(2026-09-30).
export const PINNED_CLUB_IDS: string[] = [
  "4004d7b6-b3d2-4ec4-8c42-32d82405ded0", // La Rosa (홍대)
];

/** 고정 순서(배열 index). 고정 대상이 아니면 Infinity. */
export function pinnedRank(clubId: string): number {
  const i = PINNED_CLUB_IDS.indexOf(clubId);
  return i === -1 ? Infinity : i;
}
