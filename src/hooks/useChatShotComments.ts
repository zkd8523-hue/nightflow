"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatShotComment } from "@/types/database";

/**
 * SHOT 댓글 목록 + 실시간 구독
 * - 오래된 → 최신 (인스타 릴스 패턴)
 */
export function useChatShotComments(shotId: string | null) {
  const [comments, setComments] = useState<ChatShotComment[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const load = useCallback(async () => {
    if (!shotId) {
      setComments([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_shot_comments")
      .select(
        `id, shot_id, author_id, content, is_deleted, created_at,
         author:public_user_profiles!author_id(id, display_name, profile_image)`
      )
      .eq("shot_id", shotId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useChatShotComments] fetch error", error);
      setComments([]);
    } else {
      const parsed: ChatShotComment[] = (data ?? []).map((d) => {
        const rawAuthor = (d as { author?: unknown }).author;
        const authorObj = Array.isArray(rawAuthor)
          ? (rawAuthor[0] as ChatShotComment["author"])
          : (rawAuthor as ChatShotComment["author"]);
        return {
          id: d.id,
          shot_id: d.shot_id,
          author_id: d.author_id,
          content: d.content,
          is_deleted: d.is_deleted,
          created_at: d.created_at,
          author: authorObj,
        };
      });
      setComments(parsed);
    }
    setLoading(false);
  }, [shotId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    if (!shotId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`shot-comments:${shotId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_shot_comments",
          filter: `shot_id=eq.${shotId}`,
        },
        async (payload) => {
          const c = payload.new as ChatShotComment;
          if (c.is_deleted) return;
          const { data: author } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image")
            .eq("id", c.author_id)
            .maybeSingle();
          setComments((prev) => {
            if (prev.some((x) => x.id === c.id)) return prev;
            return [...prev, { ...c, author: author ?? undefined }];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_shot_comments",
          filter: `shot_id=eq.${shotId}`,
        },
        (payload) => {
          const old = payload.old as { id: string };
          setComments((prev) => prev.filter((c) => c.id !== old.id));
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [shotId]);

  return { comments, loading, reload: load };
}
