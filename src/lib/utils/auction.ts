import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { Auction } from "@/types/database";

dayjs.extend(utc);
dayjs.extend(timezone);

// ============================================================================
// 얼리버드 경매 타이밍 규칙 (Migration 089)
// ============================================================================
// - 마감 시각: 항상 21:00 KST 고정
// - 마감일: 이벤트일 -2일 또는 그 이전 (MD 선택)
// - 경매 시작: 등록 즉시 (서버에서 now() 강제)
// - 연락 타이머: 60분 단일 (낙찰 후 MD 연락 마감)
// ============================================================================

export const EARLYBIRD_END_HOUR_KST = 21;
export const EARLYBIRD_MIN_BUFFER_DAYS = 2;
export const EARLYBIRD_MAX_DAYS_BEFORE = 4;
export const EARLYBIRD_MAX_EVENT_DAYS_AHEAD = 14;
export const CONTACT_TIMER_MINUTES = 60;
const KST = "Asia/Seoul";

export interface EarlybirdEndDateOption {
  date: string;          // YYYY-MM-DD (KST)
  daysBefore: number;    // 이벤트일 기준 며칠 전
  endAtISO: string;      // ISO 8601 UTC
  label: string;         // 'N일 전 (요일 21:00)'
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 이벤트일로부터 기본 마감 시각 계산 (event_date - 2일 21:00 KST → ISO UTC)
 */
export function computeEarlybirdEndAt(eventDate: string): string {
  return dayjs
    .tz(eventDate, KST)
    .subtract(EARLYBIRD_MIN_BUFFER_DAYS, "day")
    .hour(EARLYBIRD_END_HOUR_KST)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toISOString();
}

/**
 * 이벤트일 기준 선택 가능한 마감 날짜 목록 생성
 * - 이벤트 -2일부터 이전 방향으로 확장 (최대 -7일)
 * - 현재 시각 이후의 슬롯만 포함
 * - 빠른 마감 → 늦은 마감 순
 */
export function getEarlybirdEndDateOptions(
  eventDate: string,
  maxDaysBefore: number = EARLYBIRD_MAX_DAYS_BEFORE
): EarlybirdEndDateOption[] {
  const now = dayjs().tz(KST);
  const options: EarlybirdEndDateOption[] = [];

  for (let d = EARLYBIRD_MIN_BUFFER_DAYS; d <= maxDaysBefore; d++) {
    const endKst = dayjs
      .tz(eventDate, KST)
      .subtract(d, "day")
      .hour(EARLYBIRD_END_HOUR_KST)
      .minute(0)
      .second(0)
      .millisecond(0);

    // 이미 지난 마감은 제외
    if (endKst.isBefore(now)) continue;

    const weekday = WEEKDAY_KR[endKst.day()];
    options.push({
      date: endKst.format("YYYY-MM-DD"),
      daysBefore: d,
      endAtISO: endKst.toISOString(),
      label: `${endKst.format("M/D")} (${weekday}) ${EARLYBIRD_END_HOUR_KST}:00`,
    });
  }

  // 빠른 마감 순 (daysBefore 오름차순이 빠른 마감. "가장 가까운 마감일"이 먼저)
  // 실은 daysBefore 작을수록 "마감이 이벤트에 가까움" = "늦게 마감".
  // UX: 기본 선택을 "가장 빠른 마감"(max daysBefore)이 아니라
  // "가장 늦게 마감 = -2일"로 두는 게 일반적. 순서는 -2일 먼저.
  return options;
}

/**
 * 이벤트일이 등록 허용 범위 내인지 검증
 * - 오늘부터 EARLYBIRD_MAX_EVENT_DAYS_AHEAD 이내 (KST 기준)
 * - 하한은 isEarlybirdEndValid()의 -2일 마감 규칙으로 자연 강제됨
 */
export function isEventDateWithinWindow(eventDate: string): boolean {
  const today = dayjs().tz(KST).startOf("day");
  const event = dayjs.tz(eventDate, KST).startOf("day");
  const daysAhead = event.diff(today, "day");
  return daysAhead >= 0 && daysAhead <= EARLYBIRD_MAX_EVENT_DAYS_AHEAD;
}

/**
 * 마감 시각이 얼리버드 규칙을 만족하는지 검증
 * 1. KST 기준 정확히 21:00:00
 * 2. 이벤트일로부터 최소 2일 이전 (KST 날짜 기준)
 */
export function isEarlybirdEndValid(
  eventDate: string,
  auctionEndAt: string
): boolean {
  const endKst = dayjs(auctionEndAt).tz(KST);

  if (endKst.hour() !== EARLYBIRD_END_HOUR_KST) return false;
  if (endKst.minute() !== 0) return false;
  if (endKst.second() !== 0) return false;

  const eventKstDate = dayjs.tz(eventDate, KST).startOf("day");
  const endKstDate = endKst.startOf("day");
  const daysDiff = eventKstDate.diff(endKstDate, "day");

  return daysDiff >= EARLYBIRD_MIN_BUFFER_DAYS;
}

/** 경매 종료 시간 계산 (연장 포함) */
export function getEffectiveEndTime(auction: Auction): string {
  return auction.extended_end_at || auction.auction_end_at;
}

/** 경매 남은 시간 (초) */
export function getRemainingSeconds(auction: Auction): number {
  const end = dayjs(getEffectiveEndTime(auction));
  const now = dayjs();
  const diff = end.diff(now, "second");
  return Math.max(0, diff);
}

/** 시작가 기반 최소 입찰 증분 계산 */
export function getBidIncrement(startPrice: number): number {
  if (startPrice < 300000) return 5000;
  if (startPrice < 1000000) return 10000;
  return 20000;
}

/** 최소 입찰 가능 금액 */
export function getMinBidAmount(auction: Auction): number {
  if (auction.current_bid === 0) {
    return auction.start_price;
  }
  return auction.current_bid + auction.bid_increment;
}

/** 프리셋 입찰 금액 계산 (3버튼: 최소/적당/공격) */
export function getBidPresets(auction: Auction): number[] {
  const minBid = getMinBidAmount(auction);
  const base = auction.current_bid || auction.start_price;
  const startPrice = auction.start_price;

  let nudges: number[];

  if (startPrice < 300000) {
    nudges = [20000, 50000];              // +2만, +5만
  } else if (startPrice < 1000000) {
    nudges = [30000, 100000];             // +3만, +10만
  } else {
    nudges = [50000, 150000];             // +5만, +15만
  }

  return [minBid, ...nudges.map(n => base + n)];
}

/**
 * 경매가 현재 진행 중인지 확인 (시간과 상태 기반)
 * - scheduled: 시작 시간 도래 시 active로 간주
 * - active: 남은 시간이 있으면 active
 */
export function isAuctionActive(auction: Auction | null): boolean {
  if (!auction) return false;

  const now = dayjs();
  const start = dayjs(auction.auction_start_at);
  const end = dayjs(getEffectiveEndTime(auction));

  // scheduled 경매: 시작 시간 <= 현재 < 종료 시간
  if (auction.status === "scheduled") {
    const isStarted = now.unix() >= start.unix();
    const isNotEnded = now.unix() < end.unix();
    return isStarted && isNotEnded;
  }

  // active 경매: 남은 시간이 있으면 active
  if (auction.status === "active") {
    return getRemainingSeconds(auction) > 0;
  }

  return false;
}

/**
 * 경매가 마감되었으나 아직 DB 상태가 업데이트되지 않은 '만료' 상태인지 확인
 */
export function isAuctionExpired(auction: Auction | null): boolean {
  if (!auction || auction.status !== "active") return false;
  return getRemainingSeconds(auction) <= 0;
}

/**
 * 경매 화면 표시용 통합 상태 판별
 * DB status와 실제 시간을 결합하여 클라이언트에 보여줄 상태를 반환.
 * (scheduled 상태에서 시간이 지난 경우 expired로 처리)
 */
export type AuctionDisplayStatus =
  | 'active' | 'scheduled' | 'expired'
  | 'won' | 'unsold' | 'confirmed' | 'cancelled';

export function getAuctionDisplayStatus(auction: Auction): AuctionDisplayStatus {
  if (['won', 'unsold', 'confirmed', 'cancelled'].includes(auction.status)) {
    return auction.status as AuctionDisplayStatus;
  }

  const now = dayjs();
  const start = dayjs(auction.auction_start_at);
  const end = dayjs(getEffectiveEndTime(auction));

  if (now.isBefore(start)) return 'scheduled';
  if (now.isBefore(end)) return 'active';
  return 'expired';
}

