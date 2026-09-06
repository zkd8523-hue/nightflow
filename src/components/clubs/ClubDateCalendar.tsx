"use client";

// 예약 폼 날짜 선택 달력 — 그 클럽이 안 여는 날은 아예 못 고르게 한다.
//
// 왜 네이티브 <input type="date">를 버렸나: 브라우저 기본 달력은 특정 요일만
// 비활성화할 수단이 없다. 손님이 휴무일로 요청을 넣으면 운영자가 뒤늦게
// 되돌려야 하는데, 그 왕복이 예약 하나를 통째로 날린다(2026-09-06).
//
// 스타일·구조는 DateFilterCalendar(경매 필터)를 그대로 따랐다 — 같은 종류의
// 화면을 새로 짜지 않는다.

import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getClubEventDate } from "@/lib/utils/date";
import { isClubOpenOn } from "@/lib/utils/clubOpenDays";
import { isRedDay } from "@/lib/utils/holidays";

const fmt = (d: Date) => dayjs(d).format("YYYY-MM-DD");

export function ClubDateCalendar({
  openDows,
  value,
  onSelect,
}: {
  /** clubs.open_dows — null이면 미설정이라 아무 날도 막지 않는다 */
  openDows: number[] | null;
  /** 선택된 날짜 YYYY-MM-DD ("" 이면 미선택) */
  value: string;
  onSelect: (date: string) => void;
}) {
  // 클럽 영업일 기준(새벽 6시 전은 전날로 친다) — 오늘 새벽에 오늘 밤을 예약하는
  // 흐름이 끊기지 않게 한다.
  const baseline = dayjs(getClubEventDate());
  const closed = (day: Date) => !isClubOpenOn(openDows, fmt(day));

  return (
    <Calendar
      mode="single"
      selected={value ? new Date(value + "T12:00:00") : undefined}
      onSelect={(day) => {
        if (!day) return;
        onSelect(fmt(day));
      }}
      disabled={(day) => dayjs(day).isBefore(baseline, "day") || closed(day)}
      modifiers={{
        past: (day) => dayjs(day).isBefore(baseline, "day"),
        closed,
        redDay: (day) => isRedDay(day, fmt(day)),
      }}
      classNames={{
        day: "w-10 h-10 p-0 text-center relative",
        weekday:
          "text-muted-foreground font-bold text-[11px] w-10 text-center pb-1 uppercase [&:nth-child(6)]:text-red-400 [&:last-child]:text-red-400",
      }}
      modifiersClassNames={{
        past: "opacity-15 pointer-events-none",
        // 휴무일은 지운 듯 흐리게 + 취소선 — 왜 못 고르는지가 보여야 한다.
        closed:
          "opacity-25 pointer-events-none [&>button]:line-through [&>button]:text-muted-foreground",
        redDay: "[&>button]:text-red-400",
        selected:
          "[&>button]:bg-inverse [&>button]:text-inverse-foreground [&>button]:font-black [&>button]:hover:opacity-90",
        today:
          "before:content-['오늘'] before:absolute before:top-0.5 before:left-1/2 before:-translate-x-1/2 before:text-[7px] before:text-muted-foreground before:font-bold before:whitespace-nowrap before:leading-none",
      }}
      components={{
        Week: ({ week, children, ...props }) => {
          // 지난 주는 통째로 감춘다 (DateFilterCalendar와 같은 처리).
          const allPast = week.days.every((d) => dayjs(d.date).isBefore(baseline, "day"));
          if (allPast) return null;
          return <tr {...props}>{children}</tr>;
        },
        Chevron: ({ orientation, className: cls, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("w-4 h-4", cls)} {...rest} />;
        },
      }}
    />
  );
}
