"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ChatShot, VerifiableArea } from "@/types/database";

/**
 * 활성 SHOT 목록 (만료 안 된 것만, 최신순)
 * - `areas` undefined or 빈 배열: 모든 지역 (잡담방용)
 * - `areas` 지정: 해당 지역만 (지역방용)
 * + Realtime INSERT/DELETE 구독
 * + 좋아요 토글 (currentUserId 있을 때 liked_by_me 채움)
 */
export function useChatShots(
  areas?: VerifiableArea[],
  currentUserId?: string
) {
  const [shots, setShots] = useState<ChatShot[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoadRef = useRef(true);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  // areas 배열을 안정적인 키로 (재구독 폭주 방지)
  const areasKey = (areas ?? []).slice().sort().join(",");

  const load = useCallback(async () => {
    const supabase = createClient();
    if (isFirstLoadRef.current) setLoading(true);
    let q = supabase
      .from("chat_shots")
      .select(
        `id, area, author_id, media_type, media_url, width, height, duration, caption, like_count, created_at, expires_at,
         author:public_user_profiles!author_id(id, display_name, profile_image)`
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    const list = areasKey ? areasKey.split(",") : [];
    if (list.length > 0) {
      q = q.in("area", list);
    }
    // 프로덕션 빌드에선 테스트 계정 SHOT 제외 (Migration 317)
    if (process.env.NODE_ENV === "production") {
      q = q.eq("is_test", false);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[useChatShots] fetch error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      setShots([]);
    } else {
      const parsed: ChatShot[] = (data ?? []).map((d) => {
        const rawAuthor = (d as { author?: unknown }).author;
        const authorObj = Array.isArray(rawAuthor)
          ? (rawAuthor[0] as ChatShot["author"])
          : (rawAuthor as ChatShot["author"]);
        return {
          id: d.id,
          area: d.area as VerifiableArea,
          author_id: d.author_id,
          media_type: d.media_type as "image" | "video",
          media_url: d.media_url,
          width: d.width,
          height: d.height,
          duration: d.duration,
          caption: d.caption,
          like_count: (d as { like_count?: number }).like_count ?? 0,
          created_at: d.created_at,
          expires_at: d.expires_at,
          author: authorObj,
          liked_by_me: false,
        };
      });

      // 본인 좋아요 일괄 조회
      if (currentUserId && parsed.length > 0) {
        const { data: likes } = await supabase
          .from("chat_shot_likes")
          .select("shot_id")
          .eq("user_id", currentUserId)
          .in("shot_id", parsed.map((s) => s.id));
        const likedSet = new Set((likes ?? []).map((l) => l.shot_id));
        parsed.forEach((s) => {
          s.liked_by_me = likedSet.has(s.id);
        });
      }

      setShots(parsed);
    }
    setLoading(false);
    isFirstLoadRef.current = false;
  }, [areasKey, currentUserId]);

  useEffect(() => {
    load();
  }, [load]);

  // 방 전환 시 첫 로드 표시 복원
  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [areasKey]);

  // Realtime — 같은 area만 반영 (areas 필터 있을 때) 또는 모든 INSERT
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-shots:${areasKey || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_shots",
        },
        async (payload) => {
          const newShot = payload.new as ChatShot;
          const list = areasKey ? areasKey.split(",") : [];
          if (list.length > 0 && !list.includes(newShot.area)) return;
          // 작성자 프로필 join
          const { data: author } = await supabase
            .from("public_user_profiles")
            .select("id, display_name, profile_image")
            .eq("id", newShot.author_id)
            .maybeSingle();
          setShots((prev) => {
            if (prev.some((s) => s.id === newShot.id)) return prev;
            return [
              {
                ...newShot,
                like_count: newShot.like_count ?? 0,
                author: author ?? undefined,
                liked_by_me: false,
              },
              ...prev,
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_shots",
        },
        (payload) => {
          const oldShot = payload.old as { id: string };
          setShots((prev) => prev.filter((s) => s.id !== oldShot.id));
        }
      )
      // like_count 동기화 — 트리거가 chat_shots.like_count 업데이트하면 반영
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_shots",
        },
        (payload) => {
          const updated = payload.new as { id: string; like_count: number };
          setShots((prev) =>
            prev.map((s) =>
              s.id === updated.id
                ? { ...s, like_count: updated.like_count }
                : s
            )
          );
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [areasKey]);

  // 클라이언트 측 만료 자동 정리 (1분마다)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setShots((prev) =>
        prev.filter((s) => new Date(s.expires_at).getTime() > now)
      );
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  /** 옵티미스틱 prepend — 본인이 올린 SHOT 즉시 표시 */
  const addLocalShot = useCallback((shot: ChatShot) => {
    setShots((prev) => {
      if (prev.some((s) => s.id === shot.id)) return prev;
      return [shot, ...prev];
    });
  }, []);

  /**
   * 좋아요 토글 — 옵티미스틱, 본인 SHOT은 차단
   */
  const toggleLike = useCallback(
    async (shotId: string) => {
      if (!currentUserId) return;
      const target = shots.find((s) => s.id === shotId);
      if (!target) return;
      if (target.author_id === currentUserId) {
        toast.error("본인 SHOT에는 좋아요할 수 없어요");
        return;
      }
      const wasLiked = !!target.liked_by_me;

      // 옵티미스틱
      setShots((prev) =>
        prev.map((s) =>
          s.id === shotId
            ? {
                ...s,
                liked_by_me: !wasLiked,
                like_count: Math.max(
                  s.like_count + (wasLiked ? -1 : 1),
                  0
                ),
              }
            : s
        )
      );

      const supabase = createClient();
      if (wasLiked) {
        const { error } = await supabase
          .from("chat_shot_likes")
          .delete()
          .eq("shot_id", shotId)
          .eq("user_id", currentUserId);
        if (error) {
          console.error("[useChatShots] unlike error", error);
          // 롤백
          setShots((prev) =>
            prev.map((s) =>
              s.id === shotId
                ? {
                    ...s,
                    liked_by_me: true,
                    like_count: s.like_count + 1,
                  }
                : s
            )
          );
          toast.error("좋아요 취소 실패");
        }
      } else {
        const { error } = await supabase
          .from("chat_shot_likes")
          .insert({ shot_id: shotId, user_id: currentUserId });
        if (error) {
          console.error("[useChatShots] like error", error);
          // 롤백
          setShots((prev) =>
            prev.map((s) =>
              s.id === shotId
                ? {
                    ...s,
                    liked_by_me: false,
                    like_count: Math.max(s.like_count - 1, 0),
                  }
                : s
            )
          );
          if (error.code === "23505") {
            // 이미 누른 상태 (다른 디바이스 등) — 무시
          } else if (
            error.code === "42501" ||
            error.message?.includes("row-level security")
          ) {
            toast.error("본인 SHOT에는 좋아요할 수 없어요");
          } else if (error.code === "42P01" || error.code === "42703") {
            toast.error("좋아요 마이그레이션 미적용 (316)");
          } else {
            toast.error(`좋아요 실패: ${error.message ?? ""}`);
          }
        }
      }
    },
    [shots, currentUserId]
  );

  return { shots, loading, reload: load, addLocalShot, toggleLike };
}
