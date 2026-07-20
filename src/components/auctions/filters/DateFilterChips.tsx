"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import { getClubEventDate } from "@/lib/utils/date";
import { formatDateChip, type DateFilter } from "@/lib/utils/auctionFilters";

interface DateFilterChipsProps {
  eventDates: string[]; // unique event_date 목록 (YYYY-MM-DD)
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
}

interface ChipDef {
  key: DateFilter;
  label: string;
}

export function DateFilterChips({ eventDates, value, onChange }: DateFilterChipsProps) {
  const chips = useMemo<ChipDef[]>(() => {
    const baseline = dayjs(getClubEventDate());
    const todayStr = baseline.format("YYYY-MM-DD");
    const tomorrowStr = baseline.add(1, "day").format("YYYY-MM-DD");

    const thisFri = baseline.day(5).format("YYYY-MM-DD");
    const thisSat = baseline.day(6).format("YYYY-MM-DD");
    const nextFri = baseline.day(5).add(1, "week").format("YYYY-MM-DD");
    const nextSat = baseline.day(6).add(1, "week").format("YYYY-MM-DD");

    const dateSet = new Set(eventDates);

    const result: ChipDef[] = [{ key: "all", label: "전체" }];

    if (dateSet.has(todayStr)) {
      result.push({ key: "today", label: "오늘" });
    }
    if (dateSet.has(tomorrowStr)) {
      result.push({ key: "tomorrow", label: "내일" });
    }
    if (dateSet.has(thisFri) || dateSet.has(thisSat)) {
      result.push({ key: "this_weekend", label: "주말(금/토)" });
    }
    if (dateSet.has(nextFri) || dateSet.has(nextSat)) {
      result.push({ key: "next_weekend", label: "다음 주말(금/토)" });
    }

    // 동적 날짜: 위 키워드와 겹치지 않는 가까운 날짜 5개
    const reservedKeys = new Set([todayStr, tomorrowStr, thisFri, thisSat, nextFri, nextSat]);
    const sortedExtras = [...eventDates]
      .filter((d) => !reservedKeys.has(d))
      .filter((d) => dayjs(d).isAfter(baseline.subtract(1, "day"), "day"))
      .sort()
      .slice(0, 5);

    for (const d of sortedExtras) {
      result.push({ key: d, label: formatDateChip(d) });
    }

    return result;
  }, [eventDates]);

  if (chips.length <= 1) return null; // "전체"만 있으면 숨김

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 touch-pan-x touch-pan-y">
      {chips.map((chip) => {
        const active = chip.key === value;
        return (
          <button
            key={chip.key}
            onClick={() => onChange(chip.key)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              active
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
