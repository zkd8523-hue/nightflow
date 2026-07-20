"use client";

import Image from "next/image";
import { Heart, Eye } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useShotActivity } from "@/hooks/useShotActivity";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shotId: string | null;
}

/**
 * LIVE 활동 시트 (Migration 424) — 작성자 전용.
 * 좋아요한 사람 최상단(❤), 그 다음 최근 본 사람.
 */
export function ShotActivitySheet({ open, onOpenChange, shotId }: Props) {
  const { viewers, loading } = useShotActivity(shotId, open);
  const likeCount = viewers.filter((v) => v.liked).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl p-0 max-h-[80vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <SheetTitle className="text-foreground text-[15px] text-left flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-muted-foreground" />
              {viewers.length}
            </span>
            {likeCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-red-400">
                <Heart className="w-4 h-4 fill-red-400" />
                {likeCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">불러오는 중...</div>
          ) : viewers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-muted-foreground">아직 본 사람이 없어요</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900 px-2 py-1">
              {viewers.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                    {v.image ? (
                      <Image src={v.image} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/50 text-[13px] font-black">
                        {v.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <span className="flex-1 min-w-0 text-foreground text-[14px] font-bold truncate">
                    {v.name}
                  </span>
                  {v.liked && <Heart className="w-4 h-4 fill-red-500 text-red-500 shrink-0" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
