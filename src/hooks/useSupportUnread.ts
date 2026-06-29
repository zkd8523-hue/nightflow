"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 고객 문의(support) 답장 안읽음 여부 (유저 측).
 * admin이 마지막으로 보냈고 아직 안 읽었으면 true.
 * - 라우트 변경 시 재조회 → /contact 방문(읽음 처리) 후 자동 해제
 * - support_messages INSERT 실시간 구독 → admin 답장 즉시 점등
 */
export function useSupportUnread(userId: string | undefined): boolean {
  const [unread, setUnread] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!userId) {
      setUnread(false);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("support_threads")
        .select("last_message_at, user_read_at, last_sender_role")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setUnread(false);
        return;
      }
      const isUnread =
        data.last_sender_role === "admin" &&
        (!data.user_read_at ||
          (!!data.last_message_at &&
            new Date(data.last_message_at) > new Date(data.user_read_at)));
      setUnread(!!isUnread);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`support-unread:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_user_id=eq.${userId}`,
        },
        (payload) => {
          const m = payload.new as { sender_role?: string };
          if (m.sender_role === "admin") setUnread(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return unread;
}
