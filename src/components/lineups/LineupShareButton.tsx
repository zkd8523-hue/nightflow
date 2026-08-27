"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareLineup } from "@/lib/utils/share";

interface LineupShareButtonProps {
  clubId: string;
  clubName: string;
  eventDate: string;
  eventTitle?: string | null;
  djNames?: string[];
}

/** BackButton과 같은 자리(헤더 행)에 짝을 맞추는 원형 아이콘 버튼. */
export function LineupShareButton({ clubId, clubName, eventDate, eventTitle, djNames }: LineupShareButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => shareLineup({ clubId, clubName, eventDate, eventTitle, djNames })}
      aria-label="라인업 공유하기"
      className="rounded-full bg-card border border-border text-muted-foreground"
    >
      <Share2 className="w-5 h-5" />
    </Button>
  );
}
