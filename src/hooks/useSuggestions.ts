"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hideTestData } from "@/lib/utils/testData";
import type { Suggestion, SuggestionAuthor } from "@/types/database";

// 상세(단건) 조회용 — base table 직접 조회, RLS가 비공개글 접근을 막아준다.
const SELECT = `
  id, author_id, category, title, content, is_private, media,
  like_count, comment_count, is_deleted, is_test, created_at, updated_at,
  author:public_user_profiles!author_id(id, display_name, profile_image, role)
`;

// 목록 조회용 — suggestions_public 뷰(Migration 496). 비공개글도 행은 내려오되
// title/content 가 NULL로 마스킹되어 온다. author 는 뷰 안에서 이미 flat 컬럼으로 join됨.
const SELECT_PUBLIC = `
  id, author_id, category, title, content, is_private,
  like_count, comment_count, is_test, created_at, updated_at,
  author_display_name, author_profile_image, author_role
`;

const PAGE_SIZE = 100;

/** PostgREST 임베드는 1:1도 배열로 올 때가 있어 정규화 (useChatShotComments 와 동일 처리) */
function parseRow(row: Record<string, unknown>): Suggestion {
  const raw = row.author;
  const author = Array.isArray(raw)
    ? (raw[0] as SuggestionAuthor | undefined)
    : (raw as SuggestionAuthor | undefined);
  return { ...(row as unknown as Suggestion), author };
}

interface SuggestionPublicRow {
  id: string;
  author_id: string;
  category?: string | null;
  title: string | null;
  content: string | null;
  is_private: boolean;
  like_count: number;
  comment_count: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
  author_display_name: string | null;
  author_profile_image: string | null;
  author_role: string | null;
}

/** suggestions_public 뷰 행 → Suggestion. title이 NULL이면 열람 권한 없는 비공개글(마스킹). */
function parsePublicRow(row: SuggestionPublicRow): Suggestion {
  const masked = row.is_private && row.title === null;
  return {
    id: row.id,
    author_id: row.author_id,
    category: row.category ?? "nightflow",
    title: row.title ?? "",
    content: row.content ?? "",
    is_private: row.is_private,
    like_count: row.like_count,
    comment_count: row.comment_count,
    is_deleted: false,
    is_test: row.is_test,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_masked: masked,
    // 목록(suggestions_public 뷰)엔 media를 안 실었다 — 존재는 카드에서 안 보여주고
    // 상세 진입 시에만 노출하는 원칙과 동일. SuggestionCard도 미디어 미리보기 없음.
    media: [],
    author: {
      id: row.author_id,
      display_name: row.author_display_name,
      profile_image: row.author_profile_image,
      role: row.author_role,
    },
  };
}

/** 내가 좋아요 누른 건의 id 집합 */
async function fetchMyLikes(ids: string[], userId: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = createClient();
  const { data } = await supabase
    .from("suggestion_likes")
    .select("suggestion_id")
    .eq("user_id", userId)
    .in("suggestion_id", ids);
  return new Set((data ?? []).map((l) => l.suggestion_id as string));
}

/**
 * 좋아요 토글 (목록/상세 공용).
 * 본인 글 좋아요는 RLS에서도 막히므로 호출 전에 UI에서 걸러야 한다.
 */
export async function toggleSuggestionLike(
  suggestionId: string,
  userId: string,
  currentlyLiked: boolean
) {
  const supabase = createClient();
  if (currentlyLiked) {
    return supabase
      .from("suggestion_likes")
      .delete()
      .eq("suggestion_id", suggestionId)
      .eq("user_id", userId);
  }
  return supabase
    .from("suggestion_likes")
    .insert({ suggestion_id: suggestionId, user_id: userId });
}

