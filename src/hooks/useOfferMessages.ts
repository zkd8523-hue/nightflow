"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMediaItem, OfferMessage } from "@/types/database";

const PAGE_SIZE = 50;

/**
 * 깃발 오퍼 1:1 채팅 메시지 구독 + 초기 로드 (useChatMessages 포크).
 * - offer_id 기준, 오래된→최신 정렬
 * - Realtime: puzzle_offer_messages INSERT + puzzle_offers UPDATE(읽음 포인터)
 * - 읽음 "1": leaderReadAt / mdReadAt 노출 → MessageRoom 에서 계산
 */
export function useOfferMessages(offerId: string) {
  const [messages, setMessages] = useState<OfferMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderReadAt, setLeaderReadAt] = useState<string | null>(null);
  const [mdReadAt, setMdReadAt] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);

  const loadInitial = useCallback(async () => {
    const supabase = createClient();
    if (isFirstLoadRef.current) setLoading(true);

    const [{ data: msgs, error }, { data: offer }] = await Promise.all([
      supabase
        .from("puzzle_offer_messages")
        .select(
          `id, offer_id, sender_id, content, media, is_deleted, edited_at, created_at,
           sender:public_user_profiles!puzzle_offer_messages_sender_id_fkey(id, display_name, profile_image)`
        )
        .eq("offer_id", offerId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(PAGE_SIZE),
      supabase
        .from("puzzle_offers")
        .select("leader_read_at, md_read_at")
        .eq("id", offerId)
        .maybeSingle(),
    ]);

    if (error) {
      console.error("[useOfferMessages] fetch error", {
        code: error.code,
        message: error.message,
      });
      setMessages([]);
    } else {
      const parsed: OfferMessage[] = (msgs ?? []).map((d) => {
        const rawSender = (d as { sender?: unknown }).sender;
        const sender = Array.isArray(rawSender)
          ? (rawSender[0] as OfferMessage["sender"])
          : (rawSender as OfferMessage["sender"]);
        return {
          id: d.id,
          offer_id: d.offer_id,
          sender_id: d.sender_id,
          content: d.content ?? "",
          media: ((d as { media?: ChatMediaItem[] }).media ?? []) as ChatMediaItem[],
          is_deleted: d.is_deleted,
          edited_at: (d as { edited_at?: string | null }).edited_at ?? null,
          created_at: d.created_at,
          sender,
        };
      });
      setMessages(parsed);
    }
    if (offer) {
      setLeaderReadAt(offer.leader_read_at ?? null);
      setMdReadAt(offer.md_read_at ?? null);
    }
    setLoading(false);
    isFirstLoadRef.current = false;
  }, [offerId]);

  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [offerId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Realtime 구독: 새 메시지 + 읽음 포인터
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`offer-chat:${offerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "puzzle_offer_messages",
          filter: `offer_id=eq.${offerId}`,
        },
        async (payload) => {
          const m = payload.new as {
            id: string;
            offer_id: string;
            sender_id: string;
            content: string;
            media: ChatMediaItem[] | null;
            is_deleted: boolean;
            created_at: string;
          };
          if (m.is_deleted) return;
          const { data: sender } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image")
            .eq("id", m.sender_id)
            .maybeSingle();
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [
              ...prev,
              {
                id: m.id,
                offer_id: m.offer_id,
                sender_id: m.sender_id,
                content: m.content ?? "",
                media: m.media ?? [],
                is_deleted: m.is_deleted,
                edited_at: null,
                created_at: m.created_at,
                sender: sender ?? undefined,
              },
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "puzzle_offer_messages",
          filter: `offer_id=eq.${offerId}`,
        },
        (payload) => {
          const m = payload.new as {
            id: string;
            content: string;
            media: ChatMediaItem[] | null;
            is_deleted: boolean;
            edited_at: string | null;
          };
          setMessages((prev) =>
            prev.map((x) =>
              x.id === m.id
                ? {
                    ...x,
                    content: m.content ?? "",
                    media: m.media ?? [],
                    is_deleted: m.is_deleted,
                    edited_at: m.edited_at ?? null,
                  }
                : x
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "puzzle_offers",
          filter: `id=eq.${offerId}`,
        },
        (payload) => {
          const o = payload.new as {
            leader_read_at: string | null;
            md_read_at: string | null;
          };
          setLeaderReadAt(o.leader_read_at ?? null);
          setMdReadAt(o.md_read_at ?? null);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [offerId]);

  const addLocalMessage = useCallback((msg: OfferMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  // 수정/삭제 옵티미스틱 반영 (realtime UPDATE 도착 전 즉시 갱신)
  const updateLocalMessage = useCallback(
    (id: string, patch: Partial<OfferMessage>) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    []
  );

  return {
    messages,
    loading,
    reload: loadInitial,
    addLocalMessage,
    updateLocalMessage,
    leaderReadAt,
    mdReadAt,
  };
}
