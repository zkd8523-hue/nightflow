"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePuzzleSocialProof() {
  const [stats, setStats] = useState<{ puzzleCount: number; offerCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("get_puzzle_social_proof");
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setStats(null);
      } else {
        setStats({
          puzzleCount: Number(data[0].puzzle_count) || 0,
          offerCount: Number(data[0].offer_count) || 0,
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
