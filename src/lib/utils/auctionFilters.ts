import dayjs from "dayjs";
import type { Auction } from "@/types/database";
import { getClubEventDate } from "@/lib/utils/date";

export const PRICE_MIN = 300_000;
export const PRICE_MAX = 10_000_000;
export const PRICE_STEP = 50_000;

export type DateFilter =
  | "all"
  | "this_weekend"
  | "next_weekend"
  | string; // YYYY-MM-DD

export interface PricePreset {
  id: string;
  label: string;
  range: [number, number];
}

export const PRICE_PRESETS: PricePreset[] = [
  { id: "p1", label: "~50만", range: [PRICE_MIN, 500_000] },
  { id: "p2", label: "50~80만", range: [500_000, 800_000] },
  { id: "p3", label: "80~150만", range: [800_000, 1_500_000] },
  { id: "p4", label: "150~300만", range: [1_500_000, 3_000_000] },
  { id: "p5", label: "300~500만", range: [3_000_000, 5_000_000] },
  { id: "p6", label: "500~1000만", range: [5_000_000, PRICE_MAX] },
  { id: "p7", label: "1000만+", range: [PRICE_MAX, PRICE_MAX] },
];

export const isUncapped = (max: number) => max >= PRICE_MAX;

export function getEffectivePrice(auction: Auction): number {
  return auction.current_bid && auction.current_bid > 0
    ? auction.current_bid
    : auction.start_price;
}

export function matchesPrice(auction: Auction, [min, max]: [number, number]): boolean {
  const price = getEffectivePrice(auction);
  if (price < min) return false;
  if (!isUncapped(max) && price > max) return false;
  return true;
}

export const DATE_RANGE_SEPARATOR = "..";

export function formatDateRangeFilter(from: string, to: string): string {
  return `${from}${DATE_RANGE_SEPARATOR}${to}`;
}

export function parseDateRangeFilter(filter: string): { from: string; to: string } | null {
  if (!filter.includes(DATE_RANGE_SEPARATOR)) return null;
  const [from, to] = filter.split(DATE_RANGE_SEPARATOR);
  if (!from || !to) return null;
  return { from, to };
}

export function matchesDate(auction: Auction, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const date = dayjs(auction.event_date);
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
      const range = parseDateRangeFilter(filter);
      if (range) {
        const from = dayjs(range.from);
        const to = dayjs(range.to);
        return (
          (date.isSame(from, "day") || date.isAfter(from, "day")) &&
          (date.isSame(to, "day") || date.isBefore(to, "day"))
        );
      }
      return date.format("YYYY-MM-DD") === filter;
    }
  }
}

export function findMatchingPresetId(range: [number, number]): string | null {
  return PRICE_PRESETS.find(
    (p) => p.range[0] === range[0] && p.range[1] === range[1]
  )?.id ?? null;
}

export function isDefaultPriceRange(range: [number, number]): boolean {
  return range[0] === PRICE_MIN && range[1] === PRICE_MAX;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateChip(date: string): string {
  const d = dayjs(date);
  return `${d.format("M/D")}(${DAYS[d.day()]})`;
}

export function formatPriceRangeLabel([min, max]: [number, number]): string {
  const fmt = (n: number) => `₩${n.toLocaleString()}`;
  if (isUncapped(max)) {
    if (min === PRICE_MAX) return "1000만원+";
    return `${fmt(min)} - 1000만원+`;
  }
  return `${fmt(min)} - ${fmt(max)}`;
}
