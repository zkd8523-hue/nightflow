"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * 파트너 크레딧 가이드 — 깃발 상세 첫 진입 1회.
 *
 * 오퍼 시트를 연 뒤에 띄우면 이미 "눌러도 되나" 하고 한 번 멈춘 뒤다.
 * 비용 구조는 버튼을 누르기 전에 알려줘야 한다.
 *
 * 금액 근거: OfferSheet.tsx(Migration 358) — 깃발 15, 조각 10 크레딧.
 * 노출 여부는 계정 단위(users.offer_credit_guide_seen, Migration 523)로 저장한다.
 */
export function OfferCreditGuideSheet() {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (isLoading || !user || !isMd) return;
    if (user.offer_credit_guide_seen) return;
    setOpen(true);
  }, [user, isLoading, isMd]);

  const dismiss = async () => {
    setOpen(false);
    if (!user) return;
    const supabase = createClient();
    await supabase.from("users").update({ offer_credit_guide_seen: true }).eq("id", user.id);
    refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pt-6 pb-7"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-1">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            오퍼는 <span className="text-brand-amber text-[23px]">무료</span>입니다 💬
          </SheetTitle>
        </SheetHeader>
        <p className="text-[11.5px] text-muted-foreground font-semibold mb-4">
          크레딧은 매칭됐을 때만 빠져요
        </p>

        {[
          { cost: "15 크레딧", title: "깃발 매칭됐을 때", desc: "대화 첫 답장 또는 수락 시 1회" },
          { cost: "10 크레딧", title: "파티 매칭됐을 때", desc: "상담 시작 또는 수락 시 1회" },
        ].map((x) => (
          <div key={x.title} className="bg-card border border-border rounded-2xl p-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-amber-500/15 text-brand-amber">
                {x.cost}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-black text-foreground">{x.title}</p>
                <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{x.desc}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-3 text-center text-[12.5px] font-black text-foreground">
          유저가 혹할만한 <span className="text-brand-amber">테이블 구성</span>을 제안해보세요!
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-4 rounded-xl bg-amber-500 text-black font-black text-[14px] active:scale-95 transition-transform"
        >
          확인, 계속할게요
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
