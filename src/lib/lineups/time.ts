import { BUSINESS_DAY_CUTOFF_HOUR, nowBusinessMinutes } from '@/lib/utils/hotdeal';

// nowBusinessMinutes는 그대로 재수출 — 두 벌이 되면 영업일 경계가 갈라진다.
export { nowBusinessMinutes, BUSINESS_DAY_CUTOFF_HOUR };

/**
 * ⚠️ hotdeal.ts의 toBusinessMinutes를 그대로 재사용하지 않는다 — 실제 버그로 확인됨.
 *
 * hotdeal.ts의 컷오프는 `h < 6`일 때만 "새벽이라 뒤로 민다": 05:xx는 밀리지만
 * 06:00 정각은 h===6이라 밀리지 않고 그대로 0으로 리셋된다. 게스트 간판(요일 판정)
 * 에서는 이게 맞다 — 06:00은 새 영업일의 시작이니까. 하지만 라인업 포스터는
 * "DOOR OPEN 22:00 ~ 07:00/08:00"처럼 06~08시까지도 같은 밤의 연장으로 다룬다
 * (실제 CLUB BERMUDA 포스터에 06:00 VICTA, 07:00 BERMUDA DJ가 있었고, 이걸
 *  hotdeal.ts 그대로 쓰면 start_min이 0, 60이 되어 라인업 맨 앞으로 튀어오르는
 *  정렬 버그가 실제로 재현됨).
 *
 * 그래서 라인업은 컷오프를 6시가 아니라 09시로 둔다: 00~08시는 전날 밤의 연장,
 * 09시부터가 진짜 "새 날 낮"이라고 본다. lineup_sets의 end_min 제약(0~1620=~09:00)
 * 과 맞물린 기준이다.
 */
const LINEUP_NIGHT_END_HOUR = 9;

export function toBusinessMinutes(hhmm: string): number {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = parseInt(hhmm.slice(3, 5), 10) || 0;
  const shifted = h < LINEUP_NIGHT_END_HOUR ? h + 24 : h;
  return (shifted - BUSINESS_DAY_CUTOFF_HOUR) * 60 + m;
}

/** 영업일 경과 분 → "HH:MM" (toBusinessMinutes의 역변환). 960 → "22:00", 1500 → "07:00". */
export function formatBusinessMin(min: number): string {
  const shifted = Math.floor(min / 60) + BUSINESS_DAY_CUTOFF_HOUR;
  const h = shifted % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 오늘의 영업일 날짜(YYYY-MM-DD, KST). 새벽 6시 이전이면 전날 날짜를 반환한다. */
export function getBusinessDateISO(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}

/**
 * 포스터에서 읽은 "MM-DD"에 연도를 붙이고, 기준 시각과 대조해 말이 되는지 본다.
 *
 * ⚠️ supabase/functions/_shared/lineup-logic.ts 의 같은 이름 함수와 로직이 동일해야
 *    한다(Deno가 npm 경로를 못 읽어 부득이 복제). 한쪽만 고치면 자동 수집과 수동
 *    업로드의 날짜 판정이 갈라진다.
 *
 * 왜 필요한가: 포스터에 일자만 있고 월이 없는 경우가 흔하다(예: "[28. FRI]").
 * 그러면 Vision이 "28일이 금요일인 달"을 추측해 월을 지어낸다. 실제로 8월에 올라온
 * ROOTS 포스터가 11-28로 파싱돼 목록에 3개월 뒤 항목으로 끼어든 사고가 있었다.
 *
 * @returns YYYY-MM-DD, 또는 신뢰할 수 없으면 null(호출부가 폴백)
 */
export function resolveLineupDate(
  monthDay: string | null,
  referenceTimestamp: string | null
): string | null {
  if (!monthDay) return null;
  const [mm, dd] = monthDay.split("-").map(Number);
  if (!mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const posted = referenceTimestamp ? new Date(referenceTimestamp) : new Date();
  if (Number.isNaN(posted.getTime())) return null;

  let year = posted.getUTCFullYear();
  if (posted.getUTCMonth() === 11 && mm === 1) year += 1; // 12월에 올린 1월 포스터
  if (posted.getUTCMonth() === 0 && mm === 12) year -= 1; // 1월에 올린 12월 포스터

  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  // 기준 시각 대조 — 너무 멀면 월을 잘못 읽은 것으로 본다
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = (new Date(`${iso}T00:00:00Z`).getTime() - posted.getTime()) / dayMs;
  if (diffDays < -3 || diffDays > 90) return null;

  return iso;
}
