"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMediaItem, PartyMessage } from "@/types/database";

const PAGE_SIZE = 100;

type SenderRel = { id: string; display_name: string | null; profile_image: string | null };

function pickSender(raw: unknown): PartyMessage["sender"] {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as PartyMessage["sender"];
}

/**
 * 조각(파티) 단체채팅 메시지 구독 + 초기 로드 (useOfferMessages 포크).
 * - puzzle_id 기준, 오래된→최신 정렬
 * - Realtime: puzzle_party_messages INSERT
 * - 시스템 메시지(sender_id=null) 포함
 */
export function usePartyMessages(puzzleId: string) {
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // 멤버별 읽음 시각 (카톡식 안읽음 "N" 계산용): userId → last_read_at ISO
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);

  const loadReadState = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_party_read_state", { p_puzzle_id: puzzleId });
    const rows = (data ?? []) as { user_id: string; last_read_at: string }[];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.user_id] = r.last_read_at;
    setReadMap(map);
  }, [puzzleId]);

  const loadInitial = useCallback(async () => {
    const supabase = createClient();
    if (isFirstLoadRef.current) setLoading(true);

    const { data: msgs, error } = await supabase
      .from("puzzle_party_messages")
      .select(
        `id, puzzle_id, sender_id, content, media, is_system, is_deleted, created_at, reply_to, shared_offer_id,
         sender:public_user_profiles!puzzle_party_messages_sender_id_fkey(id, display_name, profile_image)`
      )
      .eq("puzzle_id", puzzleId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      console.error("[usePartyMessages] fetch error", {
        code: error.code,
        message: error.message,
      });
      setMessages([]);
    } else {
      const parsed: PartyMessage[] = (msgs ?? []).map((d) => ({
        id: d.id,
        puzzle_id: d.puzzle_id,
        sender_id: d.sender_id ?? null,
        content: d.content ?? "",
        media: ((d as { media?: ChatMediaItem[] }).media ?? []) as ChatMediaItem[],
        is_system: (d as { is_system?: boolean }).is_system ?? false,
        is_deleted: d.is_deleted,
        created_at: d.created_at,
        reply_to: (d as { reply_to?: string | null }).reply_to ?? null,
        shared_offer_id: (d as { shared_offer_id?: string | null }).shared_offer_id ?? null,
        sender: pickSender((d as { sender?: unknown }).sender),
      }));
      setMessages(parsed);
    }
    setLoading(false);
    isFirstLoadRef.current = false;
  }, [puzzleId]);

  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [puzzleId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 읽음 상태: 최초 + 메시지 수 변화 시 재조회 (내가 보내면 내 포인터 갱신 반영)
  useEffect(() => {
    loadReadState();
  }, [loadReadState, messages.length]);

  // Realtime 구독: 새 메시지
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`party-chat:${puzzleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "puzzle_party_messages",
          filter: `puzzle_id=eq.${puzzleId}`,
        },
        async (payload) => {
          const m = payload.new as {
            id: string;
            puzzle_id: string;
            sender_id: string | null;
            content: string;
            media: ChatMediaItem[] | null;
            is_system: boolean;
            is_deleted: boolean;
            created_at: string;
            reply_to: string | null;
            shared_offer_id: string | null;
          };
          if (m.is_deleted) return;
          let sender: SenderRel | null = null;
          if (m.sender_id) {
            const { data } = await supabase
              .from("public_user_profiles")
              .select("id, display_name, profile_image")
              .eq("id", m.sender_id)
              .maybeSingle();
            sender = data ?? null;
          }
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [
              ...prev,
              {
                id: m.id,
                puzzle_id: m.puzzle_id,
                sender_id: m.sender_id ?? null,
                content: m.content ?? "",
                media: m.media ?? [],
                is_system: m.is_system,
                is_deleted: m.is_deleted,
                created_at: m.created_at,
                reply_to: m.reply_to ?? null,
                shared_offer_id: m.shared_offer_id ?? null,
                sender,
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
          table: "puzzle_party_messages",
          filter: `puzzle_id=eq.${puzzleId}`,
        },
        (payload) => {
          const m = payload.new as { id: string; is_deleted: boolean };
          if (m.is_deleted) {
            setMessages((prev) => prev.filter((x) => x.id !== m.id));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "puzzle_party_reads",
          filter: `puzzle_id=eq.${puzzleId}`,
        },
        (payload) => {
          const r = payload.new as { user_id: string; last_read_at: string } | null;
          if (!r?.user_id) return;
          setReadMap((prev) => ({ ...prev, [r.user_id]: r.last_read_at }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [puzzleId]);

  const addLocalMessage = useCallback((msg: PartyMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const removeLocalMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { messages, loading, readMap, reload: loadInitial, addLocalMessage, removeLocalMessage };
}
