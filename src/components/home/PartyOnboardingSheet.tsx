"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown, BadgeCheck } from "lucide-react";

/**
 * 파티 이용방법 — 깃발용 FlagOnboardingSheet와 같은 양식(번호 단계 → 화살표 → 실제 카드).
 *
 * 깃발은 "내 조건을 올리고 오퍼를 받는" 흐름이고, 파티는 "이미 열린 자리에 합류하는" 흐름이라
 * 같은 모달을 돌려쓰면 유저가 자기가 뭘 하는 건지 헷갈린다.
 *
 * 첫 방문 자동 노출은 하지 않는다 — "이용방법"을 눌렀을 때만 연다.
 */
export function PartyOnboardingSheet({
  manualOpen = false,
  onManualClose,
}: {
  manualOpen?: boolean;
  onManualClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (manualOpen) setOpen(true);
  }, [manualOpen]);

  const close = () => {
    setOpen(false);
    onManualClose?.();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[92vh] overflow-y-auto bg-background border-border rounded-t-3xl px-5 pt-5 pb-5 gap-0"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-2.5">
          <SheetTitle className="text-foreground text-[21px] font-black tracking-tight leading-tight">
            혼자 와도 <span className="text-brand-amber text-[26px]">크게 놀 수 있어요</span> 🎉
          </SheetTitle>
        </SheetHeader>

        {/* ① 파티 고르기 — 실제 ClubDirectCard 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">1. 오늘의 파티 고르기</span>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/guide-club-sample.jpg" alt="" className="w-[62px] h-[62px] rounded-xl object-cover shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-black text-foreground truncate">클럽 아레나</span>
                <span className="text-[11.5px] text-muted-foreground font-bold shrink-0">홍대</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-bold">by 한국밤뜨숩다</span>
              <span className="self-start inline-flex items-center gap-1 text-[10px] font-black bg-blue-500/15 text-blue-400 rounded-md px-1.5 py-[3px] leading-none">
                <BadgeCheck className="w-3 h-3" />클럽 다이렉트
              </span>
              <span className="text-[14px] font-black">
                <span className="text-[11px] text-muted-foreground font-bold">인당 </span>
                <span className="text-money">150,000원</span>
                <span className="text-[11px] text-muted-foreground font-bold">부터</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-center py-0.5">
          <ArrowDown className="w-5 h-5 text-brand-amber" />
        </div>

        {/* ② 자리 고르기 — 실제 ClubSharePuzzles 행 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">2. 마음에 드는 자리 합류</span>
        </p>
        <div className="rounded-2xl border border-border overflow-hidden">
          {[
            { name: "가성비", meta: "6인 · 퍼레이드 · 인당 150,000원" },
            { name: "초메인", meta: "5인 · 전광판 · 인당 200,000원" },
          ].map((x, i) => (
            <div key={x.name} className={`bg-card px-4 py-3 flex items-center gap-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-black text-foreground truncate">{x.name}</p>
                <p className="text-[11px] text-muted-foreground font-semibold truncate">{x.meta}</p>
              </div>
              <span className="shrink-0 h-8 px-3.5 rounded-full bg-green-500 text-black font-black text-[12px] flex items-center">
                합류하기
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center py-0.5">
          <ArrowDown className="w-5 h-5 text-brand-amber" />
        </div>

        {/* ③ 파티원과 채팅 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">3. 파티원들과 채팅</span>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 space-y-1.5">
          <div className="flex justify-start">
            <span className="bg-neutral-300 text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tl-sm px-3 py-1.5 max-w-[82%]">
              몇 시에 만날까요?
            </span>
          </div>
          <div className="flex justify-end">
            <span className="bg-neutral-300 text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tr-sm px-3 py-1.5 max-w-[82%]">
              11시 어때요? 😊
            </span>
          </div>
        </div>

        <div className="flex justify-center py-0.5">
          <ArrowDown className="w-5 h-5 text-brand-amber" />
        </div>

        {/* ④ 시크릿오퍼 → 파티장 선택 → 파트너 합류 (유저가 연 파티에만 해당) */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">4. 파트너가 채팅방에 합류</span>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 space-y-1.5">
          <p className="text-[12.5px] text-muted-foreground font-semibold leading-relaxed break-keep">
            유저가 연 파티에는 파트너들이 <span className="text-brand-amber font-black">시크릿오퍼</span>를 보내요.
            채팅방에서 파티원끼리 보고 투표한 뒤, 파티장이 고른 파트너가 채팅방에 들어와요.
          </p>
          <p className="text-[11.5px] text-muted-foreground font-semibold">
            오퍼는 이 파티 사람들만 봐요
          </p>
        </div>

        <p className="text-[12.5px] font-black text-brand-amber text-center mt-2.5">
          결제는 현장에서 · 언제든 나갈 수 있어요
        </p>

        <button
          type="button"
          onClick={close}
          className="flex items-center justify-center w-full h-14 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black rounded-2xl shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all mt-2.5"
        >
          <span className="font-black text-[15px]">좋아요! 둘러볼게요</span>
        </button>
      </SheetContent>
    </Sheet>
  );
}
