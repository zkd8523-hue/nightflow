const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 라인업 날짜 라벨. "2026-08-30" → "8월 30일(일)"
 *
 * 프로젝트에 날짜 포맷 함수가 이미 여러 벌 흩어져 있다(events/page.tsx의 formatDate는
 * 괄호 앞에 공백이 있고, HomePuzzleCarousel의 formatEventDateLabel도 별개다).
 * 라인업 계열 화면만이라도 하나로 모아 표기가 갈라지지 않게 한다 — 다른 계열은
 * 포맷이 미묘하게 달라 건드리면 회귀 위험이 있어 그대로 둔다.
 *
 * 요일은 날짜 문자열 자체의 달력 요일이다 — 시간대와 무관해야 한다.
 * 예전엔 `T00:00:00+09:00`으로 파싱한 뒤 getDay()를 썼는데, getDay()는 실행 환경의
 * 로컬 시간대를 따르므로 UTC 서버(Vercel)에선 전날 15:00이 되어 요일이 하루 밀렸다
 * (2026-10-24 토 → "(금)", 2026-10-22 발견). UTC 정오로 만들고 getUTCDay()로 읽는다.
 */
function dowOf(dateISO: string): string {
  return DOW[new Date(`${dateISO}T12:00:00Z`).getUTCDay()];
}

export function formatLineupDate(dateISO: string): string {
  const m = dateISO.slice(5, 7).replace(/^0/, "");
  const day = dateISO.slice(8, 10).replace(/^0/, "");
  return `${m}월 ${day}일(${dowOf(dateISO)})`;
}

/**
 * 날짜와 요일을 따로 준다. "2026-08-28" → { label: "8월 28일", dow: "금" }
 * /lineups 날짜 헤더처럼 요일을 다른 색·크기로 렌더해야 할 때 쓴다
 * (formatLineupDate는 "8월 28일(금)"처럼 붙여서 주므로 쪼갤 수 없다).
 */
export function splitLineupDate(dateISO: string): { label: string; dow: string } {
  const m = dateISO.slice(5, 7).replace(/^0/, "");
  const day = dateISO.slice(8, 10).replace(/^0/, "");
  return { label: `${m}월 ${day}일`, dow: dowOf(dateISO) };
}

/** 그 날짜가 KST 기준 오늘인지. 날짜 헤더의 "오늘" 배지 판정용. */
export function isLineupToday(dateISO: string): boolean {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return dateISO === nowKst.toISOString().slice(0, 10);
}
