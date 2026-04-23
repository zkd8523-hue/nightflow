"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { getClubEventDate } from "@/lib/utils/date";

interface DateGroupProps {
  date: string;
  children: React.ReactNode;
  showCount?: boolean;
  label?: string;
}

export function DateGroup({ date, children, showCount = false, label: customLabel }: DateGroupProps) {
  const clubToday = getClubEventDate();

  const label = useMemo(() => {
    if (customLabel) return customLabel;
    // 깃발 스타일: "4월 24일 (금)"
    const d = dayjs(date).locale("ko");
    return `${d.month() + 1}월 ${d.date()}일 (${d.format("ddd")})`;
  }, [date, customLabel]);

  const dday = useMemo(() => {
    if (customLabel) return null;
    const diff = dayjs(date).diff(dayjs(clubToday), "day");
    if (diff === 0) return "D-Day";
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
  }, [date, customLabel, clubToday]);

  const count = useMemo(() => {
    if (!showCount) return null;
    return Array.isArray(children) ? children.length : 1;
  }, [showCount, children]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 px-1 py-1">
        <div className="w-1 h-[14px] bg-amber-500 rounded-full mt-[1px]" />
        <h3 className="text-[16px] font-black text-white tracking-tight">{label}</h3>
        {dday && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mt-[1px] ${
            dday === "D-Day" ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-400"
          }`}>
            {dday}
          </span>
        )}
        {count !== null && !dday && (
          <span className="text-[11px] text-neutral-500 font-medium">{count}건</span>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}
