"use client";

import { useState } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import { Wine, X } from "lucide-react";

dayjs.extend(relativeTime);
dayjs.locale("ko");
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  url: string;
  updatedAt: string | null;
  clubName: string;
}

export function DrinkMenuViewer({ url, updatedAt, clubName }: Props) {
  const [open, setOpen] = useState(false);

  const isStale = updatedAt
    ? dayjs().diff(dayjs(updatedAt), "day") > 30
    : false;
  const updatedLabel = updatedAt
    ? dayjs(updatedAt).fromNow()
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 p-3 bg-[#0A0A0A] rounded-xl border border-amber-500/30 hover:border-amber-500/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Wine className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-left">
            <p className="text-[14px] font-bold text-white">주대표 보기</p>
            {updatedLabel && (
              <p
                className={`text-[11px] ${
                  isStale ? "text-red-400" : "text-neutral-500"
                }`}
              >
                {updatedLabel} 갱신
                {isStale && " · 오래된 정보일 수 있어요"}
              </p>
            )}
          </div>
        </div>
        <span className="text-[11px] text-amber-400 font-semibold">열기</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl bg-[#0A0A0A] border-neutral-800 p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {clubName} 주대표
          </DialogTitle>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div>
              <p className="text-[14px] font-bold text-white">
                {clubName} 주대표
              </p>
              {updatedLabel && (
                <p
                  className={`text-[11px] ${
                    isStale ? "text-red-400" : "text-neutral-500"
                  }`}
                >
                  {updatedLabel} 갱신
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-800"
            >
              <X className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
          <div className="relative w-full max-h-[80vh] overflow-auto">
            <Image
              src={url}
              alt={`${clubName} 주대표`}
              width={1200}
              height={1600}
              className="w-full h-auto object-contain"
              unoptimized
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
