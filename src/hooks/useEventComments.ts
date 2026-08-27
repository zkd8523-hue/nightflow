"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventComment } from "@/types/database";

/**
 * 공연 댓글 목록 + 실시간 구독 — Migration 598.
 *
 * useChatShotComments와 같은 모양이다(오래된 → 최신, INSERT/DELETE 구독).
 * 다른 점은 댓글에 채팅방이 매달릴 수 있다는 것뿐이라 조인만 하나 더 붙였다.
 */
export function useEventComments(eventId: string | null) {
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(false);

  const SELECT = `id, event_id, author_id, content, media, room_id, is_deleted, created_at,
     author:public_user_profiles!author_id(id, display_name, profile_image),
     room:event_chat_rooms(id, room, title, is_closed, creator_id)`;

  const parse = (d: unknown): EventComment => {
    const row = d as Record<string, unknown>;
    const rawAuthor = row.author;
    const rawRoom = row.room;
    return {
      id: row.id as string,
      event_id: row.event_id as string,
      author_id: row.author_id as string,
      content: (row.content as string) ?? "",
      media: (row.media as EventComment["media"]) ?? [],
      room_id: (row.room_id as string | null) ?? null,
      is_deleted: (row.is_deleted as boolean) ?? false,
      created_at: row.created_at as string,
      author: (Array.isArray(rawAuthor)
        ? rawAuthor[0]
        : rawAuthor) as EventComment["author"],
      room: (Array.isArray(rawRoom)
        ? rawRoom[0]
        : rawRoom) as EventComment["room"],
    };
  };

  const load = useCallback(async () => {
    if (!eventId) {
      setComments([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("event_comments")
      .select(SELECT)
      .eq("event_id", eventId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useEventComments] fetch error", error);
      setComments([]);
    } else {
      setComments((data ?? []).map(parse));
    }
    setLoading(false);
    // SELECT/parse는 상수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!eventId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`event-comments:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_comments",
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const c = payload.new as { id: string; is_deleted: boolean };
          if (c.is_deleted) return;
          // 방 카드까지 붙여야 하므로 payload 대신 조인해서 다시 읽는다
          const { data } = await supabase
            .from("event_comments")
            .select(SELECT)
            .eq("id", c.id)
            .maybeSingle();
          if (!data) return;
          setComments((prev) =>
            prev.some((x) => x.id === c.id) ? prev : [...prev, parse(data)]
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "event_comments",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const old = payload.old as { id: string };
          setComments((prev) => prev.filter((c) => c.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  /**
   * 목록에서 즉시 제거 — DELETE Realtime 이벤트에만 기대면 안 된다.
   * Postgres는 REPLICA IDENTITY 설정에 따라 DELETE payload가 비거나 아예
   * 안 오는 경우가 있어, 삭제한 본인 화면이 새로고침 전까지 그대로 남는다.
   */
  const removeLocal = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { comments, loading, reload: load, removeLocal };
}
