"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "nf_last_seen_touched_at";
const THROTTLE_MS = 60 * 60 * 1000; // 1시간

export function useTouchLastSeen(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    try {
      const last = localStorage.getItem(STORAGE_KEY);
      if (last && Date.now() - parseInt(last, 10) < THROTTLE_MS) return;
    } catch {}

    const supabase = createClient();
    supabase.rpc("touch_last_seen").then(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {}
    });
  }, [userId]);
}
