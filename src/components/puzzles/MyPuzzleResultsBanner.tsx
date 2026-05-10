"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Flag } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";

const TERMINAL_STATUSES = ["expired", "matched", "accepted", "cancelled"];
const RECENT_DAYS = 7;
const ACK_KEY_PREFIX = "puzzle_results_ack_";

function getAckSet(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACK_KEY_PREFIX + userId);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveAckSet(userId: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACK_KEY_PREFIX + userId, JSON.stringify(Array.from(set)));
  } catch {}
}

export function MyPuzzleResultsBanner() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    if (isLoading || !user) {
      setPendingIds([]);
      return;
    }
    const supabase = createClient();
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let cancelled = false;
    supabase
      .from("puzzles")
      .select("id")
      .eq("leader_id", user.id)
      .in("status", TERMINAL_STATUSES)
      .gt("created_at", since)
      .then(({ data }) => {
        if (cancelled) return;
        const acked = getAckSet(user.id);
        const ids = (data ?? []).map((p) => p.id as string).filter((id) => !acked.has(id));
        setPendingIds(ids);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isLoading]);

  if (pendingIds.length === 0 || !user) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const acked = getAckSet(user.id);
    pendingIds.forEach((id) => acked.add(id));
    saveAckSet(user.id, acked);
    setPendingIds([]);
    router.push("/bids?tab=puzzle");
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-3 hover:bg-amber-500/15 transition-colors text-left"
    >
      <div className="flex items-center gap-2.5">
        <Flag className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-[13px] font-bold text-amber-400">
          최근 깃발 {pendingIds.length}개의 결과를 확인하세요
        </span>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
    </button>
  );
}
