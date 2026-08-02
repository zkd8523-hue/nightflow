"use client";

// 로컬 프리뷰 전용 — 조각(파티) 참가자 상호리뷰 시트 UI 확인용. /preview-party
// 실제 DB 연동 없음 (목업). 실제 트리거는 PartyReviewTrigger가 layout에서 처리.

import { useState } from "react";
import { PartyReviewSheet, type PartyParticipant } from "@/components/puzzles/PartyReviewSheet";
import { toast } from "sonner";

const MOCK_PARTICIPANTS: PartyParticipant[] = [
  {
    user_id: "1",
    display_name: "달빛늑대",
    profile_image: null,
  },
  {
    user_id: "2",
    display_name: "123123",
    profile_image:
      "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/avatars/11f8d12a-eff7-46c5-a2df-6f69bc685ff0/avatar.png?t=1784906360119",
  },
  {
    user_id: "3",
    display_name: "홍대불주먹",
    profile_image: null,
  },
];

export default function PreviewPartyPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-[18px] font-black">파티 리뷰 시트 프리뷰</h1>
      <p className="text-[13px] text-muted-foreground text-center max-w-[300px]">
        조각 만료 후 참여자에게 뜨는 &ldquo;다녀오셨어요? → 같이 간 사람 평가&rdquo; UI (목업)
      </p>
      <button
        onClick={() => setOpen(true)}
        className="h-12 px-6 rounded-2xl bg-amber-500 text-black font-black text-[15px] active:scale-[0.98] transition"
      >
        파티 리뷰 시트 열기
      </button>

      <PartyReviewSheet
        open={open}
        onOpenChange={setOpen}
        puzzleLabel="8/2(토) · 홍대"
        participants={MOCK_PARTICIPANTS}
        onSubmit={(r) => {
          console.log("[preview-party] submit:", r);
          toast.success(
            r.visited
              ? `방문함 · 평가 ${r.reviews.length}명 (👍 ${r.reviews.filter((x) => x.liked).length})`
              : `안 감 · 사유="${r.notVisitedReason || "(넘어감)"}"`
          );
        }}
      />
    </div>
  );
}
