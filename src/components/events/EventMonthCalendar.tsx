"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 공연 월 격자 달력.
 *
 * 데스크톱 캘린더(국힙캘린더 등)는 셀에 공연 제목을 넣지만 390px에서는 셀 하나가
 * 50px이라 제목이 한 글자도 안 들어간다. 그래서 셀에는 **점과 건수만** 넣고
 * 날짜를 누르면 아래 목록이 그 날짜로 좁혀지는 모바일 표준 방식을 쓴다.
 *
 * ⚠️ 공연만 센다. DJ 라인업은 여기 섞지 않는다 — 공연 탭에 라인업 점을 찍으면
 *    탭을 나눈 의미가 없어진다(라인업 탭에 같은 컴포넌트를 따로 붙이는 게 맞다).
 */

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 기준 오늘 (events/page.tsx·venues와 같은 규약) */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "2026-08" → 그 달의 1일이 무슨 요일인지(0=일)와 며칠까지 있는지 */
function monthShape(ym: string): { firstDow: number; daysInMonth: number } {
  const [y, m] = ym.split("-").map(Number);
  // UTC로 계산한다 — 로컬 타임존이 뭐든 달력 모양은 같아야 한다.
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { firstDow, daysInMonth };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function EventMonthCalendar({
  countsByDate,
  selectedDate,
  onSelectDate,
}: {
  /** "2026-08-29" → 그날 공연 수 */
  countsByDate: Map<string, number>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = todayKST();
  // 선택된 날이 있으면 그 달을, 없으면 오늘이 속한 달을 연다.
  const [ym, setYm] = useState<string>(() => (selectedDate ?? today).slice(0, 7));

  const { firstDow, daysInMonth } = useMemo(() => monthShape(ym), [ym]);
  const [year, month] = ym.split("-").map(Number);

  // 이 달에 공연이 있는 날 수 — 범례에 "31칸 중 10칸"으로 보여준다.
  // 데이터가 얇다는 걸 숨기지 않는다(빈 격자를 그냥 두면 버그처럼 보인다).
  const filledCount = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (countsByDate.get(`${ym}-${String(d).padStart(2, "0")}`)) n++;
    }
    return n;
  }, [countsByDate, ym, daysInMonth]);

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-black text-foreground">
          {year}년 {month}월
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setYm(today.slice(0, 7));
              onSelectDate(null);
            }}
            className="px-2.5 h-7 rounded-full bg-[#1C1C1E] text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            오늘
          </button>
          <button
            onClick={() => setYm(shiftMonth(ym, -1))}
            aria-label="이전 달"
            className="w-7 h-7 rounded-full bg-[#1C1C1E] text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setYm(shiftMonth(ym, 1))}
            aria-label="다음 달"
            className="w-7 h-7 rounded-full bg-[#1C1C1E] text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[9.5px] font-bold pb-0.5 ${
              i === 0 ? "text-[#d4626a]" : i === 6 ? "text-[#5f8ed4]" : "text-muted-foreground"
            }`}
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} className="aspect-[1/1.08]" />;

          const date = `${ym}-${String(day).padStart(2, "0")}`;
          const count = countsByDate.get(date) ?? 0;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const has = count > 0;

          // 공연 없는 날은 누를 수 없다 — 눌러도 빈 목록이 되는 버튼을 만들지 않는다
          // (지역 칩이 "데이터에 있는 지역만" 내는 것과 같은 규칙).
          if (!has) {
            return (
              <div
                key={date}
                className={`aspect-[1/1.08] rounded-md flex flex-col items-center pt-1 ${
                  isToday ? "outline outline-[1.5px] -outline-offset-[1.5px] outline-amber-500" : ""
                }`}
              >
                <span className="font-mono text-[11px] text-[#3a3a40]">{day}</span>
              </div>
            );
          }

          return (
            <button
              key={date}
              onClick={() => onSelectDate(isSelected ? null : date)}
              aria-pressed={isSelected}
              aria-label={`${month}월 ${day}일 공연 ${count}건`}
              className={`aspect-[1/1.08] rounded-md flex flex-col items-center pt-1 gap-0.5 transition-colors ${
                isSelected ? "bg-amber-500" : "bg-white/[0.035] hover:bg-white/[0.07]"
              } ${isToday && !isSelected ? "outline outline-[1.5px] -outline-offset-[1.5px] outline-amber-500" : ""}`}
            >
              <span
                className={`font-mono text-[11px] ${
                  isSelected ? "text-black font-black" : "text-[#d4d4d8]"
                }`}
              >
                {day}
              </span>
              {!isSelected && (
                <span className="flex gap-[2px] flex-wrap justify-center max-w-[26px]">
                  {Array.from({ length: Math.min(count, 4) }, (_, k) => (
                    <span key={k} className="w-[3.5px] h-[3.5px] rounded-full bg-[#ff2f92]" />
                  ))}
                </span>
              )}
              <span
                className={`font-mono text-[8px] leading-none ${
                  isSelected ? "text-black/60" : "text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-[#ff2f92]" aria-hidden="true" />
        <span>
          공연 · {daysInMonth}칸 중 {filledCount}칸
        </span>
      </div>
    </div>
  );
}
