"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// 제안가 ±20% 범위 조정 기능(Migration 477) 안내 (1회). 대상: MD/관리자.
const SEEN_KEY = "nf_price_range_onboarding_v1_seen";

export function PriceRangeOnboardingSheet() {
  const { user, isLoading } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (isLoading || !user || !isMd) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_KEY) === "true") return;
    setOpen(true);
  }, [user, isLoading, isMd]);

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(SEEN_KEY, "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="bg-card border-border rounded-3xl p-5">
        <DialogHeader className="text-left p-0 gap-0 mb-2">
          <DialogTitle className="text-foreground font-black text-[17px]">
            💰 이젠 제안가를 설정할 수 있어요!
          </DialogTitle>
        </DialogHeader>

        <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
          이제 예산의 ±20% 범위에서 제안 금액을 직접 조정할 수 있어요.
        </p>

        <div className="bg-muted border border-border rounded-xl px-4 py-3 mb-4 space-y-1">
          <p className="text-[13px] text-muted-foreground">예산 600,000원</p>
          <p className="text-[15px] font-black text-brand-amber">
            → 480,000원 ~ 720,000원
          </p>
        </div>

        <p className="text-[13px] text-foreground/90 font-bold mb-2">
          보틀·서비스뿐 아니라 가격으로도 차별화해보세요!
        </p>

        <Button
          onClick={dismiss}
          className="w-full h-11 bg-inverse text-inverse-foreground font-black rounded-2xl mt-3 hover:opacity-90"
        >
          확인했어요
        </Button>
      </DialogContent>
    </Dialog>
  );
}
