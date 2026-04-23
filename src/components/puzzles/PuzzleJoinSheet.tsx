"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Puzzle } from "@/types/database";

interface PuzzleJoinSheetProps {
  puzzle: Puzzle;
  open: boolean;
  onClose: () => void;
}

export function PuzzleJoinSheet({ puzzle, open, onClose }: PuzzleJoinSheetProps) {
  const router = useRouter();
  const supabase = createClient();

  const [hasGuest, setHasGuest] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // 인원 확정 깃발은 참여 불가 — 상위에서 버튼 숨기지만 방어적 가드
  if (!puzzle.is_recruiting_party) return null;

  const remaining = puzzle.target_count - puzzle.current_count;
  const maxGuest = Math.max(0, remaining - 1);
  const totalJoining = 1 + (hasGuest ? guestCount : 0);
  const perPerson = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const totalBudget = totalJoining * perPerson;

  const handleJoin = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("join_puzzle", {
        p_puzzle_id: puzzle.id,
        p_guest_count: hasGuest ? guestCount : 0,
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error || "뭉치기에 실패했습니다");
        return;
      }

      onClose();
      if (puzzle.kakao_open_chat_url) {
        toast("깃발 아래 뭉쳤어요! 오픈채팅에 입장하세요", {
          duration: 8000,
          action: {
            label: "오픈채팅 열기",
            onClick: () => window.open(puzzle.kakao_open_chat_url!, "_blank"),
          },
          description: "내 활동에서 언제든 다시 확인할 수 있어요",
        });
      } else {
        toast.success("깃발 아래 뭉쳤어요!");
      }
      router.push(`/puzzles/${puzzle.id}`);
    } catch (err: unknown) {
      console.error("join_puzzle error:", JSON.stringify(err));
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(`참여 실패: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day} ${days[d.getDay()]}`;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-t border-neutral-800 rounded-t-3xl px-5 pb-10"
      >
        <SheetHeader className="mb-5">
          <SheetTitle className="text-white text-[17px] font-black text-left">
            파티원 합류하기
          </SheetTitle>
          <p className="text-[13px] text-neutral-400 text-left">
            {formatDate(puzzle.event_date)} {puzzle.area} · {perPerson.toLocaleString()}원/인
          </p>
          <p className="text-[13px] text-neutral-500 text-left">
            파티원 {puzzle.current_count}/{puzzle.target_count}명 · 남은 자리 {remaining}명
          </p>
        </SheetHeader>

        <div className="space-y-4">
          {/* 동행 체크박스 (자리 있을 때만) */}
          {maxGuest === 0 ? (
            <p className="text-[12px] text-neutral-500 bg-neutral-900/50 rounded-xl px-4 py-3">
              남은 자리가 1명이라 동행 없이 본인만 참여 가능합니다
            </p>
          ) : (
          <>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasGuest}
              onChange={(e) => {
                setHasGuest(e.target.checked);
                if (!e.target.checked) setGuestCount(1);
              }}
              className="w-4 h-4 rounded accent-white"
            />
            <span className="text-[14px] font-bold text-white">
              동행이 있으신가요?
            </span>
          </label>

          {/* 동행 스테퍼 */}
          {hasGuest && (
            <div className="flex items-center justify-between bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3">
              <button
                onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
              >
                <Minus className="w-4 h-4 text-white" />
              </button>
              <span className="text-[16px] font-black text-white">동행 {guestCount}명</span>
              <button
                onClick={() => setGuestCount(Math.min(maxGuest, guestCount + 1))}
                className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          </>
          )}

          {/* 예산 미리보기 */}
          <div className="bg-neutral-900/80 border border-neutral-700 rounded-xl p-3">
            <p className="text-[12px] text-neutral-500 mb-0.5">예상 비용</p>
            <p className="text-[17px] font-black text-green-400">
              {totalJoining}명 × {perPerson.toLocaleString()}원 = {totalBudget.toLocaleString()}원
            </p>
          </div>

          <p className="text-[12px] text-neutral-300 text-center">
            뭉치면 파티원들의 오픈채팅에 입장할 수 있어요
          </p>
          <Button
            onClick={handleJoin}
            disabled={submitting}
            className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
          >
            {submitting ? "뭉치는 중..." : "파티원 합류하기"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
