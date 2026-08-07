"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { BadgeCheck } from "lucide-react";
import { isGuideDismissedLocally, isShareGuideSnoozedLocally, markGuideSeen, snoozeShareGuide } from "@/lib/utils/guideFlag";

/**
 * 파트너 조각 가이드 — 첫 로그인 1회.
 *
 * 조각은 "매일 올리는 글"이 아니라 "켜두면 알아서 나가는 설정"이라는 게 핵심인데,
 * 대시보드만 봐서는 그 흐름이 안 보인다(요일 토글이 무슨 의미인지 알 수 없음).
 * 자리 잡기 → 세팅 켜기 → 유저 홈 노출 → 채팅까지 한 화면에 보여준다.
 *
 * 흐름은 2단계다. 큰 가이드를 갑자기 띄우면 읽을 마음이 없는 파트너에겐 방해일 뿐이라,
 * 먼저 한 줄짜리 안내로 물어본다.
 *   나중에         → 이번만 닫음(다음 방문에 다시)
 *   더보기         → 전체 가이드 → 닫으면 share_guide_seen = true (끝)
 *   한 달간 보지 않기 → share_guide_snoozed_until = now + 30일 (Migration 525)
 *
 * onlyWhenSlotOpen: 홈처럼 조각과 직접 상관없는 화면에서는 "지금 잡을 수 있는 자리가
 * 있을 때"만 띄운다. 내 클럽이 전부 남에게 잡혀 있으면 읽어도 할 수 있는 게 없다.
 */
