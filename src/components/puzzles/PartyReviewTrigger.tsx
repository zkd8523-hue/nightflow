"use client";

import { useEffect, useMemo, useRef } from "react";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { PartyReviewSheet } from "./PartyReviewSheet";
import { usePendingPartyReview } from "@/hooks/usePendingPartyReview";

/**
 * 만료된 조각(파티)의 참여자에게 다음날 "다녀오셨어요? → 같이 간 사람들 평가" 시트를 띄운다.
 * layout에 전역 마운트. 참여자 각자가 대상 (방장 한정 아님).
 */
export function PartyReviewTrigger() {
  const { pending, dismiss, resolveAndNext } = usePendingPartyReview();
  const answeredRef = useRef(false);

  useEffect(() => {
    answeredRef.current = false;
  }, [pending?.puzzle_id]);

  const label = useMemo(() => {
    if (!pending) return "";
    const d = pending.event_date ? dayjs(pending.event_date).format("M/D(ddd)") : "";
    return [d, pending.area].filter(Boolean).join(" · ");
  }, [pending]);

  if (!pending) return null;

  return (
    <PartyReviewSheet
      open={!!pending}
      onOpenChange={(v) => {
        if (v) return;
        if (answeredRef.current) resolveAndNext();
        else dismiss();
      }}
      puzzleLabel={label}
      participants={pending.participants}
      onSubmit={async (r) => {
        const supabase = createClient();
        if (r.visited) {
          // 방문 + 파티원 리뷰 (빈 배열이어도 방문함으로 마킹됨)
          const { data, error } = await supabase.rpc("submit_party_review", {
            p_puzzle_id: pending.puzzle_id,
            p_reviews: r.reviews,
          });
          if (error || !(data as { success?: boolean })?.success) return;
        } else {
          await supabase.rpc("answer_party_visit", {
            p_puzzle_id: pending.puzzle_id,
            p_visited: false,
            p_not_visited_reason: r.notVisitedReason ?? null,
          });
        }
        answeredRef.current = true;
      }}
    />
  );
}
