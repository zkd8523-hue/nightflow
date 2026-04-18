"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  XCircle,
  Gavel,
  Trophy,
  Clock,
  AlertTriangle,
  Trash2,
  Settings,
  TrendingUp,
  Building2,
  Users,
} from "lucide-react";
import type { InAppNotification, InAppNotificationType } from "@/types/database";

function getFallbackUrl(type: InAppNotification["type"]): string | null {
  if (type.startsWith("puzzle_")) return "/";
  if (type.startsWith("md_")) return "/md/dashboard";
  if (type === "noshow_penalty" || type === "noshow_dismissed") return "/my-penalties";
  if (
    type.startsWith("auction_") ||
    type === "outbid" ||
    type === "fallback_won" ||
    type === "contact_deadline_warning" ||
    type === "contact_expired_no_fault" ||
    type === "contact_expired_user_attempted" ||
    type === "cancellation_confirmed"
  ) return "/notifications";
  return null;
}

type FilterTab = "all" | "auction" | "md";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "auction", label: "경매" },
  { key: "md", label: "MD" },
];

const AUCTION_TYPES: InAppNotificationType[] = [
  "outbid",
  "auction_won",
  "fallback_won",
  "contact_deadline_warning",
  "noshow_penalty",
  "cancellation_confirmed",
  "contact_expired_no_fault",
  "contact_expired_user_attempted",
];

const MD_TYPES: InAppNotificationType[] = [
  "md_approved",
  "md_rejected",
  "md_grade_change",
  "md_new_bid",
  "md_winner_cancelled",
  "md_winner_noshow",
];

function getNotificationIcon(type: InAppNotification["type"]) {
  switch (type) {
    case "md_approved":
      return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
    case "md_rejected":
      return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
    case "outbid":
      return <Gavel className="w-5 h-5 text-amber-500 shrink-0" />;
    case "auction_won":
      return <Trophy className="w-5 h-5 text-green-500 shrink-0" />;
    case "fallback_won":
      return <Trophy className="w-5 h-5 text-amber-500 shrink-0" />;
    case "contact_deadline_warning":
      return <Clock className="w-5 h-5 text-amber-500 shrink-0" />;
    case "noshow_penalty":
      return <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />;
    case "contact_expired_no_fault":
      return <Clock className="w-5 h-5 text-blue-500 shrink-0" />;
    case "contact_expired_user_attempted":
      return <Clock className="w-5 h-5 text-amber-500 shrink-0" />;
    case "cancellation_confirmed":
      return <XCircle className="w-5 h-5 text-neutral-400 shrink-0" />;
    case "md_winner_cancelled":
      return <XCircle className="w-5 h-5 text-amber-500 shrink-0" />;
    case "md_winner_noshow":
      return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
    case "md_new_bid":
      return <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />;
    case "md_grade_change":
      return <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />;
    case "puzzle_offer_received":
      return <Building2 className="w-5 h-5 text-amber-500 shrink-0" />;
    case "puzzle_offer_accepted":
      return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
    case "puzzle_offer_rejected":
      return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
    case "puzzle_leader_changed":
      return <TrendingUp className="w-5 h-5 text-blue-500 shrink-0" />;
    case "puzzle_seat_adjusted":
      return <Users className="w-5 h-5 text-amber-500 shrink-0" />;
    case "puzzle_cancelled":
      return <XCircle className="w-5 h-5 text-neutral-400 shrink-0" />;
    case "puzzle_member_joined":
      return <Users className="w-5 h-5 text-green-500 shrink-0" />;
    default:
      return <Bell className="w-5 h-5 text-neutral-500 shrink-0" />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  return `${months}개월 전`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  // 알림 목록 조회
  const fetchNotifications = useCallback(
    async (offset = 0, append = false) => {
      if (!user) return;
      setIsLoading(true);

      let query = supabase
        .from("in_app_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filter === "auction") {
        query = query.in("type", AUCTION_TYPES);
      } else if (filter === "md") {
        query = query.in("type", MD_TYPES);
      }

      const { data } = await query;
      const results = (data as InAppNotification[]) || [];

      if (append) {
        setNotifications((prev) => [...prev, ...results]);
      } else {
        setNotifications(results);
      }
      setHasMore(results.length === PAGE_SIZE);
      setIsLoading(false);
    },
    [user, supabase, filter]
  );

  useEffect(() => {
    if (user) {
      fetchNotifications(0, false);
    }
  }, [user, fetchNotifications]);

  // Realtime 구독
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-page-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as InAppNotification;

          // 현재 필터에 맞는 알림만 추가
          if (filter === "auction" && !AUCTION_TYPES.includes(newNotif.type)) return;
          if (filter === "md" && !MD_TYPES.includes(newNotif.type)) return;

          setNotifications((prev) => [newNotif, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, filter]);

  const handleLoadMore = () => {
    fetchNotifications(notifications.length, true);
  };

  const handleMarkAsRead = async (id: string) => {
    await supabase
      .from("in_app_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await supabase
      .from("in_app_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      }))
    );
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    let query = supabase.from("in_app_notifications").delete().eq("user_id", user.id);
    if (filter === "auction") query = query.in("type", AUCTION_TYPES);
    else if (filter === "md") query = query.in("type", MD_TYPES);
    await query;
    setNotifications([]);
    window.dispatchEvent(new Event("notifications-changed"));
  };

  const handleNotificationClick = async (notification: InAppNotification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }
    const target = notification.action_url || getFallbackUrl(notification.type);
    if (target) router.push(target);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (userLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/notifications");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-neutral-400" />
            </button>
            <h1 className="text-xl font-black text-white">알림</h1>
            {unreadCount > 0 && (
              <span className="text-[12px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/settings/notifications")}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
            aria-label="알림 설정"
          >
            <Settings className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2 mb-4">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                filter === tab.key
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 액션 바 */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-end gap-3 mb-4">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
              >
                모두 읽음
              </button>
            )}
            <button
              onClick={handleDeleteAll}
              className="text-[12px] text-red-500/70 hover:text-red-400 transition-colors font-bold flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              모두 삭제
            </button>
          </div>
        )}

        {/* 알림 목록 */}
        {isLoading && notifications.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Bell className="w-12 h-12 text-neutral-700 mb-4" />
            <p className="text-[15px] text-neutral-500 font-bold">알림이 없습니다</p>
            <p className="text-[13px] text-neutral-600 mt-1">
              경매 활동 시 알림이 여기에 표시됩니다
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-colors ${
                  notification.is_read
                    ? "opacity-60 hover:opacity-80 hover:bg-neutral-800/30"
                    : "bg-[#1C1C1E] hover:bg-neutral-800/80"
                }`}
              >
                <div className="mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-bold text-neutral-200 truncate">
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                    )}
                  </div>
                  <p className="text-[13px] text-neutral-400 mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-neutral-600">
                      {timeAgo(notification.created_at)}
                    </span>
                    <span className="text-[11px] text-neutral-700">
                      {formatDate(notification.created_at)}
                    </span>
                  </div>
                </div>
              </button>
            ))}

            {/* 더 보기 */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="w-full py-4 text-[13px] text-neutral-500 hover:text-neutral-300 font-bold transition-colors disabled:opacity-50"
              >
                {isLoading ? "불러오는 중..." : "이전 알림 더 보기"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
