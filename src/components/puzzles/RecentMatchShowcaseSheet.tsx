"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { getPublicIncludes } from "@/lib/utils/liquor";

export type RecentMatchedPuzzle = {
  id: string;
  area: string;
  event_date: string;
  target_count: number;
  total_budget: number | null;
  budget_per_person: number;
  notes: string | null;
  matched_at: string;
  club_name: string | null;
  offer_includes: string[];
  offer_comment: string | null;
  md_display_name: string | null;
  md_instagram: string | null;
};

/**
 * 전체 플랫폼 최근 성사 깃발 1건을 RPC로 받아 상태에 보관.
 * "이 정도는 받아야죠" 쇼케이스 시트(RecentMatchShowcaseSheet)와 함께 사용.
 * 홈/깃발 상세 양쪽에서 동일하게 쓰도록 훅 + 시트를 분리.
 */
export function useRecentMatchedPuzzle(enabled: boolean = true) {
  const supabase = createClient();
  const [recentMatchedPuzzle, setRecentMatchedPuzzle] = useState<RecentMatchedPuzzle | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_recent_matched_puzzle");
      if (error) return;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!cancelled && row) setRecentMatchedPuzzle(row as RecentMatchedPuzzle);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, enabled]);

  return recentMatchedPuzzle;
}

interface RecentMatchShowcaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recentMatchedPuzzle: RecentMatchedPuzzle | null;
  /** "나도 깃발꽂기" 링크 — 로그인 여부에 따라 호출부에서 결정 */
  ctaHref: string;
}

export function RecentMatchShowcaseSheet({
  open,
  onOpenChange,
  recentMatchedPuzzle,
  ctaHref,
}: RecentMatchShowcaseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto bg-background border-border rounded-t-3xl px-5 pt-5 pb-8 max-h-[80vh] overflow-y-auto gap-2"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-1">
          <SheetTitle className="text-foreground text-[24px] font-black tracking-tight leading-tight">
            😎 이 정도는 받아야죠
          </SheetTitle>
        </SheetHeader>
        {recentMatchedPuzzle && (
          <div className="space-y-3">
            <div className="bg-card rounded-2xl border border-border p-4 space-y-2 relative">
              <span className="absolute top-3 right-3 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full leading-none">
                성사됨
              </span>
              <div>
                <p className="text-[14px] font-medium text-muted-foreground break-keep">
                  {recentMatchedPuzzle.notes || `${recentMatchedPuzzle.area}에서 모여요`}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  {recentMatchedPuzzle.area} · {recentMatchedPuzzle.target_count}명
                </p>
              </div>
              <div className="text-[20px] font-black text-money tracking-tight">
                예산{" "}
                {(
                  recentMatchedPuzzle.total_budget ??
                  recentMatchedPuzzle.budget_per_person * recentMatchedPuzzle.target_count
                ).toLocaleString()}
                원
              </div>
              {recentMatchedPuzzle.club_name && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-[17px] font-black text-brand-amber tracking-tight">
                      {recentMatchedPuzzle.club_name}
                    </p>
                    {recentMatchedPuzzle.md_instagram && (
                      <p className="text-[11.5px] text-muted-foreground font-medium">
                        @{recentMatchedPuzzle.md_instagram}
                      </p>
                    )}
                  </div>
                  {(() => {
                    const pub = getPublicIncludes(recentMatchedPuzzle.offer_includes);
                    // 매치 카드는 원본 이름 그대로 노출 (모엣 샹동 5병 등). 분류만 활용.
                    const liquorItems: string[] = [];
                    const extraItems: string[] = [];
                    for (const item of recentMatchedPuzzle.offer_includes) {
                      if (
                        pub.liquorCategories.some((c) => item.includes(c.split(" ")[0])) ||
                        /\d+병/.test(item)
                      ) {
                        liquorItems.push(item);
                      } else {
                        extraItems.push(item);
                      }
                    }
                    return (
                      <div className="space-y-1">
                        {liquorItems.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {liquorItems.map((item) => (
                              <span
                                key={item}
                                className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30"
                              >
                                🍾 {item}
                              </span>
                            ))}
                          </div>
                        )}
                        {extraItems.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {extraItems.map((ext) => (
                              <span
                                key={ext}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-card text-muted-foreground border border-border"
                              >
                                {ext}
                              </span>
                            ))}
                          </div>
                        )}
                        {recentMatchedPuzzle.offer_comment && (
                          <p className="text-[12px] text-foreground/80 italic leading-snug pt-1">
                            &ldquo;{recentMatchedPuzzle.offer_comment}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            {/* 인스타 일반 예약 대비 추가 혜택 — 이 쇼케이스 매치 전용 하드코딩 사실 */}
            <div className="flex items-center justify-center gap-2 px-4 py-0 -mt-2 mb-1">
              <span className="text-[22px] leading-none">🎉</span>
              <p className="text-[18px] font-black text-brand-amber leading-snug break-keep text-center tracking-tight">
                <span className="text-shimmer-gold">당일 예약보다</span>{" "}
                <span className="text-brand-amber">30만원치 더</span> 받았어요
              </p>
            </div>
            <div className="text-center space-y-1.5">
              <Link
                href={ctaHref}
                onClick={() => onOpenChange(false)}
                className="flex flex-col items-center justify-center w-full h-12 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black rounded-2xl shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all leading-tight"
              >
                <span className="font-black text-[15px]">⛳ 나도 깃발꽂기</span>
                <span className="text-[10px] font-bold text-black/55 mt-0.5">
                  &nbsp;모든 서비스 무료
                </span>
              </Link>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
