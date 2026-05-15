"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePendingCancellationSurvey } from "@/hooks/usePendingCancellationSurvey";
import type { PuzzleCancelReason } from "@/types/database";

const REASONS: { value: PuzzleCancelReason; label: string }[] = [
  { value: "schedule_change",    label: "약속/일정이 바뀌었어요" },
  { value: "no_preferred_venue", label: "원하는 장소가 없어요" },
  { value: "weak_offers",        label: "오퍼가 별로였어요" },
  { value: "forgot_about_it",    label: "잊어버렸어요" },
  { value: "mind_change",        label: "단순변심" },
  { value: "other",              label: "기타 (직접 입력)" },
];

const TRIGGER_COPY: Record<string, string> = {
  self_cancelled:    "잠깐 이유를 알려주실 수 있을까요?",
  selecting_expired: "어떤 점이 결정을 어렵게 했나요?",
};

export function CancellationSurveySheet({ isOtherSheetOpen }: { isOtherSheetOpen: boolean }) {
  const { survey, loading, dismiss } = usePendingCancellationSurvey();
  const [selected, setSelected] = useState<Set<PuzzleCancelReason>>(new Set());
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const open = !loading && !!survey && !isOtherSheetOpen;
  const hasOther = selected.has("other");
  const isSubmittable = selected.size > 0 && !(hasOther && !text.trim());

  // 시트 열릴 때 선택 상태 초기화
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setText("");
      setSubmitted(false);
    }
  }, [open]);

  // 제출 완료 후 자동 닫기
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => dismiss(), 2200);
    return () => clearTimeout(t);
  }, [submitted, dismiss]);

  const toggleReason = (value: PuzzleCancelReason) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        if (value === "other") setText("");
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!survey || !isSubmittable) return;
    setSubmitting(true);
    const supabase = createClient();
    await supabase.rpc("submit_cancellation_survey", {
      p_puzzle_id: survey.puzzle_id,
      p_reason_categories: Array.from(selected),
      p_reason_text: text.trim() || null,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  const handleSkip = async () => {
    if (!survey) return;
    const supabase = createClient();
    // 누적된 모든 미응답 건을 한 번에 no_answer로 마킹 — 더 이상 반복되지 않도록
    await supabase.rpc("bulk_skip_pending_cancellation_surveys");
    dismiss();
  };

  if (!survey) return null;

  return (
    <Sheet open={open} onOpenChange={() => {}}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#1C1C1E] border-neutral-700 pb-10 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        {submitted ? (
          /* 제출 완료 — 감사 정적 화면 */
          <div className="py-14 flex flex-col items-center justify-center text-center min-h-[280px]">
            <p className="text-[40px] mb-3">🎉</p>
            <p className="text-[24px] font-black text-white mb-2">감사합니다</p>
            <p className="text-[14px] text-neutral-400">소중한 의견 잘 받았어요</p>
            <p className="text-[13px] text-amber-400 font-bold mt-3">곧 더 좋은 서비스로 보답할게요</p>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            {/* 헤더 */}
            <div className="space-y-1 text-center">
              <p className="text-[16px] font-bold text-white">지난번 깃발이 매치 실패했어요.</p>
              <p className="text-[16px] font-bold text-white">
                {TRIGGER_COPY[survey.trigger_type] ?? "이유를 알려주실 수 있을까요?"}
              </p>
              <p className="text-[16px] font-bold text-amber-400">서비스 향상에 큰 도움이 됩니다!</p>
            </div>

            {/* 사유 옵션 (복수선택 가능) */}
            <div className="space-y-2 px-1">
              <p className="text-[12px] text-neutral-500 px-1">여러 개 선택 가능</p>
              {REASONS.map(({ value, label }) => {
                const active = selected.has(value);
                return (
                  <button
                    key={value}
                    onClick={() => toggleReason(value)}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-[15px] font-bold transition-all border ${
                      active
                        ? "bg-white text-black border-white"
                        : "bg-neutral-900 text-neutral-300 border-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* 자유서술 (other 선택 시 필수, 그 외 선택) */}
            {selected.size > 0 && (
              <div className="px-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 300))}
                  placeholder={
                    hasOther
                      ? "어떤 점이 아쉬우셨는지 알려주세요 (필수)"
                      : "더 알려주실 게 있다면 적어주세요 (선택)"
                  }
                  rows={3}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-neutral-500 resize-none outline-none focus:border-neutral-500"
                />
                <p className="text-right text-[11px] text-neutral-600 mt-1">{text.length}/300</p>
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="space-y-2 px-1">
              <button
                onClick={handleSubmit}
                disabled={!isSubmittable || submitting}
                className="w-full py-4 rounded-2xl bg-white text-black font-black text-[16px] disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              >
                {submitting ? "제출 중…" : "제출하기"}
              </button>
              <button
                onClick={handleSkip}
                className="w-full py-2 text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                잘 모르겠어요
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
