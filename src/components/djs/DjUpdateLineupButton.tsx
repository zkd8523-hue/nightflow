"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { LineupReportSheet } from "@/components/lineups/LineupReportSheet";

/**
 * "내 라인업 업데이트" — 기존 제보 시트(LineupReportSheet)를 세 번째 호출처로
 * 그대로 재사용한다. 인증 여부와 무관하게 노출한다: 제보는 원래 누구나 하는
 * 기능이고, 인증 전 DJ가 "내 라인업이 없네"를 발견하는 순간이 제보 동기가
 * 가장 큰 시점이다.
 *
 * 문구는 보는 사람이 본인인지에 따라 갈린다 — "내 라인업"은 그 DJ 본인(isOwner)
 * 에게만 맞는 말이고, 팬이나 다른 방문자가 보면 소유권을 착각하게 만든다.
 */
export function DjUpdateLineupButton({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-10 rounded-xl border border-dashed border-border text-[12px] font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-1.5"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        {isOwner ? "내 라인업 업데이트" : "이 DJ 라인업 제보하기"}
      </button>
      <LineupReportSheet open={open} onOpenChange={setOpen} variant="lineup" />
    </>
  );
}
