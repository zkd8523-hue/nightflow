"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { requestClub } from "@/app/actions/club-requests";

interface ClubRequestCTAProps {
  variant?: "list-end" | "empty";
  defaultArea?: string | null;
}

export function ClubRequestCTA({ variant = "list-end", defaultArea }: ClubRequestCTAProps) {
  const [open, setOpen] = useState(false);
  const [clubName, setClubName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await requestClub({ clubName, area: defaultArea ?? null, note });
      if (res.ok === false) {
        setError(res.error);
        return;
      }
      setDone(true);
      setClubName("");
      setNote("");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1600);
    });
  };

  const triggerNode =
    variant === "empty" ? (
      <button className="inline-flex items-center gap-1.5 h-11 px-5 bg-amber-500 text-black font-black text-[13px] rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98]">
        <Sparkles className="w-4 h-4" />
        원하는 클럽 요청하기
      </button>
    ) : (
      <button className="w-full bg-[#1C1C1E] hover:bg-neutral-900 border border-dashed border-neutral-700 rounded-2xl p-5 text-left transition-colors active:scale-[0.99]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[14px] font-black leading-tight">
              원하는 클럽이 없나요?
            </p>
            <p className="text-neutral-400 text-[12px] font-medium mt-0.5">
              지금 바로 요청해보세요 — 빠르게 입점 협의해드려요
            </p>
          </div>
        </div>
      </button>
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{triggerNode}</SheetTrigger>
      <SheetContent side="bottom" className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl max-w-lg mx-auto p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-white text-[18px] font-black">어떤 클럽이 보고 싶으세요?</h3>
          <p className="text-neutral-400 text-[12px] font-medium leading-relaxed">
            클럽명을 알려주시면 입점 협의 우선순위에 반영할게요.
          </p>
        </div>

        {done ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-3xl">🙌</p>
            <p className="text-white text-[14px] font-black">요청 접수됐어요!</p>
            <p className="text-neutral-400 text-[12px]">빠르게 입점 협의해볼게요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-neutral-300">클럽명 *</label>
              <Input
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="예: OCTAGON, ARENA"
                className="h-11 bg-neutral-900 border-neutral-800 text-white"
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-neutral-300">
                요청 사유 <span className="text-neutral-500 font-medium">(선택)</span>
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="원하는 날짜, 인원, 예산 등 자유롭게"
                className="bg-neutral-900 border-neutral-800 text-white min-h-[80px]"
                maxLength={200}
              />
            </div>
            {error && <p className="text-red-400 text-[12px] font-medium">{error}</p>}
            <Button
              disabled={pending || !clubName.trim()}
              onClick={submit}
              className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] rounded-xl disabled:opacity-50"
            >
              {pending ? "보내는 중..." : "요청 보내기"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
