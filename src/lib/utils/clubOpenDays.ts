// 클럽이 특정 날짜에 영업하는지 판정한다 — 예약 폼 달력에서 휴무일을 막는 데 쓴다.
//
// 근거 데이터는 clubs.open_dows(0=일~6=토, Migration 659). operating_hours
// 자유 텍스트에서 뽑아 채웠고, 값이 NULL이면 "모름"이므로 아무 날도 막지 않는다 —
// 잘못 막으면 그 클럽은 예약 자체가 불가능해지는데, 그건 안 막는 것보다 훨씬 나쁘다.
//
// 공휴일 예외: 클럽은 요일보다 "노는 날"을 따라간다. 평일이어도 공휴일이나
// 공휴일 전날(=다음날 쉬는 날)이면 대부분 연다 — 실제로 operating_hours에도
// "금/토/공휴일 전날", "휴일 전날 20:00~" 같은 표기가 흔하다. 그래서 영업요일에
// 없더라도 공휴일·공휴일 전날은 열어준다.

import { isHoliday } from "./holidays";

/** YYYY-MM-DD의 다음 날 (달·해 넘김 포함) */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 이 클럽이 그 날짜에 영업하는가.
 * @param openDows clubs.open_dows — null/빈 배열이면 미설정으로 보고 항상 true
 * @param dateStr  YYYY-MM-DD
 */
export function isClubOpenOn(openDows: number[] | null | undefined, dateStr: string): boolean {
  if (!openDows || openDows.length === 0) return true;

  const dow = new Date(dateStr + "T12:00:00").getDay();
  if (openDows.includes(dow)) return true;

  // 공휴일 / 공휴일 전날은 요일과 무관하게 영업으로 본다.
  return isHoliday(dateStr) || isHoliday(nextDay(dateStr));
}

const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

/** "금·토" 처럼 사람이 읽는 영업요일 — 안내 문구용. 미설정이면 null */
export function formatOpenDows(openDows: number[] | null | undefined): string | null {
  if (!openDows || openDows.length === 0) return null;
  if (openDows.length === 7) return "매일";
  return [...openDows].sort((a, b) => a - b).map((d) => DOW_LABEL[d]).join("·");
}

const DOW_LABEL_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri·Sat" — 외국어 트랙 안내 문구용. 미설정이면 null */
export function formatOpenDowsEn(openDows: number[] | null | undefined): string | null {
  if (!openDows || openDows.length === 0) return null;
  if (openDows.length === 7) return "Daily";
  return [...openDows].sort((a, b) => a - b).map((d) => DOW_LABEL_EN[d]).join("·");
}
