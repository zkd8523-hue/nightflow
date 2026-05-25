"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { GuestSignPreviewSheet } from "./GuestSignPreviewSheet";

const DOW_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function getThisWeekISO(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dowIdx = kstNow.getUTCDay();
  const daysFromMonday = dowIdx === 0 ? 6 : dowIdx - 1;
  const thisMonday = new Date(kstNow);
  thisMonday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);
  return thisMonday.toISOString().slice(0, 10);
}

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

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (!isMdOrAdmin || !user?.id) return;
    let cancelled = false;
    (async () => {
      const thisWeekISO = getThisWeekISO();
      const { data } = await supabase
        .from("weekly_hotdeal_slots")
        .select("id, benefits_by_dow, expires_at")
        .eq("md_id", user.id)
        .eq("week_start", thisWeekISO)
        .limit(1);
      if (cancelled) return;
      const mySlot = data?.[0] as
        | { benefits_by_dow: Record<string, string> | null; expires_at: string }
        | undefined;
      if (!mySlot) {
        setState("none");
        return;
      }
      const benefits = mySlot.benefits_by_dow ?? {};
      const filled = DOW_KEYS.filter((k) => (benefits[k] ?? "").trim().length > 0).length;
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
    return (
      <>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-amber-500/15 border border-amber-500/40 active:scale-[0.99] transition-transform text-left"
        >
          <ArrowUp className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
          <p className="text-[12.5px] font-bold leading-snug flex-1 text-amber-50">
            여기를 <span className="text-amber-400">내 게스트 광고판</span>으로 쓰고 싶다면?
          </p>
          <ChevronRight className="w-4 h-4 shrink-0 text-amber-400" />
        </button>
        <GuestSignPreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
      </>
    );
  }

  // 본인 슬롯 O + 혜택 일부만 입력
  return (
    <Link
      href="/md/hotdeal"
      className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-[#1C1C1E] border border-neutral-800 active:scale-[0.99] transition-transform"
    >
      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
      <p className="text-[12.5px] font-bold leading-snug flex-1 text-white">
        요일별 혜택 입력하면 <span className="text-amber-400">노출이 강해져요</span>
      </p>
      <ChevronRight className="w-4 h-4 shrink-0 text-neutral-500" />
    </Link>
  );
}
