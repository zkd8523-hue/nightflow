"use client";

import { useEffect, useState } from "react";
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
  // Migration 184: 본인 성별 로드 + 미입력 시 입력 받기
  const [myGender, setMyGender] = useState<"male" | "female" | null>(null);
  const [genderLoaded, setGenderLoaded] = useState(false);

  const isDirty = hasGuest || guestCount > 1;

  // 본인 성별 로드 (시트 열릴 때 1회)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("users")
        .select("gender")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      setMyGender((data?.gender as "male" | "female" | null) ?? null);
      setGenderLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, supabase]);

  const handleSaveMyGender = async (g: "male" | "female") => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("users")
      .update({ gender: g })
      .eq("id", auth.user.id);
    if (error) {
      toast.error("성별 저장에 실패했어요. 다시 시도해주세요");
      return;
    }
    setMyGender(g);
  };

  // 탭 닫기/새로고침 시 네이티브 경고
  useEffect(() => {
    if (!open || !isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, isDirty]);

  // 시트 닫기 시도 시 작성 중이면 confirm
  const handleCloseAttempt = () => {
    if (isDirty && !window.confirm("작성 중인 내용이 사라집니다. 닫으시겠습니까?")) return;
    onClose();
  };

  // 인원 확정 깃발은 참여 불가 — 상위에서 버튼 숨기지만 방어적 가드
  if (!puzzle.is_recruiting_party) return null;

  // Migration 184: 본인 성별 슬롯 잔여 자리 계산
  const remainingMale   = Math.max(0, (puzzle.target_male   ?? 0) - (puzzle.current_male   ?? 0));
  const remainingFemale = Math.max(0, (puzzle.target_female ?? 0) - (puzzle.current_female ?? 0));
  const remainingTotal  = puzzle.target_count - puzzle.current_count;
  const remainingMySlot = myGender === "female" ? remainingFemale : myGender === "male" ? remainingMale : remainingTotal;

  // 본인 성별 슬롯 기준 최대 동행 수
  const maxGuest = Math.max(0, remainingMySlot - 1);
  const totalJoining = 1 + (hasGuest ? guestCount : 0);
  const perPerson = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const totalBudget = totalJoining * perPerson;
  const slotFull = genderLoaded && myGender !== null && remainingMySlot <= 0;

  const handleJoin = async () => {
    if (!myGender) {
      toast.error("성별을 먼저 선택해주세요");
      return;
    }
    if (slotFull) {
      toast.error(myGender === "female" ? "여자 자리가 마감됐어요" : "남자 자리가 마감됐어요");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("join_puzzle", {
        p_puzzle_id: puzzle.id,
        p_guest_count: hasGuest ? guestCount : 0,
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error || "합류에 실패했습니다");
        return;
      }

      onClose();
      if (puzzle.kakao_open_chat_url) {
        toast("퍼즐이 완성되고 있어요! 얼른 오픈채팅에 입장해보세요!", {
          duration: 8000,
          action: {
            label: "오픈채팅 열기",
            onClick: () => window.open(puzzle.kakao_open_chat_url!, "_blank"),
          },
          description: "내 활동에서 언제든 다시 확인할 수 있어요",
        });
      } else {
        toast.success("퍼즐이 완성되고 있어요!");
      }
      router.push(`/flags/${puzzle.id}`);
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
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleCloseAttempt(); }}>
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
            🧑 남 {puzzle.current_male ?? 0}/{puzzle.target_male ?? 0} · 👩 여 {puzzle.current_female ?? 0}/{puzzle.target_female ?? 0}
          </p>
        </SheetHeader>

        {/* Migration 184: 성별 미입력 시 강제 입력 */}
        {genderLoaded && !myGender && (
          <div className="space-y-3 mb-5">
            <p className="text-[14px] font-bold text-white">
              퍼즐 매칭을 위해 성별을 알려주세요
            </p>
            <p className="text-[11px] text-neutral-500">한 번 설정하면 변경할 수 없어요</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "male", label: "남자", emoji: "🧑" },
                { value: "female", label: "여자", emoji: "👩" },
              ] as const).map(({ value, label, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleSaveMyGender(value)}
                  className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all bg-neutral-800 border-neutral-700 ${
                    value === "female" ? "hover:border-pink-500 hover:bg-pink-500/10" : "hover:border-green-500 hover:bg-green-500/10"
                  }`}
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="text-[13px] font-bold text-white">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* gender 입력 후에만 합류 UI 표시 */}
        {myGender && (
          <div className="space-y-4">
            {slotFull ? (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {myGender === "female" ? "여자 자리가 모두 마감됐어요" : "남자 자리가 모두 마감됐어요"}
              </p>
            ) : maxGuest === 0 ? (
              <p className="text-[12px] text-neutral-500 bg-neutral-900/50 rounded-xl px-4 py-3">
                {myGender === "female" ? "여자" : "남자"} 자리가 1명 남아 동행 없이 본인만 참여 가능합니다
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

                {hasGuest && (
                  <>
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
                    <p className="text-[11px] text-neutral-500">
                      동행은 본인과 같은 {myGender === "female" ? "여자" : "남자"} 슬롯으로 카운트돼요
                    </p>
                  </>
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
              disabled={submitting || slotFull}
              className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98] disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              {submitting ? "뭉치는 중..." : "파티원 합류하기"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
