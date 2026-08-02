"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VisitPartnerOption } from "@/components/puzzles/VisitConfirmSheet";

export interface PendingVisitConfirm {
  puzzle_id: string;
  club_label: string | null;
  event_date: string | null;
  area: string | null;
  total_budget: number | null;
  is_recruiting_party: boolean;
  partners: VisitPartnerOption[];
}

// 세션당 1회만 — 닫으면(응답 없이) 이번 세션엔 다시 안 뜬다. (응답하면 DB가 영구 기록)
const DISMISS_KEY = "visit_confirm_session_dismissed";

export function usePendingVisitConfirm() {
  const [pending, setPending] = useState<PendingVisitConfirm | null>(null);
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
    const { data } = await supabase.rpc("get_pending_visit_confirm").maybeSingle();
    if (data) {
      const row = data as Omit<PendingVisitConfirm, "partners"> & { partners: VisitPartnerOption[] | null };
      setPending({ ...row, partners: row.partners ?? [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 이번 세션 숨김 (응답 없이 닫기)
  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setPending(null);
  }, []);

  // 응답 완료 → 현재 항목 제거하고 다음 대기 건 있으면 로드
  const resolveAndNext = useCallback(async () => {
    setPending(null);
    await load();
  }, [load]);

  return { pending, loading, dismiss, resolveAndNext };
}
