"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Image from "next/image";
import { ArrowDown, Clock } from "lucide-react";
import { isGuideDismissedLocally, markGuideSeen } from "@/lib/utils/guideFlag";

/** 미리보기 카드용 자체 이미지 — 실제 클럽 로고를 예시로 노출하면 안 된다 */
const SAMPLE_IMAGES = ["/guide-coupon-1.png", "/guide-coupon-2.jpeg", "/guide-coupon-3.jpg"];

/** 여러 종류를 한꺼번에 뿌릴 수 있다는 걸 보여준다 — 한 장만 두면 1건짜리 기능으로 읽힌다 */
const SAMPLE_COUPONS: { value: string; unit: string; sub: string; until: string; noClock?: boolean }[] = [
  { value: "10만원", unit: "쿠폰", sub: "300만원 이상 구매 시", until: "오늘 5시까지" },
  { value: "무료입장", unit: "", sub: "23시 이전 입장", until: "5장 남음", noClock: true },
  { value: "20%", unit: "쿠폰", sub: "테이블 할인", until: "내일 5시까지" },
];

/**
 * 파트너 쿠폰 가이드 — 첫 대시보드 진입 1회 + ⓘ 이용방법.
 *
 * 게스트 간판(GuestSignPreviewSheet)과 같은 형식: PREVIEW 라벨 + 번호 단계 카드 +
 * 실제 화면 미리보기를 한 스크롤에 담는다. 세 도구의 안내가 서로 다른 모양이면
 * 파트너 입장에서 매번 새로 읽어야 한다.
 *
 * 쿠폰만의 설명 포인트는 두 가지다.
 *   1. 승인 비밀번호라는 사전 준비가 있다 (없으면 발행 자체가 막힌다)
 *   2. 사용 처리를 MD가 직접 누른다 (유저 혼자 못 쓴다)
 */
export function CouponOnboardingSheet({
  manualOpen = false,
  onManualClose,
  onSeen,
}: {
  /** "ⓘ 이용방법"처럼 직접 열 때 — 봤다고 기록하지 않는다 */
  manualOpen?: boolean;
  onManualClose?: () => void;
  /** 첫 노출 가이드를 닫았을 때. 대시보드가 SSR props를 쓰기 때문에
   *  refetch만으로는 반짝임이 안 꺼져서 부모에게 직접 알려준다. */
  onSeen?: () => void;
} = {}) {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (manualOpen) { setOpen(true); return; }

    // 로컬 확인용(프로덕션 제외): ?couponGuide=1 로 조건 무시하고 띄운다.
    if (
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("couponGuide") === "1"
    ) {
      setOpen(true);
      return;
    }

    if (isLoading || !user || !isMd) return;
    if (user.coupon_guide_seen) return;
    if (isGuideDismissedLocally("coupon_guide_seen", user.id)) return;

    // 다른 시트가 이미 열려 있으면 끼어들지 않는다 (조각 가이드와 겹치면 튕겨 보인다)
    if (typeof document !== "undefined" && document.querySelector("[data-state='open'][role='dialog']")) return;

    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [manualOpen, isLoading, user, isMd]);

  const dismiss = async () => {
    setOpen(false);
    if (manualOpen) { onManualClose?.(); return; }
    onSeen?.();
    if (!user) return;
    const saved = await markGuideSeen("coupon_guide_seen", user.id);
    if (saved) refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl !h-[88vh] !max-h-[88vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>쿠폰 이용방법</SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-[22px] font-black text-foreground tracking-tight">
              쿠폰 사용법
            </h2>
            <p className="text-[13px] text-muted-foreground leading-snug">
              주류 할인, 프리드링크 쿠폰을
              <br />
              언제든지, 원하는 만큼 뿌릴 수 있어요!
            </p>
          </div>

          {/* Step 1: 발행 — 유저 화면에 뜨는 카드 미리보기 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StepNo n={1} />
              <p className="text-[13px] text-foreground font-bold">혜택 고르고 발행</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {SAMPLE_COUPONS.map((c, i) => (
                  <div key={c.value} className="w-36 shrink-0 rounded-xl overflow-hidden bg-card border border-border">
                    <div className="relative h-16">
                      <Image
                        src={SAMPLE_IMAGES[i]}
                        alt=""
                        fill
                        sizes="144px"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-2.5 space-y-0.5">
                      <p className="text-[14px] font-black leading-tight truncate">
                        <span className="text-brand-amber">{c.value}</span>
                        {c.unit && <span className="text-foreground ml-1">{c.unit}</span>}
                      </p>
                      <p className="text-[10.5px] font-bold text-muted-foreground truncate">{c.sub}</p>
                      <p className="text-[10.5px] font-bold text-foreground pt-1 truncate">내 클럽</p>
                      <div className="flex items-center gap-0.5 text-[10px] font-bold text-brand-amber">
                        {!c.noClock && <Clock className="w-2.5 h-2.5 shrink-0" />}
                        {c.until}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">유저 홈에 이렇게 노출돼요</p>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 2: 승인 비밀번호 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StepNo n={2} />
              <p className="text-[13px] text-foreground font-bold">승인 비밀번호 정하기</p>
            </div>
            <div className="bg-black/40 rounded-xl p-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="w-3.5 h-3.5 rounded-full bg-amber-400" />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground font-bold">나만 아는 4자리</p>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 3: 현장 사용 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <StepNo n={3} />
              <p className="text-[13px] text-foreground font-bold">현장에서 쿠폰 확인/승인</p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-snug pl-8">
              손님이 티켓 화면을 보여주면
              <br />
              비밀번호를 누르면 사용 처리됩니다.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="w-full h-14 bg-amber-500 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            🎟️ 쿠폰 발행하러 가기
          </button>

        </div>
      </SheetContent>
    </Sheet>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">
      {n}
    </div>
  );
}
