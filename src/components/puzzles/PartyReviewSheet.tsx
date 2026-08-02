"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThumbsUp, Check } from "lucide-react";

// 파티원 긍정 태그 (부정 없음 — 보복·처벌 방지)
const PARTY_TAGS = ["매너 좋아요", "재밌어요", "또 보고 싶어요", "시간 잘 지켜요"];

const NOT_VISITED_REASONS = ["일정이 바뀌었어요", "마음에 드는 오퍼가 없었어요", "다른 곳으로 갔어요"];

export interface PartyParticipant {
  user_id: string;
  display_name: string | null;
  profile_image: string | null;
}

export interface PartyReviewItem {
  reviewee_id: string;
  liked: boolean;
  tags: string[];
}

interface PartyReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puzzleLabel: string;
  participants: PartyParticipant[];
  onSubmit?: (result: {
    visited: boolean;
    notVisitedReason?: string;
    reviews: PartyReviewItem[];
  }) => Promise<void> | void;
}

type Step = "visit" | "not_visited" | "review" | "done";

export function PartyReviewSheet({ open, onOpenChange, puzzleLabel, participants, onSubmit }: PartyReviewSheetProps) {
  const [step, setStep] = useState<Step>("visit");
  // reviewee_id → { liked, tags }
  const [reviews, setReviews] = useState<Record<string, { liked: boolean; tags: string[] }>>({});
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("visit");
    setReviews({});
    setSubmitting(false);
  };
  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 250);
  };

  const toggleLike = (uid: string) =>
    setReviews((prev) => {
      const cur = prev[uid] ?? { liked: false, tags: [] };
      return { ...prev, [uid]: { ...cur, liked: !cur.liked } };
    });
  const toggleTag = (uid: string, tag: string) =>
    setReviews((prev) => {
      const cur = prev[uid] ?? { liked: true, tags: [] };
      const has = cur.tags.includes(tag);
      return {
        ...prev,
        [uid]: {
          liked: true, // 태그 고르면 자동 좋아요
          tags: has ? cur.tags.filter((t) => t !== tag) : [...cur.tags, tag],
        },
      };
    });

  const handleNotVisited = async (reason: string) => {
    await onSubmit?.({ visited: false, notVisitedReason: reason, reviews: [] });
    close();
  };

  const buildReviews = (): PartyReviewItem[] =>
    Object.entries(reviews)
      .filter(([, v]) => v.liked || v.tags.length > 0)
      .map(([uid, v]) => ({ reviewee_id: uid, liked: v.liked, tags: v.tags }));

  const handleSubmitReview = async () => {
    setSubmitting(true);
    await onSubmit?.({ visited: true, reviews: buildReviews() });
    setSubmitting(false);
    setStep("done");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl p-0 max-h-[92vh] overflow-y-auto">
        {/* Q1 */}
        {step === "visit" && (
          <div className="px-5 pt-6 pb-10 space-y-5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground">{puzzleLabel}</p>
              <h2 className="text-[20px] font-black text-foreground leading-snug break-keep">파티 다녀오셨어요?</h2>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStep("review")}
                className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] active:scale-[0.99] transition-all"
              >
                네, 다녀왔어요 🎉
              </button>
              <button
                type="button"
                onClick={() => setStep("not_visited")}
                className="w-full h-12 rounded-2xl bg-muted/60 border border-border text-muted-foreground font-bold text-[14px] hover:bg-muted active:scale-[0.99] transition-all"
              >
                아니요, 안 갔어요
              </button>
            </div>
          </div>
        )}

        {/* 안 갔어요 사유 */}
        {step === "not_visited" && (
          <div className="px-5 pt-6 pb-10 space-y-5">
            <h2 className="text-[20px] font-black text-foreground leading-snug break-keep">왜 안 가게 되셨어요?</h2>
            <div className="space-y-2">
              {NOT_VISITED_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleNotVisited(r)}
                  className="w-full h-12 rounded-2xl bg-[#18181B] border border-border text-foreground font-bold text-[14px] hover:bg-[#202024] active:scale-[0.99] transition-all"
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleNotVisited("")}
                className="w-full h-11 text-[13px] font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                넘어가기
              </button>
            </div>
          </div>
        )}

        {/* 파티원 평가 */}
        {step === "review" && (
          <div className="px-5 pt-6 pb-10 space-y-5">
            <div className="space-y-1">
              <h2 className="text-[20px] font-black text-foreground leading-snug">같이 간 사람들, 어땠어요?</h2>
              <p className="text-[12.5px] text-muted-foreground">좋았던 사람에게 👍 눌러주세요. (선택)</p>
            </div>

            <div className="space-y-3">
              {participants.map((p) => {
                const r = reviews[p.user_id] ?? { liked: false, tags: [] };
                return (
                  <div key={p.user_id} className="rounded-2xl border border-border bg-[#18181B] p-3 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                        {p.profile_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.profile_image} alt={p.display_name ?? ""} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-foreground/40 font-black">
                            {(p.display_name ?? "?").charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="flex-1 min-w-0 text-[14px] font-black text-foreground truncate">
                        {p.display_name ?? "익명"}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleLike(p.user_id)}
                        className={`shrink-0 inline-flex items-center gap-1 px-3 h-9 rounded-full font-black text-[13px] transition-all active:scale-95 ${
                          r.liked ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" fill={r.liked ? "currentColor" : "none"} />
                        좋았어요
                      </button>
                    </div>
                    {/* 태그 — 좋아요 눌렀거나 태그 있을 때만 노출 */}
                    {(r.liked || r.tags.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {PARTY_TAGS.map((tag) => {
                          const on = r.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(p.user_id, tag)}
                              className={`text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-colors ${
                                on ? "bg-amber-500/20 text-brand-amber border border-amber-500/40" : "bg-card text-muted-foreground border border-border"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleSubmitReview}
                disabled={submitting}
                className="w-full h-13 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl disabled:opacity-50 transition-all"
              >
                {submitting ? "등록 중..." : buildReviews().length > 0 ? "평가 남기기" : "평가 없이 완료"}
              </Button>
            </div>
          </div>
        )}

        {/* 완료 */}
        {step === "done" && (
          <div className="px-5 pt-10 pb-14 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center text-[34px]">🎉</div>
            <h2 className="text-[19px] font-black text-foreground">고마워요!</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep max-w-[280px]">
              나플과 함께 또 다른 즐거운 밤을 맞아봐요!
            </p>
            <Button onClick={close} className="mt-3 w-full h-12 bg-muted/60 border border-border text-foreground font-bold text-[14px] rounded-2xl">
              닫기
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
