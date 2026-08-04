"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { BadgeCheck } from "lucide-react";

/**
 * 파트너 조각 가이드 — 첫 로그인 1회.
 *
 * 조각은 "매일 올리는 글"이 아니라 "켜두면 알아서 나가는 설정"이라는 게 핵심인데,
 * 대시보드만 봐서는 그 흐름이 안 보인다(요일 토글이 무슨 의미인지 알 수 없음).
 * 자리 잡기 → 세팅 켜기 → 유저 홈 노출 → 채팅까지 한 화면에 보여준다.
 *
 * 노출 여부는 계정 단위(users.share_guide_seen, Migration 523)로 저장한다.
 */
export function ShareOnboardingSheet() {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (isLoading || !user || !isMd) return;
    if (user.share_guide_seen) return;
    setOpen(true);
  }, [user, isLoading, isMd]);

  // best-effort: DB 쓰기가 실패해도 사용자를 시트에 가두지 않는다.
  const dismiss = async () => {
    setOpen(false);
    if (!user) return;
    const supabase = createClient();
    await supabase.from("users").update({ share_guide_seen: true }).eq("id", user.id);
    refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[92vh] overflow-y-auto px-5 pt-6 pb-7"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-4">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            <span className="text-brand-amber text-[23px]">조각</span>, 나플에서는 이렇게! 🧩
          </SheetTitle>
        </SheetHeader>

        {/* 1. 자리 잡기 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">1. 이번 주 자리 잡기</p>
        <div className="bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-foreground">클럽 아레나</p>
              <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                클럽당 파트너 1명 · 매주 월 18시 오픈
              </p>
            </div>
            <span className="shrink-0 h-7 px-3 rounded-full bg-amber-500 text-black text-[11.5px] font-black flex items-center">
              자리 잡기
            </span>
          </div>
        </div>

        <p className="text-center text-brand-amber text-[13px] my-1.5">↓</p>

        {/* 2. 세팅 — 실제 ShareLiveToggleList 행과 같은 형태 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">2. 나만의 조각 세팅</p>
        <div className="border border-border rounded-2xl overflow-hidden">
          <div className="bg-card px-3.5 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-black text-foreground">가성비</p>
                  <span className="text-[9.5px] font-black text-muted-foreground bg-muted rounded px-1.5 py-[2px] leading-none">
                    주말
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                  6명 · 인당 <span className="text-brand-amber font-bold">15만원</span>
                </p>
              </div>
              <span className="text-muted-foreground text-[15px]">⋯</span>
              <span className="w-10 h-[23px] rounded-full bg-amber-500 relative shrink-0">
                <span className="absolute top-[3px] left-[20px] w-[17px] h-[17px] rounded-full bg-white" />
              </span>
            </div>
            <div className="flex gap-1">
              {[
                { d: "월", on: false }, { d: "화", on: false }, { d: "수", on: false },
                { d: "목", on: false }, { d: "금", on: true }, { d: "토", on: true }, { d: "일", on: true },
              ].map((x) => (
                <span
                  key={x.d}
                  className={`flex-1 h-8 rounded-lg text-[12px] font-black flex items-center justify-center ${
                    x.on ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {x.d}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-brand-amber text-[13px] my-1.5">↓</p>

        {/* 3. 유저 홈 노출 — 실제 ClubDirectCard 형태 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">3. 이렇게 홈에서 노출돼요</p>
        <div className="bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-3">
            <div className="w-[62px] h-[62px] rounded-xl bg-muted shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-black text-foreground truncate">클럽 아레나</span>
                <span className="text-[11.5px] text-muted-foreground font-bold shrink-0">홍대</span>
              </div>
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
          <div className="mt-2.5 pt-2 border-t border-border/60">
            <div className="flex items-center gap-2 py-1 text-[12px] font-bold">
              <span className="text-foreground">가성비</span>
              <span className="ml-auto text-money font-black tabular-nums">15만</span>
              <span className="w-[42px] text-right text-muted-foreground tabular-nums">6인</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground font-bold pt-1">＋ 2개 더</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground font-semibold mt-1.5">
          같은 클럽 조각은 한 장으로 묶여서 노출돼요
        </p>

        <p className="text-center text-brand-amber text-[13px] my-1.5">↓</p>

        {/* 4. 채팅 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">4. 유저가 채팅으로 참가해요</p>
        <div className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2">
          <span className="self-start bg-muted text-foreground text-[11.5px] font-bold px-3 py-1.5 rounded-xl">
            4명인데 자리 되나요?
          </span>
          <span className="self-end bg-amber-500 text-black text-[11.5px] font-bold px-3 py-1.5 rounded-xl">
            네! 바로 잡아드릴게요 😊
          </span>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-4 rounded-xl bg-amber-500 text-black font-black text-[14px] active:scale-95 transition-transform"
        >
          좋아요! 시작할게요
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-full mt-2.5 text-center text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
        >
          다시 보지 않기
        </button>
      </SheetContent>
    </Sheet>
  );
}
