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
 *
 * Migration 589부터 room_md_id로 방이 나뉜다. roomMdId=null이면 파티원방.
 * Realtime의 `filter`는 컬럼 하나만 지원해서 puzzle_id로 구독은 유지하고,
 * room_md_id는 클라이언트에서 걸러낸다 — RLS가 이미 소켓 단에서 다른 파트너의
 * 방을 막아주므로 안전하다(파트너 본인 세션은 애초에 남의 방 이벤트를 못 받는다).
 */
export function usePartyMessages(puzzleId: string, roomMdId: string | null = null) {
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // 멤버별 읽음 시각 (카톡식 안읽음 "N" 계산용): userId → last_read_at ISO
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);
  // realtime 콜백 클로저가 최신 roomMdId를 보도록 ref로 미러링 (렌더 중 mutate 금지 — effect에서)
  const roomMdIdRef = useRef(roomMdId);
  useEffect(() => {
    roomMdIdRef.current = roomMdId;
  }, [roomMdId]);

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

    let query = supabase
      .from("puzzle_party_messages")
      .select(
        `id, puzzle_id, sender_id, content, media, is_system, is_deleted, created_at, reply_to, shared_offer_id, room_md_id,
         sender:public_user_profiles!puzzle_party_messages_sender_id_fkey(id, display_name, profile_image)`
      )
      .eq("puzzle_id", puzzleId)
      .eq("is_deleted", false);
    query = roomMdId === null ? query.is("room_md_id", null) : query.eq("room_md_id", roomMdId);
    const { data: msgs, error } = await query
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
        room_md_id: (d as { room_md_id?: string | null }).room_md_id ?? null,
        sender: pickSender((d as { sender?: unknown }).sender),
      }));
      setMessages(parsed);
    }
    setLoading(false);
    isFirstLoadRef.current = false;
  }, [puzzleId, roomMdId]);

  // 방을 전환하면(activeRoomMdId 변경) 이전 방 메시지가 잠깐이라도 보이면 안 되므로
  // 즉시 비우고 새로 로드한다.
  useEffect(() => {
    isFirstLoadRef.current = true;
    setMessages([]);
  }, [puzzleId, roomMdId]);

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
            room_md_id: string | null;
          };
          if (m.is_deleted) return;
          // puzzle 단위로 구독하므로 지금 보고 있는 방(roomMdId)의 메시지만 반영한다.
          // RLS가 소켓에서 이미 다른 파트너의 방은 막아주지만, 방장·멤버는 모든 방의
          // 이벤트를 받을 수 있어 클라이언트에서 한 번 더 걸러야 다른 탭 메시지가 안 섞인다.
          const currentRoom = roomMdIdRef.current;
          if ((m.room_md_id ?? null) !== currentRoom) return;
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
                room_md_id: m.room_md_id ?? null,
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
