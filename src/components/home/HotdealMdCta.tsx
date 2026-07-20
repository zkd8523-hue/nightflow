"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ArrowUp, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { HotdealPreviewSheet } from "./HotdealPreviewSheet";

/**
 * MD/admin에게만 노출되는 홈 행동 유도 띠.
 * Hot Deal Now 섹션 바로 아래(또는 위)에 두 섹션 사이 슬림 amber 띠로 노출.
 *
 * 클릭 시 HotdealPreviewSheet 열림 → 1,2,3 스텝 미리보기 → CTA로 등록 페이지 이동.
 */
export function HotdealMdCta() {
  const { user, isLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (!isMdOrAdmin) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("daily_hotdeals")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString());
      if (!cancelled) setActiveCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, isMdOrAdmin]);

  if (isLoading) return null;
  if (!isMdOrAdmin) return null;
  if (activeCount === null) return null;

  const isEmpty = activeCount === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={`w-full flex items-center gap-2 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform text-left ${
          isEmpty
            ? "bg-amber-500/15 border border-amber-500/40"
            : "bg-card border border-border"
        }`}
      >
        {isEmpty ? (
          <ArrowUp className="w-4 h-4 text-brand-amber shrink-0 animate-bounce" />
        ) : (
          <TrendingUp className="w-4 h-4 text-brand-amber shrink-0" />
        )}
        <p className={`text-[12.5px] font-bold leading-snug flex-1 ${isEmpty ? "text-foreground dark:text-amber-50" : "text-foreground"}`}>
          {isEmpty ? (
            <>
              아직도 테이블이 비었다면, <span className="text-brand-amber">핫딜</span>로 채워봐요!
            </>
          ) : (
            <>
              <span className="text-brand-amber">당일 특가 패키지</span>로 매출을 올려보세요!
            </>
          )}
        </p>
        <ChevronRight className={`w-4 h-4 shrink-0 ${isEmpty ? "text-brand-amber" : "text-muted-foreground"}`} />
      </button>
      <HotdealPreviewSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
