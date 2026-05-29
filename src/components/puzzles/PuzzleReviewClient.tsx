"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface PuzzleReviewProps {
  puzzle: {
    id: string;
    area: string;
    event_date: string;
    target_count: number;
    total_budget: number | null;
    budget_per_person: number;
    notes: string | null;
  };
  acceptedOffer: {
    id: string;
    proposed_price: number;
    club?: { id: string; name: string } | null;
    md?: { id: string; display_name: string | null; profile_image: string | null; instagram: string | null } | null;
  } | null;
}

const REVIEW_TAGS = [
  "친절해요",
  "가격 만족",
  "분위기 좋음",
  "서비스 좋음",
  "위치 좋음",
  "추천해요",
];

const RATING_LABELS: Record<number, string> = {
  1: "아쉬워요",
  2: "별로예요",
  3: "보통이에요",
  4: "좋아요",
  5: "최고예요",
};

function formatEventDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export function PuzzleReviewClient({ puzzle, acceptedOffer }: PuzzleReviewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledRating = Number(searchParams.get("rating"));
  const initialRating = prefilledRating >= 1 && prefilledRating <= 5 ? prefilledRating : 0;
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalBudget = puzzle.total_budget ?? puzzle.budget_per_person * puzzle.target_count;
  const clubName = acceptedOffer?.club?.name;
  const mdName = acceptedOffer?.md?.display_name;
  const mdInstagram = acceptedOffer?.md?.instagram;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("별점을 선택해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_puzzle_review", {
        p_puzzle_id: puzzle.id,
        p_rating: rating,
        p_comment: comment.trim() || null,
        p_tags: selectedTags,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } | null;
      if (!result?.success) {
        toast.error(result?.error || "리뷰 등록에 실패했어요");
        return;
      }
      toast.success("리뷰가 등록되었어요. 감사합니다!");
      router.push(`/flags/${puzzle.id}`);
    } catch (err) {
      console.error("[submit_puzzle_review]", err);
      toast.error("리뷰 등록에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || rating;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-32">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[#0A0A0A]/95 backdrop-blur-sm border-b border-neutral-900">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-neutral-900 active:scale-95 transition"
            aria-label="뒤로"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[16px] font-black tracking-tight">리뷰 작성</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {/* 매치 요약 카드 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-2">
          <p className="text-[11px] text-neutral-500 font-medium tracking-wide">매치된 깃발</p>
          <p className="text-[14px] font-bold text-neutral-100 break-keep">
            {puzzle.notes || `${puzzle.area}에서 모여요`}
          </p>
          <p className="text-[11.5px] text-neutral-500 font-medium">
            {formatEventDate(puzzle.event_date)} · {puzzle.area} · {puzzle.target_count}명 · 예산{" "}
            {totalBudget.toLocaleString()}원
          </p>
          {clubName && (
            <div className="pt-2 border-t border-neutral-800">
              <p className="text-[16px] font-black text-amber-300 tracking-tight">{clubName}</p>
              {(mdName || mdInstagram) && (
                <p className="text-[11.5px] text-neutral-500 font-medium mt-0.5">
                  담당파트너 {mdName ? mdName : ""}{mdInstagram ? ` @${mdInstagram}` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 별점 */}
        <div className="space-y-3 text-center">
          <h2 className="text-[14px] font-bold text-neutral-300">담당자는 어땠나요?</h2>
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
                  className={`w-9 h-9 ${
                    n <= activeRating
                      ? "fill-amber-400 text-amber-400"
                      : "fill-transparent text-neutral-700"
                  }`}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          <p
            className={`text-[13px] font-bold tracking-tight ${
              activeRating > 0 ? "text-amber-300" : "text-neutral-600"
            }`}
          >
            {activeRating > 0 ? RATING_LABELS[activeRating] : "별을 눌러 평가해주세요"}
          </p>
        </div>

        {/* 태그 */}
        <div className="space-y-2">
          <h2 className="text-[14px] font-bold text-neutral-300">
            좋았던 점 <span className="text-[11px] text-neutral-500 font-medium">(선택)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {REVIEW_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[12.5px] font-bold px-3 py-2 rounded-full transition-colors ${
                    active
                      ? "bg-amber-500 text-black"
                      : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* 멘트 */}
        <div className="space-y-2">
          <h2 className="text-[14px] font-bold text-neutral-300">
            한마디 <span className="text-[11px] text-neutral-500 font-medium">(선택)</span>
          </h2>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="어떤 점이 좋았는지, 다음 손님께 추천 한마디 부탁드려요"
            rows={4}
            maxLength={300}
            className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3 py-2.5 text-[13.5px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 resize-none"
          />
          <p className="text-[10.5px] text-neutral-600 text-right">{comment.length}/300</p>
        </div>
      </div>

      {/* 하단 고정 CTA */}
      <div className="fixed inset-x-0 bg-[#0A0A0A]/95 backdrop-blur-sm border-t border-neutral-900 z-30" style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)" }}>
        <div className="max-w-lg mx-auto px-4 py-3">
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[15px] rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? "등록 중..." : "리뷰 등록하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
