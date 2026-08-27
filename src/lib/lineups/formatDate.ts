const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 라인업 날짜 라벨. "2026-08-30" → "8월 30일(일)"
 *
 * 프로젝트에 날짜 포맷 함수가 이미 여러 벌 흩어져 있다(events/page.tsx의 formatDate는
 * 괄호 앞에 공백이 있고, HomePuzzleCarousel의 formatEventDateLabel도 별개다).
 * 라인업 계열 화면만이라도 하나로 모아 표기가 갈라지지 않게 한다 — 다른 계열은
 * 포맷이 미묘하게 달라 건드리면 회귀 위험이 있어 그대로 둔다.
 *
 * KST 고정: 문자열에 +09:00을 붙여 파싱하므로 서버/클라이언트 어디서 호출해도
 * 같은 요일이 나온다(서버가 UTC여도 안전).
 */
export function formatLineupDate(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00+09:00`);
  const m = dateISO.slice(5, 7).replace(/^0/, "");
  const day = dateISO.slice(8, 10).replace(/^0/, "");
  return `${m}월 ${day}일(${DOW[d.getDay()]})`;
}

/**
 * 날짜와 요일을 따로 준다. "2026-08-28" → { label: "8월 28일", dow: "금" }
 * /lineups 날짜 헤더처럼 요일을 다른 색·크기로 렌더해야 할 때 쓴다
 * (formatLineupDate는 "8월 28일(금)"처럼 붙여서 주므로 쪼갤 수 없다).
 */
export function splitLineupDate(dateISO: string): { label: string; dow: string } {
  const d = new Date(`${dateISO}T00:00:00+09:00`);
  const m = dateISO.slice(5, 7).replace(/^0/, "");
  const day = dateISO.slice(8, 10).replace(/^0/, "");
  return { label: `${m}월 ${day}일`, dow: DOW[d.getDay()] };
}

/** 그 날짜가 KST 기준 오늘인지. 날짜 헤더의 "오늘" 배지 판정용. */
export function isLineupToday(dateISO: string): boolean {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return dateISO === nowKst.toISOString().slice(0, 10);
}
