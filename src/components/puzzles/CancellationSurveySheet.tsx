"use client";

import { useEffect, useRef, useState } from "react";
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

// 사유 3개 + "넘어가기". 1·2번(일정/오퍼)은 탭하면 직접입력을 유도, 3번은 즉시 저장.
const REASONS: { value: PuzzleCancelReason; label: string }[] = [
  { value: "schedule_change", label: "약속/일정이 바뀌었어요" },
  { value: "weak_offers",     label: "마음에 드는 오퍼가 없었어요" },
  { value: "forgot_about_it", label: "잊어버렸어요" },
];

// 탭 시 직접입력 창이 뜨는 사유. "직접 입력"(other)만 사용.
const DETAIL_PROMPTS: Partial<Record<PuzzleCancelReason, { placeholder: string }>> = {
  weak_offers: {
    placeholder: "예: 가격, 클럽, 테이블 구성 등 어떤 오퍼를 원하셨나요?",
  },
  other: {
    placeholder: "어떤 점이 아쉬우셨는지 적어주세요",
  },
};

export function CancellationSurveySheet({ isOtherSheetOpen }: { isOtherSheetOpen: boolean }) {
  const { survey, loading, dismiss } = usePendingCancellationSurvey();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // 직접입력이 필요한 사유를 탭한 상태 (일정/오퍼)
  const [detailReason, setDetailReason] = useState<PuzzleCancelReason | null>(null);
  const [text, setText] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const open = !loading && !!survey && !isOtherSheetOpen;

  // 시트 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setSubmitting(false);
      setDetailReason(null);
      setText("");
    }
  }, [open]);

  const detail = detailReason ? DETAIL_PROMPTS[detailReason] : undefined;

  // 제출 완료 후 자동 닫기
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => dismiss(), 2200);
    return () => clearTimeout(t);
  }, [submitted, dismiss]);

  // 실제 제출 (DB 저장)
  const submitSurvey = async (reason: PuzzleCancelReason, reasonText: string | null) => {
    if (!survey || submitting) return;
    setSubmitting(true);
    const supabase = createClient();
    await supabase.rpc("submit_cancellation_survey", {
      p_puzzle_id: survey.puzzle_id,
      p_reason_categories: [reason],
      p_reason_text: reasonText,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  // 선택지 탭: 1·2번(일정/오퍼)은 직접입력 유도, 3번은 즉시 제출
  const handleReasonTap = (reason: PuzzleCancelReason) => {
    if (submitting) return;
    if (DETAIL_PROMPTS[reason]) {
      setDetailReason((prev) => (prev === reason ? null : reason));
      setText("");
      setTimeout(() => textRef.current?.focus(), 50);
      return;
    }
    submitSurvey(reason, null);
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
            {/* 헤더 — 위계: 슬픈 이모지 / 제목 크게 / 부제 작게·흐리게 */}
            <div className="space-y-1.5 text-center">
              <p className="text-[40px] leading-none mb-1">🥲</p>
              <p className="text-[20px] font-black text-white leading-snug">지난번 깃발이 매치 실패했어요.</p>
              <p className="text-[13px] text-neutral-400">
                서비스 향상을 위해 이유를 알려주시겠어요?
              </p>
            </div>

            {/* 사유 옵션 — 3개는 원탭 즉시완료, "직접 입력"은 창을 띄움.
                직접입력 사유 선택 시 나머지는 숨겨 집중(다시 누르면 복귀) */}
            <div className="space-y-2 px-1">
              {(detailReason ? REASONS.filter((r) => r.value === detailReason) : REASONS).map(({ value, label }) => {
                const active = detailReason === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleReasonTap(value)}
                    disabled={submitting}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border active:scale-[0.98] disabled:opacity-40 ${
                      active
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-neutral-500 border-neutral-800"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {/* 직접 입력 — 탭하면 입력창 노출. 다른 사유 직접입력 중이면 숨김 */}
              {(!detailReason || detailReason === "other") && (
                <button
                  onClick={() => handleReasonTap("other")}
                  disabled={submitting}
                  className={`w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border active:scale-[0.98] disabled:opacity-40 ${
                    detailReason === "other"
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-neutral-500 border-neutral-800"
                  }`}
                >
                  직접 입력
                </button>
              )}

              {/* 직접입력 창 (직접 입력 선택 시) */}
              {detailReason && detail && (
                <div className="pt-1">
                  <textarea
                    ref={textRef}
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 300))}
                    placeholder={detail.placeholder}
                    rows={3}
                    className="w-full bg-neutral-900 border border-amber-500/60 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-neutral-500 resize-none outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    onClick={() => submitSurvey(detailReason, text.trim() || null)}
                    disabled={submitting}
                    className="w-full mt-2 py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] active:scale-[0.98] transition-all disabled:opacity-40"
                  >
                    {submitting ? "처리 중…" : "제출하기"}
                  </button>
                </div>
              )}

              {/* 넘어가기 */}
              {!detailReason && (
                <button
                  onClick={handleSkip}
                  disabled={submitting}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border bg-neutral-900 text-neutral-200 border-neutral-700 active:scale-[0.98] disabled:opacity-40"
                >
                  넘어가기
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
