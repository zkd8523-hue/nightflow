import dayjs from "dayjs";
import type { Auction } from "@/types/database";

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
  | 'won' | 'unsold' | 'contacted' | 'confirmed' | 'cancelled';

export function getAuctionDisplayStatus(auction: Auction): AuctionDisplayStatus {
  if (['won', 'unsold', 'contacted', 'confirmed', 'cancelled'].includes(auction.status)) {
    return auction.status as AuctionDisplayStatus;
  }

  const now = dayjs();
  const start = dayjs(auction.auction_start_at);
  const end = dayjs(getEffectiveEndTime(auction));

  if (now.isBefore(start)) return 'scheduled';
  if (now.isBefore(end)) return 'active';
  return 'expired';
}