/**
 * 건의 목록 + 실시간 반영. 정렬은 최신순 고정.
 * - suggestions_public 뷰로 조회 — 비공개글도 행은 노출되지만 title/content가
 *   NULL로 마스킹되어 온다(is_masked=true). 실제 본문 접근은 base table RLS가 계속 막는다.
 * - 새 글 INSERT는 reload. Realtime의 postgres_changes 는 구독자 RLS를 태우므로
 *   타인의 비공개글 INSERT/UPDATE는 이 이벤트로 전달되지 않는다 — 새로고침 시 반영.
 * - 카운트 UPDATE는 이미 목록에 있는 행만 패치
 */
export function useSuggestions(currentUserId?: string, category?: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from("suggestions_public").select(SELECT_PUBLIC);
    query = hideTestData(query, "");
    if (category) query = query.eq("category", category);
    query = query.order("created_at", { ascending: false });

    const { data, error } = await query.limit(PAGE_SIZE);

    if (error) {
      console.error("[useSuggestions] fetch error", error);
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let rows = (data ?? []).map((d) => parsePublicRow(d as unknown as SuggestionPublicRow));

    if (currentUserId && rows.length > 0) {
      const liked = await fetchMyLikes(
        rows.map((r) => r.id),
        currentUserId
      );
      rows = rows.map((r) => ({ ...r, liked_by_me: liked.has(r.id) }));
    }

    setSuggestions(rows);
    setLoading(false);
  }, [currentUserId, category]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("suggestions-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "suggestions" },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "suggestions" },
        (payload) => {
          const row = payload.new as Suggestion;
          setSuggestions((prev) => {
            if (!prev.some((s) => s.id === row.id)) return prev;
            if (row.is_deleted) return prev.filter((s) => s.id !== row.id);
            return prev.map((s) =>
              s.id === row.id
                ? { ...s, like_count: row.like_count, comment_count: row.comment_count }
                : s
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  /** 낙관적 토글 — 실패 시 롤백 */
  const toggleLike = useCallback(
    async (id: string) => {
      if (!currentUserId) return;
      const target = suggestions.find((s) => s.id === id);
      if (!target || target.author_id === currentUserId) return;

      const liked = !!target.liked_by_me;
      const patch = (on: boolean) =>
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  liked_by_me: on,
                  like_count: Math.max(0, s.like_count + (on ? 1 : -1)),
                }
              : s
          )
        );

      patch(!liked);
      const { error } = await toggleSuggestionLike(id, currentUserId, liked);
      if (error) {
        console.error("[useSuggestions] like error", error);
        patch(liked);
      }
    },
    [suggestions, currentUserId]
  );

  return { suggestions, loading, toggleLike, reload: load };
}

/** 건의 1건 (상세 페이지) */
export function useSuggestion(id: string, currentUserId?: string) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("suggestions")
      .select(SELECT)
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("[useSuggestion] fetch error", error);
      setSuggestion(null);
      setLoading(false);
      return;
    }

    const row = parseRow(data as Record<string, unknown>);
    if (currentUserId) {
      const liked = await fetchMyLikes([row.id], currentUserId);
      row.liked_by_me = liked.has(row.id);
    }
    setSuggestion(row);
    setLoading(false);
  }, [id, currentUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`suggestion:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "suggestions",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Suggestion;
          setSuggestion((prev) => {
            if (!prev) return prev;
            if (row.is_deleted) return null;
            return {
              ...prev,
              title: row.title,
              content: row.content,
              like_count: row.like_count,
              comment_count: row.comment_count,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const toggleLike = useCallback(async () => {
    if (!currentUserId || !suggestion) return;
    if (suggestion.author_id === currentUserId) return;

    const liked = !!suggestion.liked_by_me;
    const patch = (on: boolean) =>
      setSuggestion((prev) =>
        prev
          ? {
              ...prev,
              liked_by_me: on,
              like_count: Math.max(0, prev.like_count + (on ? 1 : -1)),
            }
          : prev
      );

    patch(!liked);
    const { error } = await toggleSuggestionLike(suggestion.id, currentUserId, liked);
    if (error) {
      console.error("[useSuggestion] like error", error);
      patch(liked);
    }
  }, [suggestion, currentUserId]);

  return { suggestion, loading, toggleLike, reload: load };
}
