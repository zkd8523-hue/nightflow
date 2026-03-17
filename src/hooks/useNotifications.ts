"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { InAppNotification } from "@/types/database";

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // 알림 목록 조회
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("in_app_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      setNotifications((data as InAppNotification[]) || []);
      setIsLoading(false);
    };

    fetchNotifications();

    // Realtime 구독: 새 알림 즉시 반영
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as InAppNotification;
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20));

          // 경매 상세 페이지에서는 useAuctionRealtime이 이미 Toast를 표시하므로 스킵
          if (
            typeof window !== "undefined" &&
            window.location.pathname.startsWith("/auctions/")
          ) {
            return;
          }

          // outbid 알림: 글로벌 Toast + 진동
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
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
