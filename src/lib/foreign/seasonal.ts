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

// 크리스마스(12/24 목·25 금 공휴일) → 신년(12/31 목·1/1 금 공휴일). 할로윈 창이 닫히는 순간 이어받는다.
// 페이지 문구는 lib/foreign/seasonGuides.ts.
export const CHRISTMAS_2026 = {
  slug: "christmas-seoul",
  showFrom: HALLOWEEN_2026.showUntil,
  showUntil: Date.parse("2026-12-26T06:00:00+09:00"),
} as const;

// 신년 카드는 크리스마스와 같이 11/1부터 띄운다(2026-10-30). 원래 12/26~1/1 엿새만 떴는데,
// 연말 여행은 12월 초면 예약이 끝나고 일본 연말연시 여행객(HIS 해외 예약 1위 서울)은 12/26이면 이미 서울에 와 있다.
// 지역 배너는 한 줄이라 그 기간엔 크리스마스가 먼저 뜬다(SeasonalBanner 순서).
export const NYE_2026 = {
  slug: "new-years-eve-seoul",
  showFrom: HALLOWEEN_2026.showUntil,
  showUntil: Date.parse("2027-01-01T06:00:00+09:00"),
} as const;

export function isChristmasWindow(now: number = Date.now()): boolean {
  return now >= CHRISTMAS_2026.showFrom && now < CHRISTMAS_2026.showUntil;
}

export function isNyeWindow(now: number = Date.now()): boolean {
  return now >= NYE_2026.showFrom && now < NYE_2026.showUntil;
}

// 춘절·설(2026-10-30 추가): 중국·대만 정월 초하루 2/6(토), 한국 설날 2/7(일)·연휴 2/6~2/9.
// 페이지는 en·zh·zh-tw만 있다(일본은 음력 설을 쇠지 않음). 중국어 홈은 12/1부터 — 할로윈 때 유입이
// 행사 6주 전부터 쌓였다. 영어 홈은 크리스마스·신년 카드와 겹치지 않게 신년 창이 닫힌 뒤부터.
// 대만 연휴 마지막 날(2/10)이 지나고 다음 날 새벽 6시에 닫는다.
export const LNY_2027 = {
  slug: "lunar-new-year-seoul",
  langs: ["en", "zh", "zh-tw"] as readonly string[],
  showFromZh: Date.parse("2026-12-01T00:00:00+09:00"),
  showFrom: NYE_2026.showUntil,
  showUntil: Date.parse("2027-02-11T06:00:00+09:00"),
} as const;

export function isLnyWindow(lang: string, now: number = Date.now()): boolean {
  if (!LNY_2027.langs.includes(lang)) return false;
  const from = lang === "zh" || lang === "zh-tw" ? LNY_2027.showFromZh : LNY_2027.showFrom;
  return now >= from && now < LNY_2027.showUntil;
}
