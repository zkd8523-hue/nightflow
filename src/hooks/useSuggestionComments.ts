"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SuggestionComment, SuggestionAuthor } from "@/types/database";

/**
 * 건의 댓글 목록 + 실시간 구독
 * - 오래된 → 최신 (useChatShotComments 와 동일 규칙)
 * - 관리자 답변도 같은 테이블. author.role 로만 구분한다.
 */
export function useSuggestionComments(suggestionId: string | null) {
  const [comments, setComments] = useState<SuggestionComment[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const load = useCallback(async () => {
    if (!suggestionId) {
      setComments([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("suggestion_comments")
      .select(
        `id, suggestion_id, author_id, content, is_deleted, created_at,
         author:public_user_profiles!author_id(id, display_name, profile_image, role)`
      )
      .eq("suggestion_id", suggestionId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useSuggestionComments] fetch error", error);
      setComments([]);
    } else {
      const parsed: SuggestionComment[] = (data ?? []).map((d) => {
        const rawAuthor = (d as { author?: unknown }).author;
        const authorObj = Array.isArray(rawAuthor)
          ? (rawAuthor[0] as SuggestionAuthor | undefined)
          : (rawAuthor as SuggestionAuthor | undefined);
        return {
          id: d.id,
          suggestion_id: d.suggestion_id,
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
  }, [suggestionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    if (!suggestionId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`suggestion-comments:${suggestionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "suggestion_comments",
          filter: `suggestion_id=eq.${suggestionId}`,
        },
        async (payload) => {
          const c = payload.new as SuggestionComment;
          if (c.is_deleted) return;
          const { data: author } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image, role")
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
          table: "suggestion_comments",
          filter: `suggestion_id=eq.${suggestionId}`,
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
  }, [suggestionId]);

  return { comments, loading, reload: load };
}
