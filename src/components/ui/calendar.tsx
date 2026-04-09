"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * 프로젝트 다크 테마에 맞춘 shadcn 스타일 Calendar.
 * react-day-picker v9 기반. 한국어 locale 기본값.
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ko}
      showOutsideDays={showOutsideDays}
      className={cn("p-1 text-white", className)}
      classNames={{
        months: "flex flex-col gap-2",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center items-center h-9 relative",
        caption_label: "text-sm font-bold text-white",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 h-9 px-1",
        button_previous: cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg",
          "bg-neutral-900 border border-neutral-800 text-neutral-300",
          "hover:bg-neutral-800 hover:text-white transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        ),
        button_next: cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg",
          "bg-neutral-900 border border-neutral-800 text-neutral-300",
          "hover:bg-neutral-800 hover:text-white transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        ),
        month_grid: "border-collapse mx-auto",
        weekdays: "flex",
        weekday:
          "text-neutral-500 font-bold text-[11px] w-10 text-center pb-1 uppercase",
        week: "flex mt-1",
        day: "w-10 h-10 p-0 text-center",
        day_button: cn(
          "w-10 h-10 flex items-center justify-center rounded-lg",
          "text-sm font-medium text-white",
          "hover:bg-neutral-800 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        ),
        today: "",
        selected: "",
        outside: "text-neutral-600",
        disabled: "text-neutral-700 opacity-40 pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      modifiersClassNames={{
        selected:
          "[&>button]:bg-white [&>button]:text-black [&>button]:font-black [&>button]:hover:bg-neutral-100",
        today:
          "[&>button]:ring-1 [&>button]:ring-green-500/60 [&>button]:text-green-400",
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("w-4 h-4", chevronClassName)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
