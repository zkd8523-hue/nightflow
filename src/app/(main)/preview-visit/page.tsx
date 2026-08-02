"use client";

// 로컬 프리뷰 전용 — 깃발 만료 후 "다녀오셨어요?" 설문 시트 UI 확인용.
// 실제 DB 연동 없음. /preview-visit 로 접속.

import { useState } from "react";
import { VisitConfirmSheet, type VisitPartnerOption } from "@/components/puzzles/VisitConfirmSheet";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// 실제 admin 승인 테스트용 — 123123 파트너가 오퍼한 진짜 expired 깃발.
// 이 값으로 submit_visit_review 를 호출하면 진짜 pending 리뷰가 생성됨.
const TEST_PUZZLE_ID = "24f90049-22b9-48a3-8560-9f7ae4e807d4"; // 홍대, expired
const TEST_MD_ID = "11f8d12a-eff7-46c5-a2df-6f69bc685ff0"; // 123123
// ⚠️ 이 깃발의 방장(leader)로 로그인해야 제출 성공: 32a3a8a2-f08a-477c-91f1-7b3ae6bb3ba6

const MOCK_PARTNERS: VisitPartnerOption[] = [
  {
    md_id: "11f8d12a-eff7-46c5-a2df-6f69bc685ff0",
    display_name: "123123",
    profile_image:
      "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/avatars/11f8d12a-eff7-46c5-a2df-6f69bc685ff0/avatar.png?t=1784906360119",
    instagram: "dasdasdasd",
    club_name: "운영자 테스트 클럽",
  },
  {
    md_id: "1",
    display_name: "제식",
    profile_image: null,
    instagram: "zerosixx__official",
    club_name: "도깨비",
  },
  {
    md_id: "2",
    display_name: "윤세아",
    profile_image: null,
    instagram: "ocean._.yoonsha",
    club_name: "OCEAN",
  },
  {
    md_id: "3",
    display_name: "선우",
    profile_image: null,
    instagram: null,
    club_name: "CLUB BERMUDA",
  },
];

export default function PreviewVisitPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-[18px] font-black">방문 확인 시트 프리뷰</h1>
      <p className="text-[13px] text-muted-foreground text-center max-w-[300px]">
        깃발 만료 후 유저에게 뜨는 &ldquo;다녀오셨어요?&rdquo; 설문 UI입니다. (목업 데이터)
      </p>
      <button
        onClick={() => setOpen(true)}
        className="h-12 px-6 rounded-2xl bg-amber-500 text-black font-black text-[15px] active:scale-[0.98] transition"
      >
        설문 시트 열기
      </button>

      <VisitConfirmSheet
        open={open}
        onOpenChange={setOpen}
        puzzleLabel="8/1(토) 홍대 · 예산 50만원"
        partners={MOCK_PARTNERS}
        onSubmit={async (r) => {
          console.log("[preview] submit:", r);
          if (!r.didVisit || r.rating === 0) {
            toast.message(r.didVisit ? "방문함 (리뷰 없음)" : "안 감(did_visit=false)");
            return;
          }
          // 실제 pending 리뷰 생성 (admin 승인 테스트용). 방장 계정으로 로그인돼 있어야 성공.
          const { data, error } = await createClient().rpc("submit_visit_review", {
            p_puzzle_id: TEST_PUZZLE_ID,
            p_md_id: TEST_MD_ID,
            p_rating: r.rating,
            p_comment: r.comment || null,
            p_tags: r.tags,
          });
          if (error || !(data as { success?: boolean })?.success) {
            toast.error(error?.message || (data as { error?: string })?.error || "제출 실패");
            return;
          }
          toast.success("pending 리뷰 생성됨! /admin/visit-reviews 에서 승인하세요");
        }}
      />
    </div>
  );
}
