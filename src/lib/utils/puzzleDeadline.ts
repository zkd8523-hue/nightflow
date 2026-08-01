/**
 * 깃발/조각 오퍼 마감 시각 규칙 — 단일 출처.
 *
 * 깃발: 오퍼 마감 21:30 KST → 검토 마감 22:30 KST
 * 조각: 오퍼 마감 익일 03:00 KST → 검토 마감 익일 04:00 KST
 *
 * 조각을 새벽까지 열어두는 이유: 조각은 그날 밤 같이 놀 사람을 모으는 거라
 * 저녁에 닫으면 정작 사람들이 움직이기 시작하는 시간대를 통째로 놓친다.
 * 클럽이 실제로 도는 시간이 끝날 때까지 열어둔다.
 *
 * 두 경우 모두 검토 창(오퍼 마감 → 만료)은 60분으로 동일하다.
 */

const KST_OFFSET = 9;

/**
 * KST 기준 시각(정수/반시간 허용)을 event_date 당일 UTC ISO 문자열로 변환.
 * 24시 이상이면 자연스럽게 익일이 된다. (예: 27.0 = 익일 03:00 KST, 21.5 = 당일 21:30 KST)
 */
function kstHourToIso(eventDate: string, kstHour: number): string {
  const totalMin = Math.round(kstHour * 60) - KST_OFFSET * 60;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${eventDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

/** 오퍼 마감 (MD가 제안을 넣을 수 있는 마지막 시각) */
export function getOfferDeadline(eventDate: string, isShare: boolean): string {
  return kstHourToIso(eventDate, isShare ? 27 : 21.5);
}

/** 검토 마감 (방장이 오퍼를 고를 수 있는 마지막 시각) = 오퍼 마감 + 60분 */
export function getExpiresAt(eventDate: string, isShare: boolean): string {
  return kstHourToIso(eventDate, isShare ? 28 : 22.5);
}

/**
 * 신규 등록 마감 — 오퍼 마감과 별개.
 * 조각은 오퍼를 새벽 3시까지 받지만, 새벽 2시에 새로 올린 조각은 사람이 모일 시간이 없다.
 * 그래서 등록 자체는 밤 11시에 닫아 최소 4시간의 모집 시간을 보장한다.
 * 깃발은 오퍼 마감(21:30)보다 1시간 이른 20:30에 등록을 닫아,
 * 늦게 등록해도 최소 1시간의 오퍼 시간을 보장한다.
 */
export function getRegistrationDeadline(eventDate: string, isShare: boolean): string {
  return kstHourToIso(eventDate, isShare ? 23 : 20.5);
}

/** 안내 문구용 라벨 */
export function getOfferDeadlineLabel(isShare: boolean): string {
  return isShare ? "새벽 3시" : "오후 9시 30분";
}

/** 검토 마감 라벨 */
export function getReviewDeadlineLabel(isShare: boolean): string {
  return isShare ? "새벽 4시" : "오후 10시 30분";
}

/** 등록 마감 라벨 */
export function getRegistrationDeadlineLabel(isShare: boolean): string {
  return isShare ? "밤 11시" : "오후 9시 30분";
}

/**
 * ISO 시각을 KST 기준 한글 시각 라벨로. "3시"가 오후 3시로 오해되는 걸 막으려고
 * 새벽/오전/정오/오후를 붙인다. 실제 offer_deadline/expires_at 값 표시용.
 */
export function formatKstHourLabelKo(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET * 60 * 60 * 1000);
  const kstHour = kst.getUTCHours();
  const kstMin = kst.getUTCMinutes();
  const suffix = kstMin ? ` ${kstMin}분` : "";
  if (kstHour === 0) return `자정${suffix}`;
  if (kstHour < 6) return `새벽 ${kstHour}시${suffix}`;
  if (kstHour < 12) return `오전 ${kstHour}시${suffix}`;
  if (kstHour === 12) return `정오${suffix}`;
  return `오후 ${kstHour - 12}시${suffix}`;
}
