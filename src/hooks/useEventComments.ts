"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventComment } from "@/types/database";

/**
 * 공연 댓글 목록 + 실시간 구독 — Migration 598, 602.
 *
 * 602에서 "같이 갈 사람" 채팅방을 걷어내고 대댓글·좋아요로 바꿨다.
 * 서버는 평평한 목록을 주고, 여기서 parent_id로 1-depth 트리를 조립한다.
 */

const SELECT = `id, event_id, author_id, content, media, parent_id,
   reply_count, like_count, edited_at, is_deleted, created_at,
   author:public_user_profiles!author_id(id, display_name, profile_image)`;

function parse(d: unknown): EventComment {
  const row = d as Record<string, unknown>;
  const rawAuthor = row.author;
  return {
    id: row.id as string,
    event_id: row.event_id as string,
    author_id: row.author_id as string,
    content: (row.content as string) ?? "",
    media: (row.media as EventComment["media"]) ?? [],
    parent_id: (row.parent_id as string | null) ?? null,
    reply_count: (row.reply_count as number) ?? 0,
    like_count: (row.like_count as number) ?? 0,
    edited_at: (row.edited_at as string | null) ?? null,
    room_id: null,
    is_deleted: (row.is_deleted as boolean) ?? false,
    created_at: row.created_at as string,
    author: (Array.isArray(rawAuthor) ? rawAuthor[0] : rawAuthor) as EventComment["author"],
  };
}

/**
 * 평평한 목록 → 1-depth 트리.
 * 부모가 지워진 답글(고아)은 최상위로 올린다 — 트리에서 빠지면 화면에서 조용히
 * 사라져 "내 답글이 없어졌다"가 된다.
 */
function buildTree(flat: EventComment[]): EventComment[] {
  const byId = new Map(flat.map((c) => [c.id, { ...c, replies: [] as EventComment[] }]));
  const roots: EventComment[] = [];
  for (const c of byId.values()) {
    const parent = c.parent_id ? byId.get(c.parent_id) : null;
    if (parent) parent.replies!.push(c);
    else roots.push(c);
  }
  return roots;
}

export function useEventComments(eventId: string | null) {
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(false);
  /** 내가 좋아요한 댓글 id — 로그인 유저별로 다르므로 목록과 분리해서 들고 있는다 */
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!eventId) {
      setComments([]);
      setLikedIds(new Set());
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
      setLoading(false);
      return;
    }

    const flat = (data ?? []).map(parse);
    setComments(flat);

    // 내 좋아요 — 로그인 상태에서만. 댓글이 없으면 조회 자체를 건너뛴다.
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (uid && flat.length > 0) {
      const { data: likes } = await supabase
        .from("event_comment_likes")
        .select("comment_id")
        .eq("user_id", uid)
        .in("comment_id", flat.map((c) => c.id));
      setLikedIds(new Set((likes ?? []).map((l) => (l as { comment_id: string }).comment_id)));
    } else {
      setLikedIds(new Set());
    }
    setLoading(false);
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
          // 작성자 프로필을 붙여야 하므로 payload 대신 조인해서 다시 읽는다
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
          event: "UPDATE",
          schema: "public",
          table: "event_comments",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // like_count·reply_count는 트리거가 UPDATE로 갱신한다 — 그걸 그대로 받는다
          const n = payload.new as Record<string, unknown>;
          const id = n.id as string;
          if (n.is_deleted) {
            setComments((prev) => prev.filter((c) => c.id !== id));
            return;
          }
          setComments((prev) =>
            prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    content: (n.content as string) ?? c.content,
                    like_count: (n.like_count as number) ?? c.like_count,
                    reply_count: (n.reply_count as number) ?? c.reply_count,
                    edited_at: (n.edited_at as string | null) ?? c.edited_at,
                  }
                : c
            )
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
  }, [eventId]);

  /**
   * 목록에서 즉시 제거 — DELETE Realtime 이벤트에만 기대면 안 된다.
   * Postgres는 REPLICA IDENTITY 설정에 따라 DELETE payload가 비거나 아예
   * 안 오는 경우가 있어, 삭제한 본인 화면이 새로고침 전까지 그대로 남는다.
   */
  const removeLocal = useCallback((id: string) => {
    // 부모를 지우면 DB는 CASCADE로 답글도 지운다 — 화면도 같이 맞춘다
    setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
  }, []);

  /**
   * 좋아요 토글 — 낙관적 반영 후 실패하면 되돌린다.
   * Realtime UPDATE로 like_count가 다시 오지만, 누른 본인에게는 즉시 반응이 보여야 한다.
   */
  const toggleLike = useCallback(
    async (commentId: string, userId: string) => {
      const liked = likedIds.has(commentId);

      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, like_count: Math.max(0, c.like_count + (liked ? -1 : 1)) }
            : c
        )
      );

      const supabase = createClient();
      const { error } = liked
        ? await supabase
            .from("event_comment_likes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", userId)
        : await supabase
            .from("event_comment_likes")
            .insert({ comment_id: commentId, user_id: userId });

      if (error) {
        // 되돌리기
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (liked) next.add(commentId);
          else next.delete(commentId);
          return next;
        });
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, like_count: Math.max(0, c.like_count + (liked ? 1 : -1)) }
              : c
          )
        );
        return false;
      }
      return true;
    },
    [likedIds]
  );

  /**
   * 댓글 수정 — RPC로만 연다(Migration 603).
   * RLS UPDATE를 열면 like_count 같은 트리거 관리 컬럼까지 만질 수 있어서다.
   */
  const editComment = useCallback(async (commentId: string, content: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("edit_event_comment", {
      p_comment_id: commentId,
      p_content: content,
    });
    const res = data as { success?: boolean; error?: string } | null;
    if (error || !res?.success) {
      return { ok: false, error: res?.error ?? "수정하지 못했어요" };
    }
    // Realtime UPDATE가 늦어도 내 화면은 바로 바뀌어야 한다
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, content: content.trim(), edited_at: new Date().toISOString() }
          : c
      )
    );
    return { ok: true };
  }, []);

  /** 신고 — 같은 댓글 중복 신고는 DB UNIQUE가 막는다(23505) */
  const reportComment = useCallback(
    async (commentId: string, userId: string, reason: string, message?: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("event_comment_reports").insert({
        comment_id: commentId,
        reporter_id: userId,
        reason,
        message: message?.trim() || null,
      });
      if (error) {
        if (error.code === "23505") return { ok: false, error: "이미 신고한 댓글이에요" };
        if (error.code === "42P01") return { ok: false, error: "마이그레이션 미적용 (603)" };
        return { ok: false, error: "신고하지 못했어요" };
      }
      return { ok: true };
    },
    []
  );

  return {
    /** 1-depth 트리 (최상위 댓글 + replies) */
    tree: buildTree(comments),
    /** 답글 포함 전체 개수 */
    totalCount: comments.length,
    comments,
    likedIds,
    loading,
    reload: load,
    removeLocal,
    toggleLike,
    editComment,
    reportComment,
  };
}
