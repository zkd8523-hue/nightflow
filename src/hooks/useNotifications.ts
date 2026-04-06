"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { InAppNotification } from "@/types/database";

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const notificationsRef = useRef<InAppNotification[]>([]);

  // Update ref whenever notifications change so the interval callback always sees the fresh state
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // 알림 목록 조회 (초기 1회 및 30초 단위 폴링)
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const fetchNotifications = async (isPolling = false) => {
      const { data, error } = await supabase
        .from("in_app_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !data) {
        if (!isPolling) setIsLoading(false);
        return;
      }

      const fetchedData = data as InAppNotification[];

      if (!isPolling) {
        setNotifications(fetchedData);
        setIsLoading(false);
      } else {
        const prev = notificationsRef.current;
        // 새로 추가된 알림들 (이전 상태에 없는 ID들을 뽑아냄)
        const newItems = fetchedData.filter(
          (newItem) => !prev.some((prevItem) => prevItem.id === newItem.id)
        );

        if (newItems.length > 0) {
          setNotifications(fetchedData);

          // 경매 상세 페이지에서는 useAuctionRealtime이 토스트를 띄우므로 스킵
          const isAuctionDetail =
            typeof window !== "undefined" &&
            window.location.pathname.startsWith("/auctions/");

          if (!isAuctionDetail) {
            newItems.forEach((newNotification) => {
              if (newNotification.type === "outbid") {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate([200, 100, 200]);
                }
                toast.error(newNotification.title, {
                  description: newNotification.message,
                  duration: 8000,
                  position: "top-center",
                  action: newNotification.action_url
                    ? {
                        label: "재입찰하기",
                        onClick: () => {
                          window.location.href = newNotification.action_url!;
                        },
                      }
                    : undefined,
                });
              } else if (newNotification.type === "md_new_bid") {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate([200, 100, 200]);
                }
                toast.success(newNotification.title, {
                  description: newNotification.message,
                  duration: 6000,
                  position: "top-center",
                  action: newNotification.action_url
                    ? {
                        label: "확인하기",
                        onClick: () => {
                          window.location.href = newNotification.action_url!;
                        },
                      }
                    : undefined,
                });
              }
            });
          }
        }
      }
    };

    // 1. 초기 렌더링 시 알림 가져오기
    fetchNotifications(false);

    // 2. 30초마다 폴링 (Polling)
    let intervalId: ReturnType<typeof setInterval> | null = setInterval(() => {
      fetchNotifications(true);
    }, 30000);

    // 3. Page Visibility API: 비활성 탭에서 폴링 중지
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // 탭 복귀 시 즉시 1회 조회 + 폴링 재시작
        fetchNotifications(true);
        if (!intervalId) {
          intervalId = setInterval(() => {
            fetchNotifications(true);
          }, 30000);
        }
      } else {
        // 비활성 탭: 폴링 중지
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [userId]);

  // 개별 알림 읽음 처리
  const markAsRead = useCallback(
    async (notificationId: string) => {
      const supabase = createClient();
      await supabase
        .from("in_app_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
    },
    []
  );

  // 전체 읽음 처리
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("in_app_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_read", false);

    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      }))
    );
  }, [userId]);

  // 개별 알림 삭제
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      const supabase = createClient();
      await supabase
        .from("in_app_notifications")
        .delete()
        .eq("id", notificationId);

      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    },
    []
  );

  // 모든 알림 삭제
  const deleteAllNotifications = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("in_app_notifications")
      .delete()
      .eq("user_id", userId);

    setNotifications([]);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    isLoading,
  };
}
