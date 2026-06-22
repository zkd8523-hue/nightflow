"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, ChatRoomCode } from "@/types/database";

const PAGE_SIZE = 30;

/**
 * 특정 방의 채팅 메시지 구독 + 초기 로드
 * - 최신순 30개 페치
 * - Realtime INSERT/DELETE 구독
 */
export function useChatMessages(room: ChatRoomCode) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoadRef = useRef(true);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const loadInitial = useCallback(async () => {
    const supabase = createClient();
    // 첫 로드만 loading=true. 이후 reload는 background fetch (깜빡임 방지)
    if (isFirstLoadRef.current) setLoading(true);
    let query = supabase
      .from("chat_messages")
      .select(
        `
        id, room, author_id, parent_id, reply_count, content, media, author_area, club_tags, is_deleted, created_at, quoted_message_id,
        author:public_user_profiles!chat_messages_author_id_fkey(id, display_name, profile_image),
        quoted_message:chat_messages!quoted_message_id(
          id, room, author_id, content, media, author_area, is_deleted, created_at,
          author:public_user_profiles!chat_messages_author_id_fkey(id, display_name, profile_image)
        )
      `
      )
      .eq("room", room)
      .eq("is_deleted", false)
      .is("parent_id", null);
    // 프로덕션 빌드에선 테스트 계정 메시지 제외 (Migration 317)
    if (process.env.NODE_ENV === "production") {
      query = query.eq("is_test", false);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      console.error("[useChatMessages] fetch error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      setMessages([]);
    } else {
      const parsed: ChatMessage[] = (data ?? []).map((d) => {
        const rawAuthor = (d as { author?: unknown }).author;
        const authorObj = Array.isArray(rawAuthor)
          ? (rawAuthor[0] as ChatMessage["author"])
          : (rawAuthor as ChatMessage["author"]);
        const rawQuoted = (d as { quoted_message?: unknown }).quoted_message;
        const quotedRaw = Array.isArray(rawQuoted)
          ? (rawQuoted[0] as Record<string, unknown> | undefined)
          : (rawQuoted as Record<string, unknown> | null | undefined);
        let quotedObj: ChatMessage["quoted_message"] = null;
        if (quotedRaw) {
          const qAuthor = Array.isArray(quotedRaw.author)
            ? (quotedRaw.author[0] as ChatMessage["author"])
            : (quotedRaw.author as ChatMessage["author"]);
          quotedObj = {
            id: quotedRaw.id as string,
            room: quotedRaw.room as ChatRoomCode,
            author_id: quotedRaw.author_id as string,
            content: (quotedRaw.content as string) ?? "",
            media: (quotedRaw.media as ChatMessage["media"]) ?? [],
            author_area:
              (quotedRaw.author_area as ChatMessage["author_area"]) ?? null,
            is_deleted: (quotedRaw.is_deleted as boolean) ?? false,
            created_at: quotedRaw.created_at as string,
            author: qAuthor,
          };
        }
        return {
          id: d.id,
          room: d.room as ChatRoomCode,
          author_id: d.author_id,
          parent_id:
            (d as { parent_id?: string | null }).parent_id ?? null,
          reply_count:
            (d as { reply_count?: number }).reply_count ?? 0,
          content: d.content,
          media:
            ((d as { media?: ChatMessage["media"] }).media ?? []) as ChatMessage["media"],
          author_area:
            (d as { author_area?: ChatMessage["author_area"] }).author_area ??
            null,
          club_tags:
            ((d as { club_tags?: string[] }).club_tags ?? []) as string[],
          is_deleted: d.is_deleted,
          created_at: d.created_at,
          author: authorObj,
          quoted_message_id:
            (d as { quoted_message_id?: string | null }).quoted_message_id ??
            null,
          quoted_message: quotedObj,
        };
      });
      // 오래된 → 최신 순으로 정렬 (UI에서 자연스럽게)
      parsed.reverse();
      setMessages(parsed);
    }
    setLoading(false);
    isFirstLoadRef.current = false;
  }, [room]);

  // 방 전환 시 첫 로드 깜빡임은 다시 보여줘야 자연스러움
  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [room]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Realtime 구독
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${room}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room=eq.${room}`,
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            room: string;
            author_id: string;
            parent_id: string | null;
            reply_count: number;
            content: string;
            media: ChatMessage["media"] | null;
            author_area: ChatMessage["author_area"] | null;
            club_tags: string[] | null;
            is_deleted: boolean;
            created_at: string;
            quoted_message_id: string | null;
          };
          if (newMsg.is_deleted) return;
          // 답글은 타임라인에 추가하지 않되, 부모 reply_count 옵티미스틱 +1
          if (newMsg.parent_id) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === newMsg.parent_id
                  ? { ...m, reply_count: m.reply_count + 1 }
                  : m
              )
            );
            return;
          }
          // 작성자 프로필 조인
          const { data: author } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image")
            .eq("id", newMsg.author_id)
            .maybeSingle();
          // 인용 메시지(공유) 조인
          let quotedObj: ChatMessage["quoted_message"] = null;
          if (newMsg.quoted_message_id) {
            const { data: q } = await supabase
              .from("chat_messages")
              .select(
                `id, room, author_id, content, media, author_area, is_deleted, created_at,
                 author:public_user_profiles!author_id(id, display_name, profile_image)`
              )
              .eq("id", newMsg.quoted_message_id)
              .maybeSingle();
            if (q) {
              const qAuthorRaw = (q as { author?: unknown }).author;
              const qAuthor = Array.isArray(qAuthorRaw)
                ? (qAuthorRaw[0] as ChatMessage["author"])
                : (qAuthorRaw as ChatMessage["author"]);
              quotedObj = {
                id: q.id,
                room: q.room as ChatRoomCode,
                author_id: q.author_id,
                content: q.content ?? "",
                media: (q.media as ChatMessage["media"]) ?? [],
                author_area:
                  (q.author_area as ChatMessage["author_area"]) ?? null,
                is_deleted: q.is_deleted ?? false,
                created_at: q.created_at,
                author: qAuthor,
              };
            }
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                id: newMsg.id,
                room: newMsg.room as ChatRoomCode,
                author_id: newMsg.author_id,
                parent_id: newMsg.parent_id,
                reply_count: newMsg.reply_count ?? 0,
                content: newMsg.content,
                media: newMsg.media ?? [],
                author_area: newMsg.author_area ?? null,
                club_tags: newMsg.club_tags ?? [],
                is_deleted: newMsg.is_deleted,
                created_at: newMsg.created_at,
                author: author ?? undefined,
                quoted_message_id: newMsg.quoted_message_id,
                quoted_message: quotedObj,
              },
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `room=eq.${room}`,
        },
        (payload) => {
          const oldMsg = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [room]);

  /**
   * 옵티미스틱 prepend — 본인이 보낸 메시지를 INSERT 직후 즉시 화면에 표시.
   * 같은 id가 들어오면(예: realtime INSERT) 중복 추가하지 않음.
   */
  const addLocalMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  return { messages, loading, reload: loadInitial, addLocalMessage };
}
