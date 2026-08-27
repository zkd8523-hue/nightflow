/**
 * 좋아요 열기 단계 — 누적 수가 임계값을 넘으면 버튼이 달아오른다.
 *
 * 숫자만 올라가는 카운터는 "몇 명이 눌렀다"만 말하지만, 색이 바뀌면 "지금 이 파티가
 * 터지고 있다"가 목록에서 한눈에 읽힌다. 상세(누르는 곳)와 목록(읽기 전용 배지)이
 * 같은 기준을 써야 하므로 임계값을 여기 한 곳에 둔다.
 *
 * 라인업(club_lineups)과 공연(club_events)이 같은 표를 공유한다 — 유저에게는 둘 다
 * "이 밤 좋다"라는 같은 행동이라 단계가 갈리면 안 된다.
 */
export type HypeTier = 0 | 1 | 2 | 3 | 4;

/** 각 단계의 하한. 실제 분포를 보고 낮출 수 있게 배열로 뽑아둔다. */
export const HYPE_THRESHOLDS = [10, 30, 50, 100] as const;

export function hypeTier(count: number): HypeTier {
  if (count >= HYPE_THRESHOLDS[3]) return 4;
  if (count >= HYPE_THRESHOLDS[2]) return 3;
  if (count >= HYPE_THRESHOLDS[1]) return 2;
  if (count >= HYPE_THRESHOLDS[0]) return 1;
  return 0;
}

/**
 * 상세 페이지 버튼 — 항상 같은 톤이다.
 *
 * 단계별 색은 목록에만 쓴다. 상세 버튼은 제목 바로 옆에 붙어 있어서 색이 진해지면
 * 제목보다 시선을 먼저 가져가고, 무엇보다 열기 비교가 값어치 있는 곳은 여러 공연이
 * 나란히 선 목록이다. 여기 온 사람은 이미 이 공연을 골랐으므로 "내가 눌렀는지"만
 * 구분되면 된다. 숫자는 그대로 나오므로 정보 손실은 없다.
 */
export function hypeButtonClass(_tier: HypeTier, likedByMe: boolean): string {
  // 아이콘과 글씨를 같은 색으로 묶는다 — 주황 아이콘 + 흰 글씨는 서로 따로 논다.
  // 주황을 썼던 건 "불타오른다"는 열기 은유 때문이었는데, 아이콘이 따봉이 되고
  // 문구가 "좋아요"가 되면서 그 근거가 사라졌다. 프로젝트 강조색인 앰버로 통일한다.
  return likedByMe
    ? "bg-brand-amber/10 text-brand-amber border-brand-amber/50"
    : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent";
}

/**
 * 버튼 안 따봉 아이콘 — 색은 버튼 글씨를 그대로 따라간다(currentColor).
 * 누른 상태에서만 채워서(fill) 눌림이 한눈에 보이게 한다.
 */
export function hypeIconClass(_tier: HypeTier, likedByMe: boolean): string {
  return likedByMe ? "fill-current" : "";
}

/**
 * 목록 카드 배지 — 읽기 전용(누르는 건 상세).
 *
 * 색은 상세 버튼과 같은 앰버 하나로 통일한다. 예전엔 단계별로 주황→빨강으로 달아올랐는데,
 * 그건 아이콘이 불꽃이던 시절의 은유였다. 따봉·"좋아요"가 된 지금은 색이 뜨거워질 이유가
 * 없고, 카드마다 색이 다르면 목록이 산만해진다. 열기 차이는 숫자가 이미 말해준다.
 */
export function hypeBadgeClass(_tier: HypeTier): string {
  return "text-brand-amber";
}

export function hypeBadgeIconClass(_tier: HypeTier): string {
  return "";
}
