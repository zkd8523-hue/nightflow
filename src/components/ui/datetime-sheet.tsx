"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import dayjs from "dayjs";
import "dayjs/locale/ko";
dayjs.locale("ko");

interface DateTimeSheetProps {
  value: string; // YYYY-MM-DDTHH:mm
  min?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export function DateTimeSheet({
  value,
  min,
  onChange,
  label = "날짜 및 시간 선택",
  placeholder = "날짜와 시간을 선택하세요",
}: DateTimeSheetProps) {
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleOpen = () => {
    setTempValue(value);
    setOpen(true);
  };

  const handleConfirm = () => {
    if (tempValue) {
      onChange(tempValue);
    }
    setOpen(false);
  };

  const displayText = value
    ? dayjs(value).format("YYYY. MM. DD. a h:mm")
    : placeholder;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full bg-neutral-900 border border-neutral-800 h-11 rounded-md px-3 text-left text-white text-sm flex items-center justify-between hover:border-neutral-700 transition-colors"
      >
        <span className={value ? "text-white" : "text-neutral-500"}>
          {displayText}
        </span>
        <Calendar className="w-4 h-4 text-neutral-500" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-8 pt-4"
        >
          <SheetHeader className="p-0 mb-4">
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />
            <SheetTitle className="text-white text-base font-bold text-center">
              {label}
            </SheetTitle>
            <SheetDescription className="sr-only">
              날짜와 시간을 선택한 후 확인 버튼을 눌러주세요
            </SheetDescription>
          </SheetHeader>

          <div className="flex justify-center py-4">
            <input
              type="datetime-local"
              value={tempValue}
              min={min}
              onChange={(e) => setTempValue(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-base [color-scheme:dark] w-full focus:outline-none focus:border-green-500/50"
            />
          </div>

          <Button
            type="button"
            onClick={handleConfirm}
            className="w-full h-12 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 mt-2"
          >
            확인
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
