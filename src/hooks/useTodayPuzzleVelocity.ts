"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type TodayPuzzleVelocity = {
  sampleSize: number;
  avgFirstOfferMinutes: number;
  medianFirstOfferMinutes: number;
  avgOffers3h: number;
  offeredRatio: number;
};

export function useTodayPuzzleVelocity() {
  const [stats, setStats] = useState<TodayPuzzleVelocity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("get_today_puzzle_velocity");
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setStats(null);
      } else {
        const row = data[0];
        setStats({
          sampleSize: Number(row.sample_size) || 0,
          avgFirstOfferMinutes: Number(row.avg_first_offer_minutes) || 0,
          medianFirstOfferMinutes: Number(row.median_first_offer_minutes) || 0,
          avgOffers3h: Number(row.avg_offers_3h) || 0,
          offeredRatio: Number(row.offered_ratio) || 0,
        });
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, isLoading };
}
