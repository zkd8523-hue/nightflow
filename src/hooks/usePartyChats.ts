"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";
import type { PartyChatSummary } from "@/types/database";

/**
 * 내가 참여한 조각(파티) 단체채팅방 목록 + 안읽음 (get_party_chats RPC).
 * 나의 채팅 "조각" 탭 소스. 플래그 OFF면 빈 목록.
 */
export function usePartyChats(userId: string | undefined) {
  const enabled = useOfferChatFlag();
  const [rooms, setRooms] = useState<PartyChatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled || !userId) {
      setRooms([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_party_chats");
    if (error) {
      console.error("[usePartyChats] error", error.message);
      setRooms([]);
    } else {
      setRooms((data ?? []) as PartyChatSummary[]);
    }
    setLoading(false);
  }, [enabled, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 새 메시지/합류 시 목록 갱신
  useEffect(() => {
    if (!enabled || !userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`party-chats:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "puzzle_party_messages" },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, reload]);

  const hasUnread = rooms.some((r) => r.unread);

  return { rooms, hasUnread, loading, reload };
}
