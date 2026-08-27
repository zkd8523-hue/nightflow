"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 칩 탭의 안읽음 빨간 점 계산용.
 *
 * puzzle_party_reads는 파티 단위(유저별 1개)라 "방별" 읽음 시각을 못 준다.
 * 그래서 서버 스키마를 더 늘리는 대신, 방별 "마지막 메시지 시각"만 서버에서
 * 받아오고 "마지막으로 그 방을 열어본 시각"은 브라우저 localStorage에 남겨
 * 클라이언트에서 비교한다. 새로고침하면 리셋되지만 세션 중 배지 용도로는 충분하다.
 */
export function usePartyRoomActivity(puzzleId: string) {
  const [latestAtByRoom, setLatestAtByRoom] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data } = await supabase
        .from("puzzle_party_messages")
        .select("room_md_id, created_at")
        .eq("puzzle_id", puzzleId)
        .eq("is_deleted", false)
        .not("room_md_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { room_md_id: string; created_at: string }[]) {
        if (!map[row.room_md_id]) map[row.room_md_id] = row.created_at;
      }
      setLatestAtByRoom(map);
    }
    load();

    const channel = supabase
      .channel(`party-room-activity:${puzzleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "puzzle_party_messages", filter: `puzzle_id=eq.${puzzleId}` },
        (payload) => {
          const m = payload.new as { room_md_id: string | null; created_at: string; is_deleted: boolean };
          if (m.is_deleted || !m.room_md_id) return;
          setLatestAtByRoom((prev) => ({ ...prev, [m.room_md_id as string]: m.created_at }));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [puzzleId]);

  const getLastSeen = useCallback(
    (mdId: string): string | null => {
      try {
        return window.localStorage.getItem(`party_room_seen_${puzzleId}_${mdId}`);
      } catch {
        return null;
      }
    },
    [puzzleId]
  );

  const markSeen = useCallback(
    (mdId: string) => {
      try {
        window.localStorage.setItem(`party_room_seen_${puzzleId}_${mdId}`, new Date().toISOString());
      } catch {
        // localStorage 접근 불가 시 무시 — 배지가 안 사라질 뿐 기능엔 영향 없음
      }
    },
    [puzzleId]
  );

  const hasUnread = useCallback(
    (mdId: string): boolean => {
      const latest = latestAtByRoom[mdId];
      if (!latest) return false;
      const seen = getLastSeen(mdId);
      if (!seen) return true;
      return new Date(latest).getTime() > new Date(seen).getTime();
    },
    [latestAtByRoom, getLastSeen]
  );

  return { hasUnread, markSeen };
}
