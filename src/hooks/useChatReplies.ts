"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, ChatRoomCode } from "@/types/database";

/**
 * 특정 부모 메시지의 답글 목록 (오래된 → 최신 순)
 * + Realtime INSERT/DELETE 구독
 */
export function useChatReplies(parentId: string | null) {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const loadReplies = useCallback(async () => {
    if (!parentId) {
      setReplies([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_messages")
      .select(
        `
        id, room, author_id, parent_id, reply_count, content, media, author_area, club_tags,
        is_deleted, created_at,
        author:public_user_profiles!chat_messages_author_id_fkey(id, display_name, profile_image)
      `
      )
      .eq("parent_id", parentId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useChatReplies] fetch error", error);
      setReplies([]);
      setLoading(false);
      return;
    }
    const parsed: ChatMessage[] = (data ?? []).map((d) => {
      const rawAuthor = (d as { author?: unknown }).author;
      const authorObj = Array.isArray(rawAuthor)
        ? (rawAuthor[0] as ChatMessage["author"])
        : (rawAuthor as ChatMessage["author"]);
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
        quoted_message_id: null,
        quoted_message: null,
      };
    });
    setReplies(parsed);
    setLoading(false);
  }, [parentId]);

  useEffect(() => {
    loadReplies();
  }, [loadReplies]);

  // Realtime
  useEffect(() => {
    if (!parentId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-replies:${parentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `parent_id=eq.${parentId}`,
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
          };
          if (newMsg.is_deleted) return;
          const { data: author } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image")
            .eq("id", newMsg.author_id)
            .maybeSingle();
          setReplies((prev) => {
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
                quoted_message_id: null,
                quoted_message: null,
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
          filter: `parent_id=eq.${parentId}`,
        },
        (payload) => {
          const oldMsg = payload.old as { id: string };
          setReplies((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [parentId]);

  return { replies, loading, reload: loadReplies };
}
