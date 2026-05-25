"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUp, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * MD/admin에게만 노출되는 홈 행동 유도 띠.
 * Hot Deal Now 섹션 바로 아래(또는 위)에 두 섹션 사이 슬림 amber 띠로 노출.
 *
 * - 활성 핫딜 0개: "⚡ 지금 핫딜 0건. 첫 번째 등록자는 단독 노출"
 * - 활성 핫딜 ≥ 1개: "특가상품 등록하고 상위노출 되어보세요"
 */
export function HotdealMdCta() {
  const { user, isLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const [activeCount, setActiveCount] = useState<number | null>(null);

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
    <Link
      href={isEmpty ? "/md/hotdeal-now?new=1" : "/md/hotdeal-now"}
      className={`flex items-center gap-2 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform ${
        isEmpty
          ? "bg-amber-500/15 border border-amber-500/40"
          : "bg-[#1C1C1E] border border-neutral-800"
      }`}
    >
      {isEmpty ? (
        <ArrowUp className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
      ) : (
        <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
      )}
      <p className={`text-[12.5px] font-bold leading-snug flex-1 ${isEmpty ? "text-amber-50" : "text-white"}`}>
        {isEmpty ? (
          <>
            파트너님! 지금 핫딜 등록하시면 즉시 <span className="text-amber-400">메인에 노출</span>돼요!
          </>
        ) : (
          <>
            특가상품 등록하고 <span className="text-amber-400">상위노출</span> 되어보세요
          </>
        )}
      </p>
      <ChevronRight className={`w-4 h-4 shrink-0 ${isEmpty ? "text-amber-400" : "text-neutral-500"}`} />
    </Link>
  );
}
