"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { GuestSignPromoSheet } from "./GuestSignPromoSheet";

const SNOOZE_KEY = "nightflow_guestsign_promo_snoozed_until";

/** KST 기준 이번 주 월요일(00:00) — /md/dashboard 서버 쿼리와 동일한 계산식. */
function thisWeekMondayISO(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMon);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/**
 * 파트너(md/admin) 접속 시 앱 어디서나(홈 포함) 노출되는 게스트 간판 참여 유도 팝업.
 * 조건: 소속 클럽 중 이번 주 게스트 간판이 비어있고(아무도 안 걸었고), 내가 이번 주에
 * 이미 다른 클럽으로 걸지 않았을 때만 노출 (md/dashboard 서버 판별 로직과 동일).
 * (main)/(dashboard) 레이아웃 양쪽에 마운트 — ChatUpdateSheet와 동일 패턴.
 * "1주일간 보지않기"는 localStorage 만료 시각으로 재노출 억제, X는 이번 세션만 닫음.
 */
export function GuestSignPromoGate() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isPartner = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (isLoading || !isPartner || !user) return;
    if (typeof window === "undefined") return;

    const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozedUntil && new Date(snoozedUntil) > new Date()) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const thisWeekISO = thisWeekMondayISO();

      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, club_partners!inner(md_id)")
        .eq("club_partners.md_id", user.id)
        .is("deleted_at", null);

      const clubIds = (clubs ?? []).map((c) => c.id);
      if (cancelled || clubIds.length === 0) return;

      const { data: slots } = await supabase
        .from("weekly_hotdeal_slots")
        .select("club_id, md_id")
        .in("club_id", clubIds)
        .eq("week_start", thisWeekISO);
      if (cancelled) return;

      const claimedClubIds = new Set((slots ?? []).map((s) => s.club_id));
      const mineThisWeek = (slots ?? []).some((s) => s.md_id === user.id);
      const hasClaimableClub = clubIds.some((id) => !claimedClubIds.has(id));

      if (!mineThisWeek && hasClaimableClub) {
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isPartner, user]);

  if (!open) return null;

  return (
    <GuestSignPromoSheet
      onClose={() => setOpen(false)}
      onSnooze={() => {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        localStorage.setItem(SNOOZE_KEY, until.toISOString());
        setOpen(false);
      }}
      onOpenGuestSign={() => {
        setOpen(false);
        router.push("/md/dashboard?section=guestsign");
      }}
    />
  );
}