export function ShareOnboardingSheet({
  onlyWhenSlotOpen = false,
  manualOpen = false,
  onManualClose,
}: {
  onlyWhenSlotOpen?: boolean;
  /** "ⓘ 이용방법"처럼 직접 열 때 — 티저를 건너뛰고 전체 가이드를 바로 연다 */
  manualOpen?: boolean;
  onManualClose?: () => void;
} = {}) {
  const { user, isLoading, refetch } = useCurrentUser();
  const [teaserOpen, setTeaserOpen] = useState(false);
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (manualOpen) { setOpen(true); return; }
    // 로컬 확인용: ?shareGuide=1 이면 조건 무시하고 바로 띄운다(프로덕션 제외)
    if (
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("shareGuide") === "1"
    ) {
      setTeaserOpen(true);
      return;
    }
    if (isLoading || !user || !isMd) return;
    if (user.share_guide_seen) return;
    if (user.share_guide_snoozed_until && new Date(user.share_guide_snoozed_until) > new Date()) return;
    // 서버 기록이 실패한 기기에서도 "봤음"·"한 달간 보지 않기"가 유지되게 (guideFlag 참고)
    if (isGuideDismissedLocally("share_guide_seen", user.id)) return;
    if (isShareGuideSnoozedLocally(user.id)) return;
    if (!onlyWhenSlotOpen) {
      setTeaserOpen(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await createClient().rpc("get_my_share_slot_status");
      if (cancelled || !data?.success) return;
      // 비어 있는 자리가 하나라도 있어야 안내가 행동으로 이어진다
      const hasOpenSlot = (data.clubs as { holder_id: string | null }[]).some((c) => !c.holder_id);
      if (hasOpenSlot) setTeaserOpen(true);
    })();
    return () => { cancelled = true; };
  }, [user, isLoading, isMd, onlyWhenSlotOpen, manualOpen]);

  // best-effort: DB 쓰기가 실패해도 사용자를 시트에 가두지 않는다.
  const dismiss = async () => {
    setOpen(false);
    // 직접 열어본 것은 "안내를 봤다"로 기록하지 않는다
    if (manualOpen) { onManualClose?.(); return; }
    if (!user) return;
    const saved = await markGuideSeen("share_guide_seen", user.id);
    if (saved) refetch();
  };

  /** 한 달 뒤에 다시 — 봤다고 표시하지 않는다(아직 안 읽었으므로) */
  const snoozeMonth = async () => {
    setTeaserOpen(false);
    if (!user) return;
    const until = new Date(Date.now() + 30 * 86400000).toISOString();
    const saved = await snoozeShareGuide(user.id, until);
    if (saved) refetch();
  };

  return (
    <>
    {/* 1단계 — 한 줄 안내 */}
    <Sheet open={teaserOpen} onOpenChange={(v) => { if (!v) setTeaserOpen(false); }}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl px-5 pt-6 pb-7"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-5">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            <span className="text-brand-amber text-[23px]">파티</span>이 바뀌었어요! 🎉
          </SheetTitle>
        </SheetHeader>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTeaserOpen(false)}
            className="flex-1 h-12 rounded-xl bg-muted text-muted-foreground font-black text-[14px] active:scale-95 transition-transform"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => { setTeaserOpen(false); setOpen(true); }}
            className="flex-1 h-12 rounded-xl bg-amber-500 text-black font-black text-[14px] active:scale-95 transition-transform"
          >
            더보기
          </button>
        </div>
        <button
          type="button"
          onClick={snoozeMonth}
          className="w-full mt-3 text-center text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
        >
          한 달간 보지 않기
        </button>
      </SheetContent>
    </Sheet>

    {/* 2단계 — 전체 가이드 */}
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[92vh] overflow-y-auto px-5 pt-6 pb-7"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-4">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            <span className="text-brand-amber text-[23px]">파티</span>, 나플에서는 이렇게! 🎉
          </SheetTitle>
        </SheetHeader>

        {/* 1. 자리 잡기 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">1. 이번 주 자리 잡기</p>
        <div className="bg-card border border-border rounded-2xl p-3 shrink-0">
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
        <p className="text-[12.5px] font-black text-foreground mb-1.5">2. 나만의 파티 세팅</p>
        {/* overflow-hidden 금지 — SheetContent가 flex 컨테이너라, overflow가 visible이 아니면
            자동 최소 크기가 0이 되어 내용이 넘칠 때 이 블록만 0높이로 찌그러진다. */}
        <div className="bg-card border border-border rounded-2xl shrink-0">
          <div className="px-3.5 py-3 space-y-2">
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
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="bg-amber-500 text-black text-[12px] font-black rounded-[10px] px-2.5 py-1.5 leading-none shrink-0">
            🎉 파티
          </span>
          <span className="text-[15px] font-black text-foreground">8월 5일 (수)</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/guide-club-sample.jpg"
              alt=""
              className="w-[62px] h-[62px] rounded-xl object-cover shrink-0"
            />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-black text-foreground truncate">클럽 아레나</span>
                <span className="text-[11.5px] text-muted-foreground font-bold shrink-0">홍대</span>
              </div>
              <span className="self-start inline-flex items-center gap-1 text-[10px] font-black bg-blue-500/15 text-blue-400 rounded-md px-1.5 py-[3px] leading-none">
                <BadgeCheck className="w-3 h-3" />클럽 다이렉트
              </span>
              <span className="text-[12px] text-muted-foreground font-bold">4~6인</span>
              <span className="text-[14px] font-black">
                <span className="text-[11px] text-muted-foreground font-bold">인당 </span>
                <span className="text-money">150,000원</span>
                <span className="text-[11px] text-muted-foreground font-bold">부터</span>
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/60">
            {[
              { name: "가성비", seats: "6인", price: "15만" },
              { name: "초메인", seats: "5인", price: "20만" },
            ].map((x) => (
              <div key={x.name} className="flex items-center gap-2 py-1.5 text-[12px] font-bold">
                <span className="text-foreground">
                  {x.name} <span className="text-muted-foreground">{x.seats}</span>
                </span>
                <span className="ml-auto text-money font-black tabular-nums">{x.price}</span>
              </div>
            ))}
            <p className="text-[11.5px] text-muted-foreground font-bold pt-1.5">＋ 2개 더</p>
          </div>
          <div className="mt-2 flex justify-end">
            <span className="h-8 px-3.5 rounded-full bg-green-500 text-black font-black text-[12px] flex items-center">
              더보기
            </span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground font-semibold mt-1.5">
          같은 클럽 파티는 한 장으로 묶여서 노출돼요
        </p>

        <p className="text-center text-brand-amber text-[13px] my-1.5">↓</p>

        {/* 4. 채팅 */}
        <p className="text-[12.5px] font-black text-foreground mb-1.5">4. 유저가 채팅으로 참가해요</p>
        <div className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2 shrink-0">
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
          {manualOpen ? "확인" : "좋아요! 시작할게요"}
        </button>
      </SheetContent>
    </Sheet>
    </>
  );
}
