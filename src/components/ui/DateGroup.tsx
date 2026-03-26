"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { getClubEventDate } from "@/lib/utils/date";

interface DateGroupProps {
  date: string;
  children: React.ReactNode;
  showCount?: boolean;
  label?: string;  // 커스텀 레이블 (없으면 날짜 자동 계산)
}

export function DateGroup({ date, children, showCount = false, label: customLabel }: DateGroupProps) {
  const isCustom = !!customLabel;

  const label = useMemo(() => {
    if (customLabel) return customLabel;
    const clubToday = getClubEventDate();
    const clubYesterday = dayjs(clubToday).subtract(1, "day").format("YYYY-MM-DD");
    const clubTomorrow = dayjs(clubToday).add(1, "day").format("YYYY-MM-DD");

    const formatted = dayjs(date).locale("ko").format("M/D(ddd)");
    if (date === clubToday) return `오늘 · ${formatted}`;
    if (date === clubYesterday) return `어제 · ${formatted}`;
    if (date === clubTomorrow) return `내일 · ${formatted}`;
    return formatted;
  }, [date, customLabel]);

  const count = useMemo(() => {
    if (!showCount) return null;
    return Array.isArray(children) ? children.length : 1;
  }, [showCount, children]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-bold ${isCustom ? "text-amber-400" : "text-neutral-400"}`}>
          {isCustom && "🔥 "}{label}
        </span>
        {count !== null && (
          <span className="text-[11px] text-neutral-600 font-medium">{count}건</span>
        )}
        <div className="flex-1 h-px bg-neutral-800/50" />
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}
