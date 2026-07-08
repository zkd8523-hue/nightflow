"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "./useCurrentUser";
import type { RewardCatalogItem, RewardRedemption } from "@/types/database";

/**
 * 보상 카탈로그(재고/활성) + 내 발행 내역 (Migration 418)
 * - 카탈로그 code 기준 Map으로 반환 → 프론트 하드코딩 표현과 병합
 * - 마이그레이션 미적용(42P01)이면 빈 값으로 폴백 (교환 버튼은 비활성)
 */
export function useRewards() {
  const { user } = useCurrentUser();
  const [catalog, setCatalog] = useState<Map<string, RewardCatalogItem>>(new Map());
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();

    const catRes = await supabase
      .from("reward_catalog")
      .select("code, name, reward_type, stamp_cost, stock, is_active, sort_order");

    if (!catRes.error && catRes.data) {
      setCatalog(new Map(catRes.data.map((c) => [c.code, c as RewardCatalogItem])));
    }

    if (user) {
      const redRes = await supabase
        .from("reward_redemptions")
        .select("id, user_id, reward_code, reward_name, reward_type, stamp_cost, status, admin_note, fulfilled_by, fulfilled_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!redRes.error && redRes.data) {
        setRedemptions(redRes.data as RewardRedemption[]);
      }
    } else {
      setRedemptions([]);
    }

    setReady(true);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { catalog, redemptions, ready, reload: load };
}

/** 이번 달(로컬) 추첨 응모 횟수 */
export function countRaffleEntriesThisMonth(redemptions: RewardRedemption[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return redemptions.filter((r) => {
    if (r.reward_type !== "raffle" || r.status === "cancelled") return false;
    const d = new Date(r.created_at);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}
