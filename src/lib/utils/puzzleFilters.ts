import dayjs from "dayjs";
import type { Puzzle } from "@/types/database";
import { getClubEventDate } from "@/lib/utils/date";
import { DATE_RANGE_SEPARATOR } from "@/lib/utils/auctionFilters";

// Phase 1: 퍼즐 리스트 4종 필터

// 지역 필터 (게시글 말머리 표준)
export type AreaFilter = "all" | "강남" | "홍대" | "이태원" | "기타";

// 엔비(인당가) 범위 — 시장 슬랭 3분류
export type NbiFilter = "all" | "value" | "standard" | "premium";

// 잔여 자리 (퍼즐 모집 중에만 의미, 깃발은 자동으로 "완성팀"에 포함)
export type SeatFilter = "all" | "1" | "2" | "3+" | "full";

// 날짜 필터
// - "all" | "this_weekend" | "next_weekend"
// - 단일 날짜: "YYYY-MM-DD"
// - 범위: "YYYY-MM-DD..YYYY-MM-DD" (구형 "~" 구분자도 계속 허용)
export type DateFilter = "all" | "this_weekend" | "next_weekend" | string;

export const NBI_BANDS: Record<Exclude<NbiFilter, "all">, { label: string; min: number; max: number }> = {
  value: { label: "가성비", min: 0, max: 89_999 }, // ~8.9만 (시장 표준: 방장수고비 받지 말 것)
  standard: { label: "스탠다드", min: 90_000, max: 150_000 }, // 10~15만
  premium: { label: "프리미엄", min: 150_001, max: Number.POSITIVE_INFINITY }, // 15만+
};

export function getPerPersonBudget(puzzle: Puzzle): number {
  const totalBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  return Math.floor(totalBudget / Math.max(1, puzzle.target_count));
}

export function matchesArea(puzzle: Puzzle, filter: AreaFilter): boolean {
  if (filter === "all") return true;
  if (filter === "기타") {
    return !["강남", "홍대", "이태원"].includes(puzzle.area);
  }
  return puzzle.area === filter;
}

export function matchesNbi(puzzle: Puzzle, filter: NbiFilter): boolean {
  if (filter === "all") return true;
  const band = NBI_BANDS[filter];
  if (!band) return true;
  const perPerson = getPerPersonBudget(puzzle);
  return perPerson >= band.min && perPerson <= band.max;
}

export function matchesSeat(puzzle: Puzzle, filter: SeatFilter): boolean {
  if (filter === "all") return true;
  const isRecruiting = puzzle.is_recruiting_party;
  const remaining = Math.max(0, puzzle.target_count - puzzle.current_count);

  if (filter === "full") {
    // 완성팀 = 모집 OFF(깃발) OR 모집 ON인데 인원 다 찬 경우
    return !isRecruiting || remaining === 0;
  }
  // 잔여 자리 칩들은 모집 중인 퍼즐에만 의미 있음
  if (!isRecruiting) return false;
  if (filter === "1") return remaining === 1;
  if (filter === "2") return remaining === 2;
  if (filter === "3+") return remaining >= 3;
  return true;
}

export function matchesDate(puzzle: Puzzle, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const date = dayjs(puzzle.event_date);
  const baseline = dayjs(getClubEventDate());
  switch (filter) {
    case "this_weekend": {
      const fri = baseline.day(5);
      const sat = baseline.day(6);
      const friValid = !fri.isBefore(baseline, "day");
      const satValid = !sat.isBefore(baseline, "day");
      return (friValid && date.isSame(fri, "day")) || (satValid && date.isSame(sat, "day"));
    }
    case "next_weekend": {
      const fri = baseline.day(5).add(1, "week");
      const sat = baseline.day(6).add(1, "week");
      return date.isSame(fri, "day") || date.isSame(sat, "day");
    }
    default: {
      // 범위. DateFilterCalendar가 내보내는 ".." 구분자를 쓰고,
      // 예전 "~" 형식(북마크/공유 링크에 남아있을 수 있음)도 계속 받아준다.
      const sep = filter.includes(DATE_RANGE_SEPARATOR) ? DATE_RANGE_SEPARATOR : filter.includes("~") ? "~" : null;
      if (sep) {
        const [from, to] = filter.split(sep);
        const dateStr = date.format("YYYY-MM-DD");
        return dateStr >= from && dateStr <= to;
      }
      // 단일 날짜
      return date.format("YYYY-MM-DD") === filter;
    }
  }
}
