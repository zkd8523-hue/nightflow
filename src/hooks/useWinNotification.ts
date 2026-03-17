"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";

const WIN_POLL_INTERVAL = 10000; // 10초
const NOTIFIED_WINS_KEY = "nf_notified_wins";

/** 이미 알림을 보낸 낙찰 ID 목록 (localStorage 기반) */
function getNotifiedWins(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_WINS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addNotifiedWin(auctionId: string) {
  try {
    const wins = getNotifiedWins();
    wins.add(auctionId);
    // 최대 50개만 유지 (오래된 것 자동 정리)
    const arr = Array.from(wins).slice(-50);
    localStorage.setItem(NOTIFIED_WINS_KEY, JSON.stringify(arr));
  } catch {
    // localStorage 실패 시 무시
  }
}

/**
 * 글로벌 낙찰 알림 훅
 *
 * 어느 페이지에 있든 내가 낙찰되면 토스트 + 진동 + "내 낙찰 보기" 바로가기를 표시합니다.
 * 경매 상세 페이지(`/auctions/[id]`)에서는 AuctionDetail 자체 토스트가 있으므로 중복 방지합니다.
 */
export function useWinNotification() {
  const router = useRouter();
  const { user } = useAuthStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || user.role !== "user") return;

    const supabase = createClient();

    const poll = async () => {
      try {
        // 현재 경매 상세 페이지에 있으면 스킵 (AuctionDetail 자체 알림 사용)
        if (window.location.pathname.startsWith("/auctions/")) return;

        // status='won'이면서 contact_deadline이 아직 안 지난 낙찰만 조회
        const { data: wonAuctions } = await supabase
          .from("auctions")
          .select("id, club:club_id(name), contact_deadline")
          .eq("winner_id", user.id)
          .eq("status", "won")
          .gt("contact_deadline", new Date().toISOString());

        if (!wonAuctions || wonAuctions.length === 0) return;

        const notified = getNotifiedWins();

        for (const auction of wonAuctions) {
          if (notified.has(auction.id)) continue;

          // 새 낙찰 발견!
          addNotifiedWin(auction.id);

          const clubName = (auction.club as any)?.name || "클럽";

          // 진동
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
          }

          toast.success(`🎉 ${clubName} 테이블에 낙찰되셨습니다!`, {
            description: "MD에게 연락하여 예약을 확정해주세요.",
            duration: 15000,
            position: "top-center",
            action: {
              label: "내 낙찰 보기",
              onClick: () => router.push("/bids?tab=won"),
            },
          });
        }
      } catch (err) {
        logger.error("[WinNotification] poll error:", err);
      }
    };

    // 첫 로드 시 1회 + 주기적 폴링
    poll();
    pollingRef.current = setInterval(poll, WIN_POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user, router]);
}
