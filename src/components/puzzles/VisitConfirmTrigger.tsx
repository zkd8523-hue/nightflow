"use client";

import { useEffect, useMemo, useRef } from "react";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { VisitConfirmSheet } from "./VisitConfirmSheet";
import { usePendingVisitConfirm } from "@/hooks/usePendingVisitConfirm";

/**
 * 만료된 깃발(오퍼 1개 이상 받은)의 방장에게 다음 접속 시 "다녀오셨어요?" 시트를 띄운다.
 * layout에 전역 마운트. 응답하면 DB에 기록(재질문 X), 응답 없이 닫으면 이번 세션만 숨김.
 */
export function VisitConfirmTrigger() {
  const { pending, dismiss, resolveAndNext } = usePendingVisitConfirm();
  // 이번 시트에서 실제 응답(RPC 성공)했는지 — 닫힐 때 "다음 건 로드" vs "세션 숨김" 분기
  const answeredRef = useRef(false);

  useEffect(() => {
    answeredRef.current = false;
  }, [pending?.puzzle_id]);

  const label = useMemo(() => {
    if (!pending) return "";
    const d = pending.event_date ? dayjs(pending.event_date).format("M/D(ddd)") : "";
    const parts = [d, pending.area].filter(Boolean) as string[];
    if (pending.total_budget) parts.push(`예산 ${pending.total_budget.toLocaleString()}원`);
    return parts.join(" · ");
  }, [pending]);

  if (!pending) return null;

  return (
    <VisitConfirmSheet
      open={!!pending}
      onOpenChange={(v) => {
        if (v) return;
        // 응답했으면 다음 대기 건 이어서, 아니면 이번 세션만 숨김
        if (answeredRef.current) resolveAndNext();
        else dismiss();
      }}
      puzzleLabel={label}
      partners={pending.partners}
      onSubmit={async (r) => {
        const supabase = createClient();
        if (r.didVisit && r.rating > 0 && r.matchedMdId) {
          const { data, error } = await supabase.rpc("submit_visit_review", {
            p_puzzle_id: pending.puzzle_id,
            p_md_id: r.matchedMdId,
            p_rating: r.rating,
            p_comment: r.comment || null,
            p_tags: r.tags,
          });
          if (error || !(data as { success?: boolean })?.success) return;
        } else {
          await supabase.rpc("answer_visit_confirm", {
            p_puzzle_id: pending.puzzle_id,
            p_did_visit: r.didVisit,
            p_not_visited_reason: r.notVisitedReason ?? null,
          });
        }
        answeredRef.current = true;
      }}
    />
  );
}
