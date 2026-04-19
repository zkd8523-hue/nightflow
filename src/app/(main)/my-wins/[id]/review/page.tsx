"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Star, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;

  interface AuctionDetails {
    status: string;
    club?: { name?: string } | null;
  }
  interface ReviewDetails {
    rating?: number;
    comment?: string;
  }
  const [auction, setAuction] = useState<AuctionDetails | null>(null);
  const [existingReview, setExistingReview] = useState<ReviewDetails | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // 경매 정보
      const { data: auctionData } = await supabase
        .from("auctions")
        .select("*, club:clubs(name, area)")
        .eq("id", auctionId)
        .single();

      if (!auctionData || auctionData.winner_id !== user.id) {
        router.push("/my-wins");
        return;
      }

      setAuction(auctionData);

      // 기존 리뷰 확인
      const res = await fetch(`/api/auction/review?auctionId=${auctionId}`);
      const { review } = await res.json();
      if (review) {
        setExistingReview(review);
        setRating(review.rating);
        setComment(review.comment || "");
      }

      setLoading(false);
    }
    load();
  }, [auctionId, router]);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auction/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId, rating, comment }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "제출에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // 제출 완료 화면
  if (submitted || existingReview) {
    const displayRating = existingReview?.rating || rating;
    return (
      <div className="min-h-screen bg-[#0A0A0A] pt-16 pb-32">
        <div className="max-w-lg mx-auto px-4">
          <div className="py-24 text-center space-y-6">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">리뷰 완료</h2>
              <p className="text-neutral-500 font-medium">
                소중한 리뷰 감사합니다!
              </p>
            </div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-8 h-8 ${s <= displayRating ? "text-yellow-400 fill-yellow-400" : "text-neutral-700"}`}
                />
              ))}
            </div>
            {(existingReview?.comment || comment) && (
              <p className="text-neutral-400 text-sm italic">
                &ldquo;{existingReview?.comment || comment}&rdquo;
              </p>
            )}
            <Button
              onClick={() => router.push("/my-wins")}
              className="bg-white text-black font-black rounded-xl px-8 h-12"
            >
              돌아가기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // confirmed가 아닌 경우
  if (auction.status !== "confirmed") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pt-16 pb-32">
        <div className="max-w-lg mx-auto px-4 py-24 text-center space-y-4">
          <p className="text-neutral-500 font-medium">방문 확인된 경매만 리뷰를 작성할 수 있습니다.</p>
          <Button onClick={() => router.back()} variant="link" className="text-neutral-400">
            돌아가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-16 pb-32">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <header className="py-6">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-neutral-500 mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-bold">뒤로</span>
          </button>
          <h1 className="text-2xl font-black text-white tracking-tight">경험은 어떠셨나요?</h1>
          <p className="text-neutral-500 font-medium mt-1">
            {auction.club?.name} 방문 리뷰
          </p>
        </header>

        <Card className="bg-[#1C1C1E] border-neutral-800 p-6 space-y-8">
          {/* Star Rating */}
          <div className="text-center space-y-4">
            <p className="text-neutral-400 text-sm font-bold">MD 서비스를 평가해주세요</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      s <= (hoverRating || rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-neutral-700"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-yellow-400 font-black text-lg">
                {rating === 5 ? "최고예요!" : rating === 4 ? "좋았어요" : rating === 3 ? "보통이에요" : rating === 2 ? "아쉬웠어요" : "별로였어요"}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-neutral-400 text-sm font-bold">
              한줄 코멘트 <span className="text-neutral-600">(선택)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="자리 좋았어요, MD 친절했어요..."
              maxLength={200}
              rows={3}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-white text-sm placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
            />
            <p className="text-right text-neutral-600 text-xs">{comment.length}/200</p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full h-14 bg-white text-black font-black text-base rounded-xl disabled:opacity-30"
          >
            {submitting ? "제출 중..." : "리뷰 남기기"}
          </Button>
          {error && (
            <p className="text-red-400 text-sm text-center font-medium">{error}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
