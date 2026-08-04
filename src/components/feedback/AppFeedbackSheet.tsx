"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAppFeedbackPrompt } from "@/hooks/useAppFeedbackPrompt";
import { snoozeFeedback } from "@/lib/utils/appFeedbackEngagement";

// 별점 라벨 (탭 시 짧은 반응)
const RATING_LABEL = ["", "별로예요", "아쉬워요", "괜찮아요", "좋아요", "최고예요"];

/**
 * 네이티브 앱 유저 대상 인앱 피드백 시트. 진입 즉시 팝업이 아니라
 * 일정 인게이지먼트 이후 노출(게이팅은 useAppFeedbackPrompt).
 */
export function AppFeedbackSheet({ isOtherSheetOpen = false }: { isOtherSheetOpen?: boolean }) {
  const { shouldShow, close } = useAppFeedbackPrompt();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const open = shouldShow && !isOtherSheetOpen;

  useEffect(() => {
    if (open) { setRating(0); setText(""); setSubmitting(false); setSubmitted(false); }
  }, [open]);

  // 제출 완료 후 자동 닫기
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => close(), 2200);
    return () => clearTimeout(t);
  }, [submitted, close]);

  const pickRating = (n: number) => {
    if (submitting) return;
    setRating(n);
    setTimeout(() => textRef.current?.focus(), 50);
  };

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    let platform = "web";
    try {
      const { Capacitor } = await import("@capacitor/core");
      platform = Capacitor.getPlatform();
    } catch { /* web */ }
    const supabase = createClient();
    await supabase.rpc("submit_app_feedback", {
      p_rating: rating,
      p_comment: text.trim() || null,
      p_platform: platform,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  const skip = () => {
    // "다음에" → 30일간 재노출 안 함(그 뒤 조건 만족 시 1회 더). 제출만 영구 종료.
    snoozeFeedback();
    close();
  };

  if (!shouldShow) return null;

  return (
    <Sheet open={open} onOpenChange={() => {}}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-card border-border pb-10 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        {submitted ? (
          <div className="py-14 flex flex-col items-center justify-center text-center min-h-[280px]">
            <p className="text-[40px] mb-3">🙌</p>
            <p className="text-[24px] font-black text-foreground mb-2">감사합니다</p>
            <p className="text-[14px] text-muted-foreground">소중한 의견 잘 받았어요</p>
            <p className="text-[13px] text-brand-amber font-bold mt-3">더 좋은 나플로 보답할게요</p>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5 text-center">
              <p className="text-[40px] leading-none mb-1">💬</p>
              <p className="text-[20px] font-black text-foreground leading-snug">나플, 써보니 어떠세요?</p>
              <p className="text-[13px] text-muted-foreground">
                불편했던 점이나 바라는 점을 알려주세요.<br />더 나은 나플을 만드는 데 참고할게요.
              </p>
            </div>

            {/* 별점 */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pickRating(n)}
                    disabled={submitting}
                    className={`text-[34px] leading-none transition-transform active:scale-90 disabled:opacity-40 ${
                      n <= rating ? "" : "grayscale opacity-40"
                    }`}
                    aria-label={`${n}점`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              <p className="text-[13px] font-bold text-brand-amber h-5">{RATING_LABEL[rating]}</p>
            </div>

            {/* 한 줄 의견 (선택) — 별점 고른 뒤 노출 */}
            {rating > 0 && (
              <div className="px-1">
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 300))}
                  placeholder="불편했던 점, 있었으면 하는 기능… 뭐든 좋아요 (선택)"
                  rows={3}
                  className="w-full bg-card border border-amber-500/60 rounded-2xl px-4 py-3 text-[14px] text-foreground placeholder-neutral-500 resize-none outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full mt-2 py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {submitting ? "보내는 중…" : "의견 보내기"}
                </button>
              </div>
            )}

            {/* 다음에 */}
            {rating === 0 && (
              <div className="px-1">
                <button
                  onClick={skip}
                  disabled={submitting}
                  className="w-full text-center px-4 py-3.5 rounded-2xl text-[15px] font-bold transition-all border bg-card text-muted-foreground border-border active:scale-[0.98] disabled:opacity-40"
                >
                  다음에
                </button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
