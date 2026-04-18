"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/utils/logger";

const BID_POLL_INTERVAL = 30000; // 30초
const NOTIFIED_BIDS_KEY = "nf_notified_md_bids";

/** 이미 알림을 보낸 in_app_notifications id 목록 (localStorage 기반) */
function getNotifiedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_BIDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addNotifiedId(notificationId: string) {
  try {
    const ids = getNotifiedIds();
    ids.add(notificationId);
    // 최대 100개만 유지
    const arr = Array.from(ids).slice(-100);
    localStorage.setItem(NOTIFIED_BIDS_KEY, JSON.stringify(arr));
  } catch {
    // localStorage 실패 시 무시
  }
}

/**
 * MD 새 입찰 알림 훅
 *
 * MD 대시보드에서 본인 경매에 새 입찰이 들어오면 toast + 진동으로 알림.
 *
 * 구현 방식 (2026-04-07 변경):
 * 기존: Supabase Realtime postgres_changes로 bids INSERT 구독
 *      → place_bid()가 SECURITY DEFINER로 실행되어 Realtime 이벤트 미수신 가능성
 * 신규: place_bid()가 트랜잭션 내에서 생성하는 in_app_notifications.md_new_bid 폴링
 *      → DB 트랜잭션 보장, MD 인앱 알림과 동일 소스
 *
 * 인터페이스는 유지: (auctionIds, enabled) → MDDashboard.tsx 변경 불필요
 */
export function useBidNotification(auctionIds: string[], enabled: boolean = true) {
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // 의존성 안정화: auctionIds 배열을 join한 문자열 키
    const auctionIdsKey = auctionIds.join(",");

    useEffect(() => {
        if (!enabled || auctionIds.length === 0) return;

        const supabase = createClient();
        const actionUrls = auctionIds.map(id => `/auctions/${id}`);
        // 폴링 시작 시점 이전 알림은 무시 (마운트 직후 과거 알림 폭격 방지)
        const startedAt = new Date().toISOString();

        const poll = async () => {
            try {
                if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

                const { data: notifications, error } = await supabase
                    .from("in_app_notifications")
                    .select("id, message, action_url, created_at")
                    .eq("type", "md_new_bid")
                    .in("action_url", actionUrls)
                    .gte("created_at", startedAt)
                    .order("created_at", { ascending: false })
                    .limit(20);

                if (error) {
                    logger.error("[BidNotification] poll error:", error);
                    return;
                }

                if (!notifications || notifications.length === 0) return;

                const notified = getNotifiedIds();

                for (const n of notifications) {
                    if (notified.has(n.id)) continue;
                    addNotifiedId(n.id);

                    // 진동
                    if (typeof window !== "undefined" && window.navigator?.vibrate) {
                        window.navigator.vibrate([200, 100, 200]);
                    }

                    toast.success("새 입찰이 들어왔습니다", {
                        description: n.message,
                        duration: 5000,
                        position: "top-center",
                        action: {
                            label: "확인하기",
                            onClick: () => {
                                if (n.action_url) window.location.href = n.action_url;
                            },
                        },
                        cancel: {
                            label: "닫기",
                            onClick: () => {},
                        },
                    });
                }
            } catch (err) {
                logger.error("[BidNotification] unexpected error:", err);
            }
        };

        const startPolling = () => {
            if (pollingRef.current) return;
            poll();
            pollingRef.current = setInterval(poll, BID_POLL_INTERVAL);
        };

        const stopPolling = () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auctionIdsKey, enabled]);
}
