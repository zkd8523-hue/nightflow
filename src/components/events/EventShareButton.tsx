"use client";

import { Share2 } from "lucide-react";
import { shareEvent } from "@/lib/utils/share";

interface EventShareButtonProps {
  eventDate: string;
  slug: string;
  title: string;
  venue: string;
  area?: string | null;
  performerNames?: string[];
}

/** 브레드크럼 행 오른쪽 끝에 붙는 원형 아이콘 버튼 (라인업 페이지와 같은 자리). */
export function EventShareButton({ eventDate, slug, title, venue, area, performerNames }: EventShareButtonProps) {
  return (
    <button
      onClick={() => shareEvent({ eventDate, slug, title, venue, area, performerNames })}
      aria-label="공연 공유하기"
      className="ml-auto shrink-0 w-11 h-11 -my-2 flex items-center justify-center rounded-full hover:bg-muted hover:text-foreground transition-colors"
    >
      <Share2 className="w-5 h-5" />
    </button>
  );
}
