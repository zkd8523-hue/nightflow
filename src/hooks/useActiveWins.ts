"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { logger } from "@/lib/utils/logger";

const POLL_INTERVAL = 10000; // 10초

export interface ActiveWin {
  id: string;
  contact_deadline: string;
  club: { name: string } | null;
}

interface UseActiveWinsResult {
  activeWins: ActiveWin[];
  mostUrgent: ActiveWin | null;
}

/**
 * 활성 낙찰 폴링 훅
 *
 * status='won'이면서 contact_deadline이 아직 남은 경매를 지속적으로 조회합니다.
 * WinAlertBanner에서 사용하여 모든 페이지에 낙찰 알림 배너를 표시합니다.
 */
export function useActiveWins(): UseActiveWinsResult {
  const { user } = useAuthStore();
  const [activeWins, setActiveWins] = useState<ActiveWin[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || user.role !== "user") {
      setActiveWins([]);
      return;
    }

    const supabase = createClient();

    const poll = async () => {
      try {
        const { data } = await supabase
          .from("auctions")
          .select("id, contact_deadline, club:club_id(name)")
          .eq("winner_id", user.id)
          .eq("status", "won")
          .gt("contact_deadline", new Date().toISOString())
          .order("contact_deadline", { ascending: true });

        const wins: ActiveWin[] = (data || []).map((d: any) => ({
          id: d.id,
          contact_deadline: d.contact_deadline,
          club: Array.isArray(d.club) ? d.club[0] ?? null : d.club ?? null,
        }));
        setActiveWins(wins);
      } catch (err) {
        logger.error("[useActiveWins] poll error:", err);
      }
    };

    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user]);

  return {
    activeWins,
    mostUrgent: activeWins.length > 0 ? activeWins[0] : null,
  };
}
