import dayjs from "dayjs";
import type { Auction } from "@/types/database";

/**
 * 클럽 비즈니스 로직에 따른 '오늘' 계산 (새벽 4시 기준)
 * 새벽 4시 이전까지는 '어제 밤/오늘 새벽' 영업으로 간주하여 동일한 event_date를 유지함.
 * 반환 형식: YYYY-MM-DD
 */
export function getClubEventDate() {
    const now = dayjs();
    if (now.hour() < 4) {
        return now.subtract(1, "day").format("YYYY-MM-DD");
    }
    return now.format("YYYY-MM-DD");
}

/** 특정 시점의 club date 계산 (새벽 4시 기준) */
export function getClubEventDateFrom(isoDateString: string): string {
    const d = dayjs(isoDateString);
    if (d.hour() < 4) {
        return d.subtract(1, "day").format("YYYY-MM-DD");
    }
    return d.format("YYYY-MM-DD");
}

/** 얼리버드 판별: 등록 시점의 club date < event_date */
export function isEarlybird(auction: Auction): boolean {
    return getClubEventDateFrom(auction.created_at) < auction.event_date;
}
