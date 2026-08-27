"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type LikeState = { count: number; likedByMe: boolean };

/**
 * 좋아요가 붙는 대상. 유저에게는 둘 다 같은 행동이지만 원본 테이블이 다르다:
 *   lineup = club_lineups (클럽이 올린 그날 DJ 타임테이블)
 *   event  = club_events  (인스타에서 수집한 공연)
 * 다형 FK를 피하려고 테이블을 나눠 뒀다(597) — RPC/테이블 이름만 여기서 갈린다.
 */
export type LikeTarget = "lineup" | "event";

const TARGETS = {
  lineup: { rpc: "get_lineup_like_counts", table: "lineup_likes", fk: "lineup_id" },
  event: { rpc: "get_event_like_counts", table: "event_likes", fk: "event_id" },
} as const;

/**
 * 라인업·공연 좋아요 — Migration 596(라인업) / 597(공연).
 *
 * 클럽 찜(user_favorite_clubs)과는 다른 축이다: 저건 "이 클럽 단골",
 * 이건 "이 밤이 좋다". 그래서 훅도 분리했다.
 *
 * 카드가 수십 개라 개별 조회는 안 된다 — 집계 RPC로 한 번에 받는다.
 */
export function useLineupLikes(
  lineupIds: string[],
  userId: string | undefined,
  target: LikeTarget = "lineup"
) {
  const { rpc, table, fk } = TARGETS[target];
  const [likes, setLikes] = useState<Map<string, LikeState>>(new Map());
  const supabase = createClient();

  // 목록이 바뀔 때만 재조회 — 배열 정체성은 매 렌더 바뀌므로 내용으로 비교한다
  const signature = lineupIds.join(",");
  // 토글 중인 항목은 낙관적 값이 서버 응답으로 덮이지 않게 한다
  const pending = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (lineupIds.length === 0) {
      setLikes(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(rpc, {
        p_lineup_ids: lineupIds,
        p_user_id: userId ?? null,
      });
      if (cancelled || error || !data) return;
      setLikes((prev) => {
        const next = new Map<string, LikeState>();
        for (const row of data as Array<{
          lineup_id: string;
          like_count: number;
          liked_by_me: boolean;
        }>) {
          // 토글 진행 중인 건 낙관적 값을 유지 (응답이 늦게 와서 되돌아가 보이는 것 방지)
          const inFlight = pending.current.has(row.lineup_id);
          next.set(
            row.lineup_id,
            inFlight && prev.has(row.lineup_id)
              ? prev.get(row.lineup_id)!
              : { count: Number(row.like_count) || 0, likedByMe: !!row.liked_by_me }
          );
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, userId, rpc]);

  const getLike = useCallback(
    (lineupId: string): LikeState =>
      likes.get(lineupId) ?? { count: 0, likedByMe: false },
    [likes]
  );

  const toggleLike = useCallback(
    async (lineupId: string) => {
      if (!userId) {
        toast.error("로그인이 필요합니다");
        return;
      }
      const current = likes.get(lineupId) ?? { count: 0, likedByMe: false };
      const optimistic: LikeState = current.likedByMe
        ? { count: Math.max(0, current.count - 1), likedByMe: false }
        : { count: current.count + 1, likedByMe: true };

      pending.current.add(lineupId);
      setLikes((prev) => new Map(prev).set(lineupId, optimistic));

      const { error } = current.likedByMe
        ? await supabase
            .from(table)
            .delete()
            .eq(fk, lineupId)
            .eq("user_id", userId)
        : await supabase
            .from(table)
            .insert({ [fk]: lineupId, user_id: userId });

      pending.current.delete(lineupId);

      if (error) {
        // 실패하면 되돌린다 — 숫자가 틀린 채로 남는 게 더 나쁘다
        setLikes((prev) => new Map(prev).set(lineupId, current));
        // 중복 INSERT(23505)는 이미 눌린 상태라 에러를 띄울 일이 아니다
        if (error.code !== "23505") {
          toast.error("잠시 후 다시 시도해주세요");
        }
      }
    },
    [likes, userId, supabase, table, fk]
  );

  return { getLike, toggleLike };
}
