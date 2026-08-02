"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Star, Check, Instagram } from "lucide-react";

// 파트너 평가 태그 (긍정형만)
const REVIEW_TAGS = [
  "답장이 빨라요",
  "친절해요",
  "꼼꼼하게 챙겨줘요",
  "서비스가 후해요",
  "분위기 메이커",
  "가격이 합리적이에요",
  "또 연락하고 싶어요",
  "친구에게 추천할래요",
];

const RATING_LABELS: Record<number, string> = {
  1: "아쉬워요",
  2: "별로예요",
  3: "보통이에요",
  4: "좋아요",
  5: "최고예요",
};

export interface VisitPartnerOption {
  md_id: string;
  display_name: string | null;
  profile_image: string | null;
  instagram: string | null;
  club_name?: string | null;
}

interface VisitConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puzzleLabel: string; // "8/1(토) 홍대 · 예산 50만원"
  partners: VisitPartnerOption[];
  /** 실제 제출 핸들러 — 프리뷰에선 목업 */
  onSubmit?: (result: {
    didVisit: boolean;
    matchedMdId: string | null;
    rating: number;
    tags: string[];
    comment: string;
  }) => Promise<void> | void;
}

type Step = "visit" | "partner" | "review" | "done";

export function VisitConfirmSheet({
  open,
  onOpenChange,
  puzzleLabel,
  partners,
  onSubmit,
}: VisitConfirmSheetProps) {
  const [step, setStep] = useState<Step>("visit");
  const [matchedMdId, setMatchedMdId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeRating = hoverRating || rating;

  const reset = () => {
    setStep("visit");
    setMatchedMdId(null);
    setRating(0);
    setHoverRating(0);
    setTags([]);
    setComment("");
    setSubmitting(false);
  };

  const close = () => {
    onOpenChange(false);
    // 시트 닫힘 애니메이션 후 초기화
    setTimeout(reset, 250);
  };

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const handleNotVisited = async () => {
    await onSubmit?.({ didVisit: false, matchedMdId: null, rating: 0, tags: [], comment: "" });
    close();
  };

  const handleSubmitReview = async () => {
    setSubmitting(true);
    await onSubmit?.({ didVisit: true, matchedMdId, rating, tags, comment });
    setSubmitting(false);
    setStep("done");
  };

  const handleSkipReview = async () => {
    await onSubmit?.({ didVisit: true, matchedMdId, rating: 0, tags: [], comment: "" });
    setStep("done");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <SheetContent
        side="bottom"
        className="bg-card border-border rounded-t-3xl p-0 max-h-[92vh] overflow-y-auto"
      >
        {/* ─────────── Q1: 방문 여부 ─────────── */}
        {step === "visit" && (
          <div className="px-5 pt-6 pb-10 space-y-5">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-muted-foreground tracking-wide">{puzzleLabel}</p>
              <h2 className="text-[20px] font-black text-foreground leading-snug break-keep">
                이 깃발, 클럽 다녀오셨어요?
              </h2>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStep("partner")}
                className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
              >
                네, 다녀왔어요 🎉
              </button>
              <button
                type="button"
                onClick={handleNotVisited}
                className="w-full h-12 rounded-2xl bg-muted/60 border border-border text-muted-foreground font-bold text-[14px] hover:bg-muted active:scale-[0.99] transition-all"
              >
                아니요, 안 갔어요
              </button>
            </div>
          </div>
        )}

        {/* ─────────── Q2: 파트너 선택 ─────────── */}
        {step === "partner" && (
          <div className="px-5 pt-6 pb-10 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-[20px] font-black text-foreground leading-snug break-keep">
                별점을 선물해주시겠어요?
              </h2>
              <p className="text-[13px] text-brand-amber font-bold leading-relaxed break-keep">
                파트너에게 큰 힘이 돼요!
              </p>
            </div>

            <div className="space-y-2">
              {partners.map((p) => {
                const active = p.md_id === matchedMdId;
                return (
                  <button
                    key={p.md_id}
                    type="button"
                    onClick={() => setMatchedMdId(p.md_id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                      active
                        ? "bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30"
                        : "bg-[#18181B] border-border hover:bg-[#202024]"
                    }`}
                  >
                    <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
                      {p.profile_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.profile_image} alt={p.display_name ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-foreground/40 font-black">
                          {(p.display_name ?? "P").charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-black text-foreground truncate">
                        {p.display_name ?? "파트너"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-muted-foreground">
                        {p.club_name && <span className="truncate">{p.club_name}</span>}
                        {p.instagram && (
                          <span className="inline-flex items-center gap-0.5 text-pink-400">
                            <Instagram className="w-3 h-3" />@{p.instagram}
                          </span>
                        )}
                      </div>
                    </div>
                    {active && (
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-black" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <Button
              onClick={() => setStep("review")}
              disabled={!matchedMdId}
              className="w-full h-13 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl disabled:opacity-40 transition-all"
            >
              다음
            </Button>
          </div>
        )}

        {/* ─────────── 리뷰: 별점 + 태그 + 한줄 (선택) ─────────── */}
        {step === "review" && (
          <div className="px-5 pt-6 pb-10 space-y-6">
            {/* 별점 */}
            <div className="space-y-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 active:scale-90 transition-transform"
                    aria-label={`${n}점`}
                  >
                    <Star
                      className={`w-10 h-10 ${
                        n <= activeRating ? "fill-amber-400 text-brand-amber" : "fill-transparent text-muted-foreground"
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
              <p className={`text-[13px] font-bold ${activeRating > 0 ? "text-brand-amber" : "text-muted-foreground"}`}>
                {activeRating > 0 ? RATING_LABELS[activeRating] : "별을 눌러 평가해주세요"}
              </p>
            </div>

            {/* 태그 */}
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold text-foreground/80">
                좋았던 점 <span className="text-[11px] text-muted-foreground font-medium">(선택)</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {REVIEW_TAGS.map((tag) => {
                  const active = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`text-[12.5px] font-bold px-3 py-2 rounded-full transition-colors ${
                        active ? "bg-amber-500 text-black" : "bg-[#18181B] text-muted-foreground hover:bg-muted border border-border"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 한줄 */}
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold text-foreground/80">
                한마디 <span className="text-[11px] text-muted-foreground font-medium">(선택)</span>
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="무엇이 가장 만족스러웠나요?"
                rows={3}
                maxLength={300}
                className="w-full bg-[#18181B] border border-border rounded-xl px-3 py-2.5 text-[13.5px] text-foreground/90 placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleSubmitReview}
                disabled={rating === 0 || submitting}
                className="w-full h-13 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl disabled:opacity-40 transition-all"
              >
                {submitting ? "등록 중..." : "리뷰 남기기"}
              </Button>
              <button
                type="button"
                onClick={handleSkipReview}
                className="w-full h-10 text-[13px] font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                리뷰 없이 완료
              </button>
            </div>
          </div>
        )}

        {/* ─────────── 완료 ─────────── */}
        {step === "done" && (
          <div className="px-5 pt-10 pb-14 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center text-[34px]">
              🎉
            </div>
            <h2 className="text-[19px] font-black text-foreground">확인해주셔서 고마워요!</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep max-w-[280px]">
              나플과 함께 또 다른 즐거운 밤을 맞아봐요!
            </p>
            <Button
              onClick={close}
              className="mt-3 w-full h-12 bg-muted/60 border border-border text-foreground font-bold text-[14px] rounded-2xl"
            >
              닫기
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
