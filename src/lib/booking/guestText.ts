// 손님 화면에 보이는 자리 문구 정리(2026-11-06).
// 확인서에는 운영자·담당자도 읽도록 "Assigned on the night (당일 배정)"처럼 한국어가 붙어 저장돼 있다 — 손님 화면(영어·일본어·중국어)에는
// 한국어 괄호를 빼고 "Assigned when you arrive"로 보여준다. 이전에 저장된 값("on the night")도 같은 문구로 바꾼다.

export const ASSIGN_ON_ARRIVAL = "Assigned when you arrive";

/** 당일 배정 확인서인지 — 새 값("when you arrive")과 예전 값("on the night") 모두. */
export const isAssignedOnArrival = (info: string | null | undefined): boolean => /^assigned (on the night|when you arrive)/i.test((info ?? "").trim());

export function guestTableText(info: string): string {
  const clean = info.replace(/\s*\([^)]*[가-힣][^)]*\)/g, "").trim();
  return isAssignedOnArrival(clean) ? ASSIGN_ON_ARRIVAL : clean;
}

/** 포함 내역 한 줄 다듬기 — "1 Deep Ice (Sweet) · 5 bottle set" → "Deep Ice (Sweet) · 5-bottle set". 다른 줄은 그대로. */
export function guestIncludeLine(line: string): string {
  const m = line.match(/^1\s+(.+?)\s·\s(\d+)\s+bottle set$/i);
  return m ? `${m[1]} · ${m[2]}-bottle set` : line;
}
