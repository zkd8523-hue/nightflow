"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 현재 유저가 본인이 꽂은 활성 깃발(open/selecting)을 보유 중인지 판별.
 * userId가 undefined면 조회하지 않음(false) — 배너가 노출되는 경우에만 호출해
 * 불필요한 쿼리를 막는다.
 */
export function useHasActivePuzzle(userId: string | undefined) {
  const [hasActivePuzzle, setHasActivePuzzle] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasActivePuzzle(false);
      return;
    }

    let active = true;
    const supabase = createClient();

    supabase
      .from("puzzles")
      .select("id", { count: "exact", head: true })
      .eq("leader_id", userId)
      .in("status", ["open", "selecting"])
      .then(({ count }) => {
        if (active) setHasActivePuzzle((count ?? 0) > 0);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  return hasActivePuzzle;
}
