// 외국인 트랙 시즌 진입점의 노출 기간. 페이지 자체는 항상 살아 있고(색인 유지),
// 홈 카드·지역 페이지 배너 같은 "눈에 보이는 링크"만 이 창 안에서 켜진다.
// 지나면 코드를 안 건드려도 자동으로 빠지고, 다음 이벤트(NYE 등)는 항목만 추가한다.

export const HALLOWEEN_2026 = {
  slug: "halloween-seoul-2026",
  /** 10/31(토) */
  date: "2026-10-31",
  // 색인에 1~3주 걸리니 9월 14일부터 링크를 열고, 당일 새벽 6시(영업 종료)까지 유지.
  showFrom: Date.parse("2026-09-14T00:00:00+09:00"),
  showUntil: Date.parse("2026-11-01T06:00:00+09:00"),
} as const;

export function isHalloweenWindow(now: number = Date.now()): boolean {
  return now >= HALLOWEEN_2026.showFrom && now < HALLOWEEN_2026.showUntil;
}
