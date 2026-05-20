import dayjs from "dayjs";
import type { Auction } from "@/types/database";

/**
 * 클럽 비즈니스 로직에 따른 '오늘' 계산 (새벽 4시 기준)
 * 새벽 6시 이전까지는 '어제 밤/오늘 새벽' 영업으로 간주하여 동일한 event_date를 유지함.
 * 반환 형식: YYYY-MM-DD
 */
export function getClubEventDate() {
    const now = dayjs();
    if (now.hour() < 6) {
        return now.subtract(1, "day").format("YYYY-MM-DD");
    }
    return now.format("YYYY-MM-DD");
}

/** 특정 시점의 club date 계산 (새벽 6시 기준) */
export function getClubEventDateFrom(isoDateString: string): string {
    const d = dayjs(isoDateString);
    if (d.hour() < 6) {
        return d.subtract(1, "day").format("YYYY-MM-DD");
    }
    return d.format("YYYY-MM-DD");
}

/** 얼리버드 판별: 등록 시점의 club date < event_date */
export function isEarlybird(auction: Auction): boolean {
    return getClubEventDateFrom(auction.created_at) < auction.event_date;
}

/**
 * 제목 텍스트에서 명시적 날짜(M/D, M월 D일)를 추출해 event_date와 비교.
 * 패턴 미발견 시 통과(한글 표현/요일/외국어는 검증 대상 아님).
 * 첫 매치만 검사.
 */
export function validateTitleDateConsistency(
    title: string,
    eventDate: string,
): { ok: true } | { ok: false; titleDate: string; expectedDate: string } {
    const patterns = [
        /(\d{1,2})\s*\/\s*(\d{1,2})/,
        /(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
    ];

    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (!match) continue;

        const month = parseInt(match[1], 10);
        const day = parseInt(match[2], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;

        const event = dayjs(eventDate);
        if (!event.isValid()) return { ok: true };

        if (month !== event.month() + 1 || day !== event.date()) {
            return {
                ok: false,
                titleDate: `${month}/${day}`,
                expectedDate: event.format("M/D"),
            };
        }
        return { ok: true };
    }

    return { ok: true };
}
