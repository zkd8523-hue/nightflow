"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles, ArrowUp, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { GuestSignPreviewSheet } from "./GuestSignPreviewSheet";
import { normalizeDowSlots, getActiveWeekStartISO } from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

const DOW_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DISMISS_KEY = "nf_guestsign_cta_dismissed_until";
const DISMISS_DAYS = 7;

/**
 * MD/admin에게만 노출되는 게스트 간판 행동 유도 띠.
 * ClubBenefitSection(오늘 어디갈래?) 아래에 배치.
 *
 * 케이스:
 * A) 본인이 이번 주 슬롯 차지 X → "이번 주 게스트 간판 차지하고 단독 노출"
 * B) 본인이 슬롯 차지 O + 혜택 미입력 요일 있음 → "요일별 혜택 입력하면 노출이 강해져요"
 * C) 본인이 슬롯 차지 O + 모든 요일 혜택 완료 → CTA 숨김
 */
export function GuestSignMdCta() {
  const { user, isLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<"none" | "partial" | "complete" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    try {
      const until = window.localStorage.getItem(DISMISS_KEY);
      if (until && Date.now() < Number(until)) {
        setDismissed(true);
      }
    } catch {
      // localStorage 접근 불가 시 무시하고 노출
    }
  }, []);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    } catch {
      // 저장 실패해도 이번 세션에서는 숨김
    }
    setDismissed(true);
  };

  useEffect(() => {
    if (!isMdOrAdmin || !user?.id) return;
    let cancelled = false;
    (async () => {
      const thisWeekISO = getActiveWeekStartISO();
      const { data } = await supabase
        .from("weekly_hotdeal_slots")
        .select("id, benefits_by_dow, expires_at")
        .eq("md_id", user.id)
        .eq("week_start", thisWeekISO)
        .limit(1);
      if (cancelled) return;
      const mySlot = data?.[0] as
        | { benefits_by_dow: HotdealBenefitsByDow | null; expires_at: string }
        | undefined;
      if (!mySlot) {
        setState("none");
        return;
      }
      const benefits = (mySlot.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
      const filled = DOW_KEYS.filter(
        (k) => normalizeDowSlots(benefits[k as HotdealDow]).length > 0
      ).length;
      setState(filled >= DOW_KEYS.length ? "complete" : "partial");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, isMdOrAdmin, user?.id]);

  if (isLoading) return null;
  if (!isMdOrAdmin) return null;
  if (state === null) return null;
  if (state === "complete") return null;

  // 본인 슬롯 X → 미리보기 Sheet 트리거 (위 화살표 + 호기심 카피)
  if (state === "none") {
    if (dismissed) return null;
    return (
      <>
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-full flex items-center gap-2 rounded-2xl pl-4 pr-9 py-3 bg-amber-500/15 border border-amber-500/40 active:scale-[0.99] transition-transform text-left"
          >
            <ArrowUp className="w-4 h-4 text-brand-amber shrink-0 animate-bounce" />
            <p className="text-[12.5px] font-bold leading-snug flex-1 text-foreground dark:text-amber-50">
              여기를 <span className="text-brand-amber">내 게스트 광고판</span>으로 쓰고 싶다면?<br /><span className="text-brand-amber dark:text-brand-amber/60 font-medium">(1클럽 1파트너)</span>
            </p>
            <ChevronRight className="w-4 h-4 shrink-0 text-brand-amber" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            aria-label="7일간 보지 않기"
            className="absolute top-2 right-2 p-1 rounded-full text-brand-amber/60 hover:text-brand-amber active:scale-90 transition-transform"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <GuestSignPreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
      </>
    );
  }

  // 본인 슬롯 O + 혜택 일부만 입력
  return (
    <Link
      href="/md/dashboard?section=guestsign"
      className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-card border border-border active:scale-[0.99] transition-transform"
    >
      <Sparkles className="w-4 h-4 text-brand-amber shrink-0" />
      <p className="text-[12.5px] font-bold leading-snug flex-1 text-foreground">
        <span className="text-brand-amber">내 간판</span> 세팅하기
      </p>
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
