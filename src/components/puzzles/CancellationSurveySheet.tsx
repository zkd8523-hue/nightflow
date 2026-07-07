"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePendingCancellationSurvey } from "@/hooks/usePendingCancellationSurvey";
type PuzzleCancelReason =
  | "schedule_change"
  | "no_preferred_venue"
  | "weak_offers"
  | "mind_change"
  | "forgot_about_it"
  | "other"
  | "no_answer";

// 원탭 즉시완료: 선택지 하나 탭 = 즉시 저장. 사유 3개 + "넘어가기" = 4개.
// (원하는 장소·단순변심·기타 제거로 압축)
const REASONS: { value: PuzzleCancelReason; label: string }[] = [
  { value: "schedule_change", label: "약속/일정이 바뀌었어요" },
  { value: "weak_offers",     label: "마음에 드는 오퍼가 없었어요" },
  { value: "forgot_about_it", label: "잊어버렸어요" },
];

const TRIGGER_COPY: Record<string, string> = {
  self_cancelled:    "잠깐 이유를 알려주실 수 있을까요?",
  selecting_expired: "어떤 점이 결정을 어렵게 했나요?",
};

export function CancellationSurveySheet({ isOtherSheetOpen }: { isOtherSheetOpen: boolean }) {
  const { survey, loading, dismiss } = usePendingCancellationSurvey();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const open = !loading && !!survey && !isOtherSheetOpen;

  // 시트 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setSubmitting(false);
    }
  }, [open]);

  // 제출 완료 후 자동 닫기
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => dismiss(), 2200);
    return () => clearTimeout(t);
  }, [submitted, dismiss]);

  // 선택지 탭 = 즉시 제출
  const handleReasonTap = async (reason: PuzzleCancelReason) => {
    if (!survey || submitting) return;
    setSubmitting(true);
    const supabase = createClient();
    await supabase.rpc("submit_cancellation_survey", {
      p_puzzle_id: survey.puzzle_id,
      p_reason_categories: [reason],
      p_reason_text: null,
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
            </div>

            {/* 사유 옵션 — 탭 즉시완료 (제출 버튼 없음) */}
            <div className="space-y-2 px-1">
              {REASONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleReasonTap(value)}
                  disabled={submitting}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border bg-neutral-900 text-neutral-200 border-neutral-700 active:bg-white active:text-black active:scale-[0.98] disabled:opacity-40"
                >
                  {label}
                </button>
              ))}

              {/* 넘어가기 */}
              <button
                onClick={handleSkip}
                disabled={submitting}
                className="w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border bg-transparent text-neutral-500 border-neutral-800 active:scale-[0.98] disabled:opacity-40"
              >
                넘어가기
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
