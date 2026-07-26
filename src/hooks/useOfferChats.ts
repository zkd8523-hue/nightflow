"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";

export interface OfferChatSummary {
  offer_id: string;
  puzzle_id: string;
  offer_status: string;
  area: string;
  event_date: string;
  budget: number | null;
  is_recruiting_party: boolean;
  my_role: "leader" | "md";
  counterpart_id: string;
  counterpart_name: string | null;
  counterpart_image: string | null;
  last_content: string;
  last_at: string;
  last_sender_id: string;
  unread: boolean;
  /** Migration 484: 안읽은 메시지 개수 (카톡식 N 뱃지). 구버전 RPC면 undefined */
  unread_count?: number;
}

/**
 * 내가 참여한 오퍼 채팅 목록 + 안읽음 여부.
 * /messages 목록과 하단 탭 점의 단일 소스 (get_offer_chats RPC).
 * 플래그 OFF면 빈 목록 반환(진입점·점 자동 숨김).
 */
export function useOfferChats(userId: string | undefined) {
  const enabled = useOfferChatFlag();
  const [chats, setChats] = useState<OfferChatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled || !userId) {
      setChats([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_offer_chats");
    if (error) {
      console.error("[useOfferChats] error", error.message);
      setChats([]);
    } else {
      setChats((data ?? []) as OfferChatSummary[]);
    }
    setLoading(false);
  }, [enabled, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 새 메시지/읽음 변화 시 목록 갱신
  useEffect(() => {
    if (!enabled || !userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`offer-chats:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "puzzle_offer_messages" },
        () => reload()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "puzzle_offers" },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, reload]);

  const hasUnread = chats.some((c) => c.unread);

  return { chats, hasUnread, loading, reload };
}
