"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PendingCancellationSurvey } from "@/types/database";

const DISMISS_KEY = "selecting_alert_dismissed";
const SURVEY_SESSION_DISMISS_KEY = "cancellation_survey_session_dismissed";

export function usePendingCancellationSurvey() {
  const [survey, setSurvey] = useState<PendingCancellationSurvey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(SURVEY_SESSION_DISMISS_KEY)) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }

      // selecting 깃발이 있으면 SelectingFlagAlertSheet가 우선 — 설문 숨김
      supabase
        .from("puzzles")
        .select("id")
        .eq("leader_id", user.id)
        .eq("status", "selecting")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle()
        .then(({ data: selectingPuzzle }) => {
          const hasSelectingAlert =
            !!selectingPuzzle && !sessionStorage.getItem(DISMISS_KEY);
          if (hasSelectingAlert) { setLoading(false); return; }

          supabase
            .rpc("get_pending_cancellation_survey")
            .maybeSingle()
            .then(({ data }) => {
              if (data) setSurvey(data as PendingCancellationSurvey);
              setLoading(false);
            });
        });
    });
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SURVEY_SESSION_DISMISS_KEY, "1");
    setSurvey(null);
  };

  return { survey, loading, dismiss };
}
