"use client";

import { useState } from "react";
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
      {/* 점선 박스 버튼은 "지난 플레이"라는 콘텐츠 자리를 차지해 비어 있는 화면을
          더 비어 보이게 했다. 주 동작이 아니므로 밑줄 텍스트로 낮춘다. */}
      <button
        onClick={() => setOpen(true)}
        className="mx-auto block text-[12px] font-bold text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-dotted transition-colors"
      >
        {isOwner ? "내 라인업 업데이트" : "이 DJ 라인업 제보하기"}
      </button>
      <LineupReportSheet open={open} onOpenChange={setOpen} variant="lineup" />
    </>
  );
}
