// 예약 폼 임시저장(localStorage) 공용 유틸.
//
// 강제종료·앱 스와이프·브라우저 크래시로 입력하던 걸 통째로 잃는 사고를
// 막는다(2026-09-06, 한국인·외국인 폼 공통). 폼을 끝까지 제출하면 즉시
// 지운다 — 완료된 예약의 초안이 남아있으면 다음 방문 때 엉뚱하게 복원된다.
//
// TTL 24시간: 그보다 오래된 초안은 날짜(eventDate)가 이미 지났을 가능성이
// 높고, 손님도 "이게 뭐였지" 싶어 복원보다 방해가 된다.
const TTL_MS = 24 * 60 * 60 * 1000;

// 외국인 예약 폼(ForeignRequestForm)의 draftKey. BackButton이 이 폼과 별도
// 컴포넌트라 "진행 중" 여부를 draft 존재로 판별해야 해서 공유 상수로 뺀다
// (2026-09-06) — 두 파일에 문자열을 따로 박아두면 언젠가 어긋난다.
export const FOREIGN_BOOKING_DRAFT_KEY = "nf_booking_draft_foreign";

type Draft<T> = { savedAt: number; data: T };

export function saveFormDraft<T>(key: string, data: T): void {
  try {
    const payload: Draft<T> = { savedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 프라이빗 브라우징 등 localStorage 접근 불가 — 임시저장은 편의 기능이라
    // 조용히 무시한다. 이것 때문에 예약 자체가 막히면 안 된다.
  }
}

export function loadFormDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft<T>;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
