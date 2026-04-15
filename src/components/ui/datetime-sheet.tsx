"use client";

import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import dayjs from "dayjs";
import "dayjs/locale/ko";
dayjs.locale("ko");

interface DateTimeSheetProps {
  /** "YYYY-MM-DDTHH:mm" 형식 (date-only 모드에서는 "YYYY-MM-DD") */
  value: string;
  /** "YYYY-MM-DDTHH:mm" (포함). 이 값보다 이전 날짜/시간은 비활성 */
  min?: string;
  /** "YYYY-MM-DDTHH:mm" (포함). 이 값보다 이후 날짜는 비활성 */
  max?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** "datetime" (기본): 달력+시간 / "time-only": 시간만 (날짜 고정) / "date-2": 2개 버튼으로 날짜 선택+시간 / "date-only": 달력만 */
  mode?: "datetime" | "time-only" | "date-2" | "date-only";
  /** time-only 모드에서 고정할 날짜 (YYYY-MM-DD) */
  fixedDate?: string;
  /** date-2 모드에서 보여줄 날짜 옵션 2개 */
  dateOptions?: { label: string; value: string; minTime?: string; maxTime?: string; defaultTime?: string }[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDatePart(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = dayjs(value);
  if (!d.isValid()) return undefined;
  return d.startOf("day").toDate();
}

function parseTimePart(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = dayjs(value);
  if (!d.isValid()) return fallback;
  return d.format("HH:mm");
}

export function DateTimeSheet({
  value,
  min,
  max,
  onChange,
  label = "날짜 및 시간 선택",
  placeholder = "날짜와 시간을 선택하세요",
  mode = "datetime",
  fixedDate,
  dateOptions,
}: DateTimeSheetProps) {
  const isTimeOnly = mode === "time-only";
  const isDate2 = mode === "date-2";
  const isDateOnly = mode === "date-only";
  const [open, setOpen] = useState(false);

  const [tempDate, setTempDate] = useState<Date | undefined>(() =>
    parseDatePart(value)
  );
  const [tempTime, setTempTime] = useState<string>(() =>
    parseTimePart(value, "22:00")
  );

  const [tempDateStr, setTempDateStr] = useState<string>(() =>
    parseDatePart(value) ? dayjs(value).format("YYYY-MM-DD") : (dateOptions?.[0]?.value ?? "")
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTempDate(
        isTimeOnly && fixedDate
          ? dayjs(fixedDate).startOf("day").toDate()
          : parseDatePart(value)
      );
      const initDateStr = parseDatePart(value) ? dayjs(value).format("YYYY-MM-DD") : (dateOptions?.[0]?.value ?? "");
      setTempDateStr(initDateStr);
      const matchedOpt = dateOptions?.find(o => o.value === initDateStr);
      setTempTime(parseTimePart(value, matchedOpt?.defaultTime ?? "22:00"));
    }
    setOpen(next);
  };

  const minDate = useMemo(
    () => (min ? dayjs(min).startOf("day").toDate() : undefined),
    [min]
  );
  const maxDate = useMemo(
    () => (max ? dayjs(max).startOf("day").toDate() : undefined),
    [max]
  );

  const disabledDays = useMemo(() => {
    const rules: Parameters<typeof Calendar>[0]["disabled"] = [];
    if (minDate) (rules as Array<unknown>).push({ before: minDate });
    if (maxDate) (rules as Array<unknown>).push({ after: maxDate });
    return rules && (rules as Array<unknown>).length > 0 ? rules : undefined;
  }, [minDate, maxDate]);

  const handleConfirm = () => {
    if (isDateOnly) {
      if (!tempDate) return;
      onChange(dayjs(tempDate).format("YYYY-MM-DD"));
      setOpen(false);
      return;
    }
    if (isDate2) {
      if (!tempDateStr || !TIME_RE.test(tempTime)) return;
      onChange(`${tempDateStr}T${tempTime}`);
      setOpen(false);
      return;
    }
    if (!tempDate || !TIME_RE.test(tempTime)) return;
    const combined = `${dayjs(tempDate).format("YYYY-MM-DD")}T${tempTime}`;
    onChange(combined);
    setOpen(false);
  };

  const canConfirm = isDateOnly
    ? Boolean(tempDate)
    : isDate2
    ? Boolean(tempDateStr) && TIME_RE.test(tempTime)
    : Boolean(tempDate) && TIME_RE.test(tempTime);

  const displayText = value
    ? isDateOnly
      ? dayjs(value).format("YYYY. MM. DD. (ddd)")
      : dayjs(value).format("YYYY. MM. DD. (ddd) a h:mm")
    : placeholder;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="w-full bg-neutral-900 border border-neutral-800 h-11 rounded-md px-3 text-left text-white text-sm flex items-center justify-between hover:border-neutral-700 transition-colors"
      >
        <span className={value ? "text-white" : "text-neutral-500"}>
          {displayText}
        </span>
        <CalendarIcon className="w-4 h-4 text-neutral-500" />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-8 pt-4 max-h-[92vh] overflow-y-auto"
        >
         <div className="max-w-sm mx-auto w-full">
          <SheetHeader className="p-0 mb-3">
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />
            <SheetTitle className="text-white text-base font-bold text-center">
              {label}
            </SheetTitle>
            <SheetDescription className="sr-only">
              날짜와 시간을 선택한 후 확인 버튼을 눌러주세요
            </SheetDescription>
          </SheetHeader>

          {/* 날짜 2버튼 (date-2 모드) */}
          {isDate2 && dateOptions && (
            <div className="flex gap-2 mb-2">
              {dateOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTempDateStr(opt.value);
                    // 범위 벗어나면 defaultTime → minTime 순으로 폴백
                    const inRange = (!opt.minTime || tempTime >= opt.minTime) && (!opt.maxTime || tempTime <= opt.maxTime);
                    if (!inRange) setTempTime(opt.defaultTime ?? opt.minTime ?? "22:00");
                  }}
                  className={`flex-1 h-11 rounded-xl text-[13px] font-bold transition-all ${
                    tempDateStr === opt.value
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* 달력 (datetime / date-only 모드에서) */}
          {!isTimeOnly && !isDate2 && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-2">
              <Calendar
                mode="single"
                selected={tempDate}
                onSelect={(date) => {
                  setTempDate(date);
                  // date-only 모드: 날짜 선택 즉시 확인
                  if (isDateOnly && date) {
                    onChange(dayjs(date).format("YYYY-MM-DD"));
                    setOpen(false);
                  }
                }}
                disabled={disabledDays}
                defaultMonth={tempDate ?? minDate ?? new Date()}
                startMonth={minDate}
                endMonth={maxDate}
              />
            </div>
          )}

          {/* 시간 선택 (date-only 모드에서는 숨김) */}
          {!isDateOnly && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-bold uppercase mb-2">
                <Clock className="w-3.5 h-3.5" />
                입장 시간
              </div>

              {(() => {
                const activeOpt = isDate2 ? dateOptions?.find(o => o.value === tempDateStr) : undefined;
                return (
                  <input
                    type="time"
                    value={tempTime}
                    min={activeOpt?.minTime}
                    max={activeOpt?.maxTime}
                    onChange={(e) => setTempTime(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-base [color-scheme:dark] focus:outline-none focus:border-green-500/50"
                  />
                );
              })()}
            </div>
          )}

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full h-12 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed mt-5"
          >
            확인
          </Button>
         </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
