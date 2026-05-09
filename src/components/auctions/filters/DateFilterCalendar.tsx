"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getClubEventDate } from "@/lib/utils/date";
import { type DateFilter } from "@/lib/utils/auctionFilters";

interface DateFilterCalendarProps {
  eventDates: string[]; // unique event_date 목록 (YYYY-MM-DD)
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
}

const QUICK_CHIPS = ["this_weekend", "next_weekend"] as const;
const CHIP_LABELS: Record<string, string> = {
  this_weekend: "이번주(금/토)",
  next_weekend: "다음주(금/토)",
};

export function DateFilterCalendar({ eventDates, value, onChange }: DateFilterCalendarProps) {
  const baseline = dayjs(getClubEventDate());
  const eventDateSet = useMemo(() => new Set(eventDates), [eventDates]);

  // 달력에 표시할 amber dot 날짜
  const auctionDates = useMemo(
    () => eventDates.map((d) => new Date(d + "T12:00:00")),
    [eventDates]
  );

  // 퀵칩 선택 시 달력에 강조할 날짜들
  const chipSelectedDates = useMemo(() => {
    if (value === "this_weekend") {
      const dates: Date[] = [];
      const fri = baseline.day(5);
      const sat = baseline.day(6);
      if (!fri.isBefore(baseline, "day")) dates.push(new Date(fri.format("YYYY-MM-DD") + "T12:00:00"));
      if (!sat.isBefore(baseline, "day")) dates.push(new Date(sat.format("YYYY-MM-DD") + "T12:00:00"));
      return dates;
    }
    if (value === "next_weekend") {
      return [
        new Date(baseline.day(5).add(1, "week").format("YYYY-MM-DD") + "T12:00:00"),
        new Date(baseline.day(6).add(1, "week").format("YYYY-MM-DD") + "T12:00:00"),
      ];
    }
    return [];
  }, [value, baseline]);

  // 현재 선택된 단일 날짜 (YYYY-MM-DD 형태면 달력에 반영)
  const selectedDate = useMemo(() => {
    if (
      value === "all" ||
      value === "this_weekend" ||
      value === "next_weekend"
    )
      return undefined;
    return new Date(value + "T12:00:00");
  }, [value]);

  // 달력 선택 → 특정 날짜 필터
  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      onChange("all");
      return;
    }
    const str = dayjs(day).format("YYYY-MM-DD");
    onChange(str === value ? "all" : str);
  };

  return (
    <div className="space-y-3">
      {/* 퀵 칩 */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange("all")}
          className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
            value === "all"
              ? "bg-white text-black"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
          }`}
        >
          전체
        </button>
        {QUICK_CHIPS.map((key) => {
          const active = value === key;
          // 해당 주말에 매물이 있는지 확인
          const fri =
            key === "this_weekend"
              ? baseline.day(5)
              : baseline.day(5).add(1, "week");
          const sat = fri.add(1, "day");
          return (
            <button
              key={key}
              onClick={() => onChange(active ? "all" : key)}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                active
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              {CHIP_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* 달력 — 매물 있는 날 amber dot */}
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleDaySelect}
        disabled={(day) => dayjs(day).isBefore(baseline, "day")}
        modifiers={{
          past: (day) => dayjs(day).isBefore(baseline, "day"),
          hasAuction: auctionDates,
          weekend: (day) => day.getDay() === 5 || day.getDay() === 6,
          chipSelected: chipSelectedDates,
        }}
        classNames={{
          day: "w-10 h-10 p-0 text-center relative",
          weekday: "text-neutral-500 font-bold text-[11px] w-10 text-center pb-1 uppercase [&:nth-child(6)]:text-red-400 [&:last-child]:text-red-400",
        }}
        modifiersClassNames={{
          past: "opacity-15 pointer-events-none",
          chipSelected: "[&>button]:bg-white [&>button]:text-black [&>button]:font-black",
          weekend: "[&>button]:text-red-400",
          selected:
            "[&>button]:bg-white [&>button]:text-black [&>button]:font-black [&>button]:hover:bg-neutral-100",
          today:
            "before:content-['오늘'] before:absolute before:top-0.5 before:left-1/2 before:-translate-x-1/2 before:text-[7px] before:text-neutral-400 before:font-bold before:whitespace-nowrap before:leading-none",
          hasAuction:
            "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-amber-500 after:rounded-full after:content-['']",
        }}
        components={{
          Week: ({ week, children, ...props }) => {
            const allPast = week.days.every((day) =>
              dayjs(day.date).isBefore(baseline, "day")
            );
            if (allPast) return null;
            return <tr {...props}>{children}</tr>;
          },
          Chevron: ({ orientation, className: cls, ...rest }) => {
            const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
            return <Icon className={cn("w-4 h-4", cls)} {...rest} />;
          },
        }}
      />
    </div>
  );
}
