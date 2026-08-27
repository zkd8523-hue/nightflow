"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCountdown } from "@/hooks/useCountdown";

const DISMISS_KEY = "selecting_alert_dismissed";

export function SelectingFlagAlertSheet() {
  const router = useRouter();
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("puzzles")
        .select("id, expires_at")
        .eq("leader_id", user.id)
        .eq("status", "selecting")
        // 깃발 전용 알림이다 — 조각(파티)까지 긁어오면 "깃발이 없는데 왜 뜨지"가 된다.
        // 조각은 MD 고정가 방이라 고를 오퍼 자체가 없고, 아래 CTA의 /flags/[id]도 엉뚱한 화면이다.
        .eq("is_recruiting_party", false)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPuzzleId(data.id);
            setExpiresAt(data.expires_at);
            setOpen(true);
          }
        });
    });
  }, []);

  const { remaining } = useCountdown(expiresAt);
  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const handleGo = () => {
    handleDismiss();
    if (puzzleId) router.push(`/flags/${puzzleId}`);
  };

  if (!puzzleId) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-card border-amber-500/30 pb-10">
        <div className="space-y-5 pt-4">
          <div className="space-y-1 text-center">
            <p className="text-[20px] font-black text-foreground">⏰ 검토 중인 깃발이 있어요</p>
            <p className="text-[14px] text-brand-amber font-bold">마지막 선택 기회!</p>
          </div>
          <p className="text-center text-[36px] font-mono font-black text-foreground tracking-widest">
            {mm}:{ss}
          </p>
          <div className="space-y-2 px-1">
            <button
              onClick={handleGo}
              className="w-full py-4 rounded-2xl bg-inverse text-inverse-foreground font-black text-[16px] active:scale-[0.98] transition-transform"
            >
              지금 확인하기
            </button>
            <button
              onClick={handleDismiss}
              className="w-full py-2 text-[13px] text-muted-foreground"
            >
              나중에
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
