"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

export interface MyStampStatus {
  current_count: number;
  total_earned: number;
  last_earned_at: string | null;
  next_eligible_at: string | null;
  earned_last_24h: number;
}

const EMPTY: MyStampStatus = {
  current_count: 0,
  total_earned: 0,
  last_earned_at: null,
  next_eligible_at: null,
  earned_last_24h: 0,
};

/**
 * 현재 로그인 유저의 스탬프 현황 (Migration 413 my_stamp_status 뷰)
 * - 로그인 안 됐거나 아직 스탬프 없으면 all-zero
 */
export function useMyStamps() {
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<MyStampStatus>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setStatus(EMPTY);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("my_stamp_status")
      .select("current_count, total_earned, last_earned_at, next_eligible_at, earned_last_24h")
      .maybeSingle();
    if (error) {
      // 42P01 = 뷰 없음 (마이그레이션 미적용) → all-zero
      if (error.code !== "42P01") {
        console.warn("[useMyStamps] fetch error", error);
      }
      setStatus(EMPTY);
    } else if (data) {
      setStatus({
        current_count: data.current_count ?? 0,
        total_earned: data.total_earned ?? 0,
        last_earned_at: data.last_earned_at ?? null,
        next_eligible_at: data.next_eligible_at ?? null,
        earned_last_24h: data.earned_last_24h ?? 0,
      });
    } else {
      // 스탬프 로우 없음 (한 번도 적립 X)
      setStatus(EMPTY);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { status, loading, reload: load };
}
