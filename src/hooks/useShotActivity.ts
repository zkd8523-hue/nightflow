"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ShotViewer {
  id: string;
  name: string;
  image: string | null;
  liked: boolean;
  viewedAt: string | null;
}

/**
 * LIVE 활동 (Migration 424) — 본 사람 + 좋아요. 작성자만 조회 가능(RLS).
 * 좋아요한 사람을 최상단, 그 다음 최근 조회순.
 */
export function useShotActivity(shotId: string | null, enabled: boolean) {
  const [viewers, setViewers] = useState<ShotViewer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !shotId) {
      setViewers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const [viewsRes, likesRes] = await Promise.all([
        supabase
          .from("chat_shot_views")
          .select("viewer_id, viewed_at")
          .eq("shot_id", shotId)
          .order("viewed_at", { ascending: false }),
        supabase.from("chat_shot_likes").select("user_id").eq("shot_id", shotId),
      ]);

      const views = viewsRes.data ?? [];
      const likedSet = new Set((likesRes.data ?? []).map((l) => l.user_id as string));
      const viewedAt = new Map(views.map((v) => [v.viewer_id as string, v.viewed_at as string]));

      // 조회자 ∪ 좋아요한 사람
      const idList = [...new Set([...views.map((v) => v.viewer_id as string), ...likedSet])];

      let profiles: { id: string; display_name: string | null; profile_image: string | null }[] = [];
      if (idList.length > 0) {
        const { data } = await supabase
          .from("public_user_profiles")
          .select("id, display_name, profile_image")
          .in("id", idList);
        profiles = data ?? [];
      }
      const pMap = new Map(profiles.map((p) => [p.id, p]));

      const list: ShotViewer[] = idList.map((id) => ({
        id,
        name: pMap.get(id)?.display_name ?? "익명",
        image: pMap.get(id)?.profile_image ?? null,
        liked: likedSet.has(id),
        viewedAt: viewedAt.get(id) ?? null,
      }));
      list.sort((a, b) => {
        if (a.liked !== b.liked) return a.liked ? -1 : 1; // 좋아요 최상단
        return (b.viewedAt ?? "").localeCompare(a.viewedAt ?? ""); // 최근 조회순
      });

      if (!cancelled) {
        setViewers(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shotId, enabled]);

  return { viewers, loading };
}
