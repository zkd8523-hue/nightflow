"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PartyParticipant } from "@/components/puzzles/PartyReviewSheet";

export interface PendingPartyReview {
  puzzle_id: string;
  event_date: string | null;
  area: string | null;
  participants: PartyParticipant[];
}

const DISMISS_KEY = "party_review_session_dismissed";

export function usePendingPartyReview() {
  const [pending, setPending] = useState<PendingPartyReview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("get_pending_party_review").maybeSingle();
    if (data) {
      const row = data as Omit<PendingPartyReview, "participants"> & { participants: PartyParticipant[] | null };
      // 같이 간 사람이 있어야 의미 있음 (RPC가 이미 필터하지만 안전망)
      if ((row.participants ?? []).length > 0) {
        setPending({ ...row, participants: row.participants ?? [] });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setPending(null);
  }, []);

  const resolveAndNext = useCallback(async () => {
    setPending(null);
    await load();
  }, [load]);

  return { pending, loading, dismiss, resolveAndNext };
}
