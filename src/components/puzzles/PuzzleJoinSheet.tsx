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

  // 조각(성별 슬롯 미사용): target_male/female이 둘 다 0이면 성별 무관 → 총원 기준으로만 매칭.
  const genderNeutral = (puzzle.target_male ?? 0) === 0 && (puzzle.target_female ?? 0) === 0;
  // Migration 184: 본인 성별 슬롯 잔여 자리 계산
  const remainingMale   = Math.max(0, (puzzle.target_male   ?? 0) - (puzzle.current_male   ?? 0));
  const remainingFemale = Math.max(0, (puzzle.target_female ?? 0) - (puzzle.current_female ?? 0));
  const remainingTotal  = puzzle.target_count - puzzle.current_count;
  const remainingMySlot = genderNeutral
    ? remainingTotal
    : (myGender === "female" ? remainingFemale : myGender === "male" ? remainingMale : remainingTotal);

  // 잔여 자리 기준 최대 동행 수
  const maxGuest = Math.max(0, remainingMySlot - 1);
  const totalJoining = 1 + (hasGuest ? guestCount : 0);
  const perPerson = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const totalBudget = totalJoining * perPerson;
  const slotFull = genderNeutral
    ? remainingTotal <= 0
    : (genderLoaded && myGender !== null && remainingMySlot <= 0);

  const handleJoin = async () => {
    if (!genderNeutral && !myGender) {
      toast.error("성별을 먼저 선택해주세요");
      return;
    }
    if (slotFull) {
      toast.error(genderNeutral ? "남은 자리가 없어요" : (myGender === "female" ? "여자 자리가 마감됐어요" : "남자 자리가 마감됐어요"));
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
      // 합류 즉시 인앱 단체채팅 입장 (오픈채팅 대체, Migration 349)
      toast.success("합류 완료! 단체채팅에서 인사를 나눠보세요 👋");
      router.push(`/party/${puzzle.id}`);
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
    return `${m}/${day}(${days[d.getDay()]})`;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleCloseAttempt(); }}>
      <SheetContent
        side="bottom"
        className="bg-card border-t border-border rounded-t-3xl px-5 pb-10"
      >
        <SheetHeader className="mb-3">
          <SheetTitle className="text-foreground text-[17px] font-black text-left">
            파티원 합류하기
          </SheetTitle>
          <p className="text-[13px] text-muted-foreground text-left">
            {formatDate(puzzle.event_date)} · {puzzle.area} · {perPerson.toLocaleString()}원/인
          </p>
          <p className="text-[13px] text-muted-foreground text-left">
            {genderNeutral
              ? `👥 ${puzzle.current_count}/${puzzle.target_count}명`
              : `🧑 남 ${puzzle.current_male ?? 0}/${puzzle.target_male ?? 0} · 👩 여 ${puzzle.current_female ?? 0}/${puzzle.target_female ?? 0}`}
          </p>
        </SheetHeader>

        {/* 성별 미입력 시: 조각으로 안내 (성별 무관 조각에선 불필요) */}
        {genderLoaded && !myGender && !genderNeutral && (
          <div className="space-y-2 mb-5 bg-muted/50 border border-border rounded-2xl p-4">
            <p className="text-[13px] font-bold text-foreground">성별 정보가 필요해요</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              깃발은 성별 슬롯 기반으로 매칭돼요. 조각 매물에 먼저 참여하면서 성별을 설정하면 깃발도 합류할 수 있어요.
            </p>
          </div>
        )}

        {/* gender 입력 후 표시. 단, 성별 무관 조각은 성별 없이도 합류 UI 노출 */}
        {(myGender || genderNeutral) && (
          <div className="space-y-4">
            {slotFull ? (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {genderNeutral ? "자리가 모두 마감됐어요" : (myGender === "female" ? "여자 자리가 모두 마감됐어요" : "남자 자리가 모두 마감됐어요")}
              </p>
            ) : maxGuest === 0 ? (
              <p className="text-[12px] text-muted-foreground bg-card/50 rounded-xl px-4 py-3">
                {genderNeutral ? "마지막 1자리 입니다" : `${myGender === "female" ? "여자" : "남자"} 마지막 1자리 입니다`}
              </p>
            ) : (
              <>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="text-[14px] font-bold text-foreground">
                    동행이 있으신가요?
                  </span>
                  <input
                    type="checkbox"
                    checked={hasGuest}
                    onChange={(e) => {
                      setHasGuest(e.target.checked);
                      if (!e.target.checked) setGuestCount(1);
                    }}
                    className="w-4 h-4 rounded accent-white"
                  />
                </label>

                {hasGuest && (
                  <>
                    <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                      <button
                        onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="w-4 h-4 text-foreground" />
                      </button>
                      <span className="text-[16px] font-black text-foreground">동행 {guestCount}명</span>
                      <button
                        onClick={() => setGuestCount(Math.min(maxGuest, guestCount + 1))}
                        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Plus className="w-4 h-4 text-foreground" />
                      </button>
                    </div>
                    {!genderNeutral && (
                      <p className="text-[11px] text-muted-foreground">
                        동행은 본인과 같은 {myGender === "female" ? "여자" : "남자"} 슬롯으로 카운트돼요
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {/* 예산 미리보기 — 동행 있을 때만(1명이면 헤더의 인당가와 중복) */}
            {totalJoining > 1 && (
              <div className="bg-card/80 border border-border rounded-xl p-3">
                <p className="text-[12px] text-muted-foreground mb-0.5">예상 비용</p>
                <p className="text-[17px] font-black text-money">
                  {totalJoining}명 × {perPerson.toLocaleString()}원 = {totalBudget.toLocaleString()}원
                </p>
              </div>
            )}

            <Button
              onClick={handleJoin}
              disabled={submitting || slotFull}
              className="w-full h-13 bg-inverse hover:opacity-90 text-inverse-foreground font-black text-[15px] rounded-2xl transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground"
            >
              {submitting ? "뭉치는 중..." : "계속하기"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
