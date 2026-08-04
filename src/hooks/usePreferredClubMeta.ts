"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Puzzle } from "@/types/database";

/**
 * 깃발 카드의 "제안받고 싶은 클럽"(Migration 504, puzzles.preferred_club_ids) 표시에 필요한 메타 조회.
 *  - preferredClubNames: 목록에 등장한 club_id → 이름 (칩 라벨용, 등장한 id만 조회하고 캐시)
 *  - myClubIds: 뷰어가 MD/Admin일 때 본인이 파트너인 club_id 목록 ("내 클럽을 원해요" 배지 판정용)
 *
 * PuzzleCard를 렌더하는 곳(PuzzleList, HomePuzzleCarousel 등)에서 공용으로 사용 —
 * 한쪽만 배선하면 다른 화면에서 칩이 조용히 안 뜨는 버그가 났어서 훅으로 통일함.
 */
export function usePreferredClubMeta(
  puzzles: Pick<Puzzle, "preferred_club_ids">[],
  userRole?: "user" | "md" | "admin",
) {
  const [preferredClubNames, setPreferredClubNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = Array.from(new Set(puzzles.flatMap((p) => p.preferred_club_ids ?? [])));
    const missing = ids.filter((id) => !(id in preferredClubNames));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await createClient().from("clubs").select("id, name").in("id", missing);
      if (!data) return;
      setPreferredClubNames((prev) => {
        const next = { ...prev };
        for (const c of data) next[c.id] = c.name;
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles]);

  // MD 본인이 파트너인 클럽 id들 (OfferSheet.tsx와 동일 쿼리 패턴)
  const [myClubIds, setMyClubIds] = useState<string[]>([]);
  useEffect(() => {
    if (userRole !== "md" && userRole !== "admin") return;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("club_partners").select("club_id").eq("md_id", user.id);
      if (data) setMyClubIds(data.map((r) => r.club_id));
    })();
  }, [userRole]);

  return { preferredClubNames, myClubIds };
}
