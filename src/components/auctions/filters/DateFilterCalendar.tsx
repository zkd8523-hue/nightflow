"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getClubEventDate } from "@/lib/utils/date";
import { type DateFilter, parseDateRangeFilter, formatDateRangeFilter } from "@/lib/utils/auctionFilters";

interface DateFilterCalendarProps {
  eventDates: string[]; // unique event_date 목록 (YYYY-MM-DD)
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
  /** 이 날짜 이후는 선택 불가 (YYYY-MM-DD). 미설정 시 무제한 */
  maxDate?: string;
  /** true: 시작일/종료일 두 번 클릭으로 범위 선택 */
  rangeMode?: boolean;
}

const QUICK_CHIPS = ["this_weekend", "next_weekend"] as const;
const CHIP_LABELS: Record<string, string> = {
  this_weekend: "이번주(금/토)",
  next_weekend: "다음주(금/토)",
};

export function DateFilterCalendar({ eventDates, value, onChange, maxDate, rangeMode = false }: DateFilterCalendarProps) {
  const baseline = dayjs(getClubEventDate());
  const maxDay = useMemo(() => (maxDate ? dayjs(maxDate) : null), [maxDate]);

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
      value === "next_weekend" ||
      value.includes("..")
    )
      return undefined;
    return new Date(value + "T12:00:00");
  }, [value]);

  // 범위 선택 (rangeMode)
  const selectedRange = useMemo<DateRange | undefined>(() => {
    if (!rangeMode) return undefined;
    if (value === "all" || value === "this_weekend" || value === "next_weekend") return undefined;
    const range = parseDateRangeFilter(value);
    if (!range) {
      // 단일 날짜를 from 만 채워서 표시
      return { from: new Date(value + "T12:00:00"), to: undefined };
    }
    return {
      from: new Date(range.from + "T12:00:00"),
      to: new Date(range.to + "T12:00:00"),
    };
  }, [value, rangeMode]);

  // 달력 선택 → 특정 날짜 필터
  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      onChange("all");
      return;
    }
    const str = dayjs(day).format("YYYY-MM-DD");
    onChange(str === value ? "all" : str);
  };

  // 범위 선택 핸들러
  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range || !range.from) {
      onChange("all");
      return;
    }
    const fromStr = dayjs(range.from).format("YYYY-MM-DD");
    if (!range.to) {
      onChange(fromStr);
      return;
    }
    const toStr = dayjs(range.to).format("YYYY-MM-DD");
    onChange(fromStr === toStr ? fromStr : formatDateRangeFilter(fromStr, toStr));
  };

  return (
    <div className="space-y-3">
      {/* 퀵 칩 */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange("all")}
          className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
            value === "all"
              ? "bg-inverse text-inverse-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {CHIP_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* 달력 — 매물 있는 날 amber dot */}
      {rangeMode ? (
      <Calendar
        mode="range"
        selected={selectedRange}
        onSelect={handleRangeSelect}
        disabled={(day) =>
          dayjs(day).isBefore(baseline, "day") ||
          (!!maxDay && dayjs(day).isAfter(maxDay, "day"))
        }
        endMonth={maxDay ? maxDay.endOf("month").toDate() : undefined}
        modifiers={{
          past: (day) => dayjs(day).isBefore(baseline, "day"),
          beyondMax: (day) => !!maxDay && dayjs(day).isAfter(maxDay, "day"),
          hasAuction: auctionDates,
          weekend: (day) => day.getDay() === 5 || day.getDay() === 6,
          chipSelected: chipSelectedDates,
          pendingStart: (day) =>
            !!selectedRange?.from && !selectedRange?.to &&
            dayjs(day).isSame(selectedRange.from, "day"),
        }}
        classNames={{
          day: "w-10 h-10 p-0 text-center relative",
          weekday: "text-muted-foreground font-bold text-[11px] w-10 text-center pb-1 uppercase [&:nth-child(6)]:text-red-400 [&:last-child]:text-red-400",
        }}
        modifiersClassNames={{
          past: "opacity-15 pointer-events-none",
          beyondMax: "opacity-15 pointer-events-none",
          chipSelected: "[&>button]:bg-inverse [&>button]:text-inverse-foreground [&>button]:font-black",
          weekend: "[&>button]:text-red-400",
          range_start: "[&>button]:bg-inverse! [&>button]:text-inverse-foreground [&>button]:font-black [&>button]:rounded-r-none [&>button]:transition-none",
          range_end: "[&>button]:bg-inverse! [&>button]:text-inverse-foreground [&>button]:font-black [&>button]:rounded-l-none [&>button]:transition-none",
          range_middle: "[&>button]:bg-white/15! [&>button]:text-foreground [&>button]:rounded-none [&>button]:transition-none",
          pendingStart: "[&>button]:bg-inverse! [&>button]:text-inverse-foreground [&>button]:font-black [&>button]:rounded-lg! [&>button]:transition-none",
          today:
            "before:content-['오늘'] before:absolute before:top-0.5 before:left-1/2 before:-translate-x-1/2 before:text-[7px] before:text-muted-foreground before:font-bold before:whitespace-nowrap before:leading-none",
          hasAuction:
            "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-amber-500 after:rounded-full after:content-['']",
        }}
        components={{
          Week: ({ week, children, ...props }) => {
            const allPast = week.days.every((day) =>
              dayjs(day.date).isBefore(baseline, "day")
            );
            const allBeyond = !!maxDay && week.days.every((day) =>
              dayjs(day.date).isAfter(maxDay, "day")
            );
            if (allPast || allBeyond) return null;
            return <tr {...props}>{children}</tr>;
          },
          Chevron: ({ orientation, className: cls, ...rest }) => {
            const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
            return <Icon className={cn("w-4 h-4", cls)} {...rest} />;
          },
        }}
      />
      ) : (
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleDaySelect}
        disabled={(day) =>
          dayjs(day).isBefore(baseline, "day") ||
          (!!maxDay && dayjs(day).isAfter(maxDay, "day"))
        }
        endMonth={maxDay ? maxDay.endOf("month").toDate() : undefined}
        modifiers={{
          past: (day) => dayjs(day).isBefore(baseline, "day"),
          beyondMax: (day) => !!maxDay && dayjs(day).isAfter(maxDay, "day"),
          hasAuction: auctionDates,
          weekend: (day) => day.getDay() === 5 || day.getDay() === 6,
          chipSelected: chipSelectedDates,
        }}
        classNames={{
          day: "w-10 h-10 p-0 text-center relative",
          weekday: "text-muted-foreground font-bold text-[11px] w-10 text-center pb-1 uppercase [&:nth-child(6)]:text-red-400 [&:last-child]:text-red-400",
        }}
        modifiersClassNames={{
          past: "opacity-15 pointer-events-none",
          beyondMax: "opacity-15 pointer-events-none",
          chipSelected: "[&>button]:bg-inverse [&>button]:text-inverse-foreground [&>button]:font-black",
          weekend: "[&>button]:text-red-400",
          selected:
            "[&>button]:bg-inverse [&>button]:text-inverse-foreground [&>button]:font-black [&>button]:hover:opacity-90",
          today:
            "before:content-['오늘'] before:absolute before:top-0.5 before:left-1/2 before:-translate-x-1/2 before:text-[7px] before:text-muted-foreground before:font-bold before:whitespace-nowrap before:leading-none",
          hasAuction:
            "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-amber-500 after:rounded-full after:content-['']",
        }}
        components={{
          Week: ({ week, children, ...props }) => {
            const allPast = week.days.every((day) =>
              dayjs(day.date).isBefore(baseline, "day")
            );
            const allBeyond = !!maxDay && week.days.every((day) =>
              dayjs(day.date).isAfter(maxDay, "day")
            );
            if (allPast || allBeyond) return null;
            return <tr {...props}>{children}</tr>;
          },
          Chevron: ({ orientation, className: cls, ...rest }) => {
            const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
            return <Icon className={cn("w-4 h-4", cls)} {...rest} />;
          },
        }}
      />
      )}
    </div>
  );
}
