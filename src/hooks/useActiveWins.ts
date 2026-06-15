"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { logger } from "@/lib/utils/logger";

const POLL_INTERVAL = 30000; // 30초 (낙찰 배너 갱신은 실시간 불필요 — 다른 알림 폴링과 통일)

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

        interface WinRow {
          id: string;
          contact_deadline: string;
          club: unknown;
        }
        const wins: ActiveWin[] = ((data || []) as unknown as WinRow[]).map((d) => ({
          id: d.id,
          contact_deadline: d.contact_deadline,
          club: Array.isArray(d.club) ? d.club[0] ?? null : d.club ?? null,
        }));
        setActiveWins(wins);
      } catch (err) {
        logger.error("[useActiveWins] poll error:", err);
      }
    };

    const startPolling = () => {
      if (pollingRef.current) return; // 이미 실행 중
      poll(); // 즉시 1회
      pollingRef.current = setInterval(poll, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    // 백그라운드 탭에서는 폴링 중지 (배터리/네트워크 절약)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  return {
    activeWins,
    mostUrgent: activeWins.length > 0 ? activeWins[0] : null,
  };
}
