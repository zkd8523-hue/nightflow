"use client";

import { useEffect, useRef, useState } from "react";
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
export function OfferCreditGuideSheet({
  isParty = false,
  manualOpen = false,
  onManualClose,
}: {
  isParty?: boolean;
  /** 프리뷰·직접 열기 — 계정 플래그를 소모하지 않는다 */
  manualOpen?: boolean;
  onManualClose?: () => void;
} = {}) {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);
  // 한 번 닫으면 이 세션에서는 끝 (ShareJoinGuideSheet 와 같은 이유)
  const dismissedRef = useRef(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (manualOpen) { setOpen(true); return; }
    if (dismissedRef.current) return;
    if (isLoading || !user || !isMd) return;
    if (user.offer_credit_guide_seen) return;
    setOpen(true);
  }, [user, isLoading, isMd, manualOpen]);

  const dismiss = async () => {
    setOpen(false);
    // 직접 열어본 것은 "안내를 봤다"로 기록하지 않는다
    if (manualOpen) { onManualClose?.(); return; }
    dismissedRef.current = true;
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ offer_credit_guide_seen: true })
      .eq("id", user.id);
    if (error) {
      console.error("[OfferCreditGuideSheet] 안내 확인 기록 실패:", error.message);
      return;
    }
    refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pt-5 pb-5"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-0.5">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            오퍼는 <span className="text-brand-amber text-[23px]">무료</span>입니다 💬
          </SheetTitle>
        </SheetHeader>
        {/* 요금은 한 줄이면 충분하다 — 카드로 키우면 "무료"라는 머리말과 싸운다 */}
        <p className="text-[12px] text-muted-foreground font-semibold mb-2.5">
          오직 매칭됐을 때만 <span className="text-brand-amber font-black">{isParty ? 10 : 15} 크레딧</span>이 소모돼요.
        </p>

        {/* 파티는 깃발과 상담 구조가 다르다 — 1:1이 아니라 파티원 전원이 보는 단톡방이고,
            파티당 파트너는 한 명뿐이다. 모르고 들어가면 1:1처럼 말하게 된다. */}
        {isParty && (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-1.5">
            <p className="text-[12px] font-black text-brand-amber">파티 운용방법</p>
            {[
              { n: "1", t: "마음에 드는 파티에 오퍼를 보내요 (파티원 전체가 볼 수 있어요)" },
              { n: "2", t: "파티원들이 상의하여 오퍼를 선택해요." },
              { n: "3", t: "채팅방에 초대되어 상담이 시작돼요." },
            ].map((x) => (
              <div key={x.n} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 mt-[1px] rounded-full bg-amber-500/15 text-brand-amber text-[10px] font-black flex items-center justify-center">
                  {x.n}
                </span>
                <p className="min-w-0 flex-1 text-[12.5px] font-black text-foreground leading-snug break-keep">{x.t}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2.5 text-center text-[12.5px] font-black text-foreground">
          유저가 혹할만한 <span className="text-brand-amber">테이블 구성</span>으로 오퍼해보세요!
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-2.5 rounded-xl bg-amber-500 text-black font-black text-[14px] active:scale-95 transition-transform"
        >
          확인, 계속할게요
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-full mt-2 text-center text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
        >
          다시 보지 않기
        </button>
      </SheetContent>
    </Sheet>
  );
}
