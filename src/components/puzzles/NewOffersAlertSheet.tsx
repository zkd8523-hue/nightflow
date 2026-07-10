"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// 마지막으로 "확인"한 오퍼 시각(ISO)을 저장. 이보다 최근 오퍼가 있으면 다시 노출.
// → 새 오퍼가 올 때마다 재노출되어 "발견 못함" 문제 해결.
const SEEN_KEY = "nightflow_new_offers_alert_seen_v1";

interface OfferAlertData {
  totalOffers: number; // pending 오퍼 총 개수
  flagCount: number; // 오퍼가 온 깃발 개수
  targetFlagId: string; // 깃발 1개면 해당 id, 여러 개면 "" (MY로 이동)
  latestOfferAt: string; // 가장 최근 오퍼 created_at
}

export function NewOffersAlertSheet() {
  const router = useRouter();
  const [data, setData] = useState<OfferAlertData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      // 1. 제안 받는중(open) 상태의 내 깃발
      supabase
        .from("puzzles")
        .select("id")
        .eq("leader_id", user.id)
        .eq("status", "open")
        .is("leader_hidden_at", null)
        .then(({ data: flags }) => {
          if (!flags || flags.length === 0) return;

          const flagIds = flags.map((f) => f.id);

          // 2. 해당 깃발들의 pending 오퍼
          supabase
            .from("puzzle_offers")
            .select("puzzle_id, created_at")
            .in("puzzle_id", flagIds)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .then(({ data: offers }) => {
              if (!offers || offers.length === 0) return;

              const latestOfferAt = offers[0].created_at;

              // 마지막으로 본 오퍼 이후 새 오퍼가 없으면 노출 안 함
              const seen = localStorage.getItem(SEEN_KEY);
              if (seen && seen >= latestOfferAt) return;

              const flagsWithOffers = new Set(offers.map((o) => o.puzzle_id));

              setData({
                totalOffers: offers.length,
                flagCount: flagsWithOffers.size,
                targetFlagId:
                  flagsWithOffers.size === 1
                    ? (offers[0].puzzle_id as string)
                    : "",
                latestOfferAt,
              });
              setOpen(true);
            });
        });
    });
  }, []);

  const markSeen = () => {
    if (data) localStorage.setItem(SEEN_KEY, data.latestOfferAt);
    setOpen(false);
  };

  const handleGo = () => {
    markSeen();
    router.push(data?.targetFlagId ? `/flags/${data.targetFlagId}` : "/profile");
  };

  if (!data) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) markSeen();
      }}
    >
      <DialogContent
        className="max-w-[340px] rounded-3xl bg-[#1C1C1E] border-amber-500/30 p-6"
      >
        <DialogTitle className="sr-only">신규 오퍼 알림</DialogTitle>
        <div className="space-y-5">
          <div className="space-y-2 text-center">
            <p className="text-[40px] leading-none">💌</p>
            <p className="text-[20px] font-black text-white">
              오퍼 <span className="text-amber-400">{data.totalOffers}건</span>이
              기다리고 있어요
            </p>
            <p className="text-[14px] text-neutral-300 leading-relaxed">
              마음에 드는 오퍼를 골라 상담해보세요!
            </p>
          </div>

          <div className="space-y-2 px-1">
            <button
              onClick={handleGo}
              className="w-full py-4 rounded-2xl bg-amber-500 text-black font-black text-[16px] shadow-[0_0_14px_rgba(245,158,11,0.28)] active:scale-[0.98] transition-transform"
            >
              지금 확인하기
            </button>
          </div>

          <p className="text-center text-[12px] text-neutral-600">
            내 깃발은 언제든 하단 <span className="text-neutral-400">MY</span>{" "}
            탭에서 확인할 수 있어요
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
