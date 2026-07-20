"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUp, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SharePreviewSheet } from "./SharePreviewSheet";
import { getActiveWeekStartISO } from "@/lib/utils/hotdeal";

/**
 * MD/admin에게만 노출되는 조각(share) 행동 유도 띠.
 *
 * A) 슬롯 미차지 → 미리보기 Sheet + "클럽당 1명만 조각을 올릴 수 있어요."
 * B) 슬롯 차지 → 대시보드 조각 섹션으로 바로 이동 + "내 조각 세팅하기"
 */
export function ShareMdCta() {
  const { user, isLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const [hasClaimed, setHasClaimed] = useState<boolean | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (!isMdOrAdmin || !user?.id) return;
    let cancelled = false;
    (async () => {
      const thisWeekISO = getActiveWeekStartISO();
      const { data } = await supabase
        .from("weekly_share_slots")
        .select("id")
        .eq("md_id", user.id)
        .eq("week_start", thisWeekISO)
        .limit(1);
      if (cancelled) return;
      setHasClaimed((data?.length ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [supabase, isMdOrAdmin, user?.id]);

  if (isLoading) return null;
  if (!isMdOrAdmin) return null;
  if (hasClaimed === null) return null;

  if (hasClaimed) {
    return (
      <Link
        href="/md/dashboard?section=share"
        className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-card border border-border active:scale-[0.99] transition-transform"
      >
        <Sparkles className="w-4 h-4 text-brand-amber shrink-0" />
        <p className="text-[12.5px] font-bold leading-snug flex-1 text-foreground">
          <span className="text-brand-amber">내 조각</span> 세팅하기
        </p>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-amber-500/20 border border-amber-500/70 active:scale-[0.99] transition-transform text-left"
      >
        <ArrowUp className="w-4 h-4 text-brand-amber shrink-0 animate-bounce" />
        <p className="text-[12.5px] font-bold leading-snug flex-1 text-foreground dark:text-amber-50">
          클럽당 1명만 <span className="text-brand-amber">조각</span>을 올릴 수 있어요. <span className="text-brand-amber dark:text-brand-amber/60 font-medium">(선착순 마감)</span>
        </p>
        <ChevronRight className="w-4 h-4 shrink-0 text-brand-amber" />
      </button>
      <SharePreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}
