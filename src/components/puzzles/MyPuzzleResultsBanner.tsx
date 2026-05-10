"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";

const TERMINAL_STATUSES = ["expired", "matched", "accepted", "cancelled"];
const RECENT_DAYS = 7;

export function MyPuzzleResultsBanner() {
  const { user, isLoading } = useCurrentUser();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (isLoading || !user) {
      setCount(0);
      return;
    }
    const supabase = createClient();
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let cancelled = false;
    supabase
      .from("puzzles")
      .select("id", { count: "exact", head: true })
      .eq("leader_id", user.id)
      .in("status", TERMINAL_STATUSES)
      .gt("created_at", since)
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? 0);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isLoading]);

  if (count === 0) return null;

  return (
    <Link
      href="/bids?tab=puzzle"
      className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-3 hover:bg-amber-500/15 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <Flag className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-[13px] font-bold text-amber-400">
          최근 깃발 {count}개의 결과를 확인하세요
        </span>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
    </Link>
  );
}
