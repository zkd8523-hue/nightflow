"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isGuideDismissedLocally, markGuideSeen } from "@/lib/utils/guideFlag";

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
    // 계정 플래그 기록이 실패한 기기에서도 다시 뜨지 않게 (guideFlag 참고)
    if (isGuideDismissedLocally("offer_credit_guide_seen", user.id)) return;
    setOpen(true);
  }, [user, isLoading, isMd, manualOpen]);

  const dismiss = async () => {
    setOpen(false);
    // 직접 열어본 것은 "안내를 봤다"로 기록하지 않는다
    if (manualOpen) { onManualClose?.(); return; }
    dismissedRef.current = true;
    if (!user) return;
    const saved = await markGuideSeen("offer_credit_guide_seen", user.id);
    if (saved) refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pt-5 pb-5 gap-0"
      >
        {/* 파트너가 이 시트에서 가장 먼저 봐야 하는 건 요금이 아니라 이 화면으로 뭘 얻는가다.
            요금은 버튼 바로 위 한 줄로 내렸다. */}
        <SheetHeader className="text-left p-0 gap-0 mb-0.5">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            {isParty ? (
              <>나플로 <span className="text-emerald-400 text-[23px]">조각</span>을 모아보세요!</>
            ) : (
              <><span className="text-emerald-400 text-[23px]">깃발</span>을 따고 <span className="text-emerald-400 text-[23px]">매출</span>을 높여보세요!</>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* 파티는 깃발과 상담 구조가 다르다 — 1:1이 아니라 파티원 전원이 보는 단톡방이고,
            파티당 파트너는 한 명뿐이다. 모르고 들어가면 1:1처럼 말하게 된다.
            깃발은 방장 1인에게만 공개되는 시크릿오퍼다 (OfferSheet.tsx "방장에게만 공개돼요"). */}
        <div className="bg-card border border-border rounded-2xl p-3 space-y-1.5 mt-2.5">
          <p className="text-[12px] font-black text-brand-amber">{isParty ? "파티 운용방법" : "이용안내"}</p>
          {(isParty
            ? [
                { n: "1", t: "마음에 드는 파티에 오퍼를 보내요 (파티원 전체가 볼 수 있어요)" },
                { n: "2", t: "파티원들이 상의하여 오퍼를 선택해요." },
                { n: "3", t: "채팅방에 초대되어 상담이 시작돼요." },
              ]
            : [
                { n: "1", t: "마음에 드는 깃발에 오퍼를 보내요 (방장에게만 공개돼요)" },
                { n: "2", t: "방장이 받은 오퍼들을 비교하고 선택해요." },
                { n: "3", t: "채팅방이 열리고 상담이 시작돼요." },
              ]
          ).map((x) => (
            <div key={x.n} className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 mt-[1px] rounded-full bg-amber-500/15 text-brand-amber text-[10px] font-black flex items-center justify-center">
                {x.n}
              </span>
              <p className="min-w-0 flex-1 text-[12.5px] font-black text-foreground leading-snug break-keep">{x.t}</p>
            </div>
          ))}
        </div>

        {/* 파티는 운용방법 3줄이 이미 길다 — 여기에 한 줄 더 붙으면 요금이 접힌다 */}
        {!isParty && (
          <p className="mt-3 text-center text-[12.5px] font-black text-foreground">
            유저가 혹할만한 <span className="text-brand-amber">테이블 구성</span>으로 오퍼해보세요!
          </p>
        )}

        {/* 금액 근거: OfferSheet.tsx(Migration 358) — 깃발 15, 조각 10 크레딧 */}
        <p className={`text-center text-[11px] text-muted-foreground font-semibold ${isParty ? "mt-3" : "mt-1.5"}`}>
          무료 오퍼, 매치시에만 <span className="text-brand-amber font-black">{isParty ? 10 : 15} 크레딧</span>
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-3 rounded-xl bg-amber-500 text-black font-black text-[14px] active:scale-95 transition-transform"
        >
          {isParty ? "조각원 모으기" : "확인, 계속할게요"}
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
