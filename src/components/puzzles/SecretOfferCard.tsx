"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock, CheckCircle2, XCircle, BadgeCheck, Flame } from "lucide-react";
import { AdminWithdrawOfferButton } from "@/components/admin/AdminWithdrawOfferButton";
import type { PuzzleOffer } from "@/types/database";
import { useRevealedOffers } from "@/hooks/useRevealedOffers";

const REVEAL_DURATION_MS = 600;

interface SecretOfferCardProps {
  offer: PuzzleOffer;
  offerNumber: number;
  index: number;
  userId: string | null | undefined;
  isAdmin: boolean;
  isOpen: boolean;
  actionLoading: boolean;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onWithdrawn: () => void;
}

export function SecretOfferCard({
  offer,
  offerNumber,
  index,
  userId,
  isAdmin,
  isOpen,
  actionLoading,
  onAccept,
  onReject,
  onWithdrawn,
}: SecretOfferCardProps) {
  const { isLoaded, hasRevealed, markRevealed } = useRevealedOffers(userId);
  const [revealing, setRevealing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // 강제 공개: 깃발이 닫혔거나 오퍼가 pending이 아니면 잠금 의미 X
  const forceReveal = !isOpen || offer.status !== "pending";
  // hydration 깜빡임 방지: isLoaded 전엔 잠금으로 통일
  const isRevealed = forceReveal || (isLoaded && hasRevealed(offer.id));

  const handleReveal = () => {
    if (isRevealed || revealing) return;
    setRevealing(true);
    markRevealed(offer.id);
    timerRef.current = setTimeout(() => {
      setRevealing(false);
      timerRef.current = null;
    }, REVEAL_DURATION_MS);
  };

  const club = offer.club as { name?: string; area?: string } | null;
  const dealCount = offer.md?.md_deal_count ?? null;

  const staggerStyle = { "--stagger-idx": index } as React.CSSProperties;

  // 잠금 상태 (isLoaded 전 SSR + reveal 전 클라이언트)
  if (!isRevealed) {
    return (
      <div
        style={staggerStyle}
        className="animate-offer-card-enter relative rounded-2xl border border-dashed border-neutral-700 bg-[#1C1C1E] p-4 space-y-3 cursor-pointer active:scale-[0.98] hover:border-neutral-500 transition-colors overflow-hidden"
        onClick={handleReveal}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleReveal();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-neutral-500" />
            <p className="text-[14px] font-bold text-white">시크릿 오퍼 #{offerNumber}</p>
          </div>
          <span className="text-[16px] font-black text-green-400">
            {offer.proposed_price.toLocaleString()}원
          </span>
        </div>

        {dealCount != null && dealCount >= 3 && (
          <div className="flex items-center gap-1.5">
            {dealCount >= 30 ? (
              <Flame className="w-3 h-3 text-orange-500" />
            ) : dealCount >= 10 ? (
              <BadgeCheck className="w-3 h-3 text-blue-400" />
            ) : (
              <BadgeCheck className="w-3 h-3 text-neutral-500" />
            )}
            <span className="text-[10px] font-bold text-neutral-400">거래 {dealCount}회</span>
          </div>
        )}

        <p className="text-[12px] text-neutral-500 font-bold text-center pt-1">
          탭하여 공개
        </p>
      </div>
    );
  }

  // 공개 상태 — 기존 PuzzleDetailClient 카드 구조 유지
  return (
    <div
      style={staggerStyle}
      className={`relative animate-offer-card-enter rounded-2xl border p-4 space-y-3 overflow-hidden ${
        offer.status === "accepted"
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-[#1C1C1E] border-neutral-800"
      } ${revealing ? "animate-offer-reveal" : ""}`}
    >
      {revealing && (
        <div className="pointer-events-none absolute inset-0 animate-offer-reveal-shine" />
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-black text-white">
            {club?.name || "클럽"}
            {club?.area && (
              <span className="text-neutral-500 font-medium"> · {club.area}</span>
            )}
          </p>
        </div>
        {offer.status === "accepted" ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold">
            ✓ 수락됨
          </span>
        ) : (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 font-medium">
            제안 중
          </span>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-neutral-800/60">
        <p className="text-[16px] font-black text-green-400">
          {offer.proposed_price.toLocaleString()}원
        </p>
        {offer.includes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.includes.map((inc) => (
              <span
                key={inc}
                className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700"
              >
                {inc}
              </span>
            ))}
          </div>
        )}
        {offer.comment && (
          <p className="text-[12px] text-neutral-400 italic">&ldquo;{offer.comment}&rdquo;</p>
        )}
      </div>

      {dealCount != null && dealCount >= 3 && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-neutral-800/60">
          {dealCount >= 30 ? (
            <Flame className="w-3 h-3 text-orange-500" />
          ) : dealCount >= 10 ? (
            <BadgeCheck className="w-3 h-3 text-blue-400" />
          ) : (
            <BadgeCheck className="w-3 h-3 text-neutral-500" />
          )}
          <span className="text-[10px] font-bold text-neutral-400">거래 {dealCount}회</span>
        </div>
      )}

      {isOpen && offer.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => onAccept(offer.id)}
            disabled={actionLoading}
            className="flex-1 h-10 bg-white hover:bg-neutral-200 text-black font-black text-[13px] rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            수락
          </Button>
          <Button
            onClick={() => onReject(offer.id)}
            disabled={actionLoading}
            variant="outline"
            className="flex-1 h-10 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[13px] rounded-xl"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            거절
          </Button>
        </div>
      )}

      {isAdmin && offer.status === "pending" && (
        <div className="pt-1 flex justify-end">
          <AdminWithdrawOfferButton offerId={offer.id} variant="full" onWithdrawn={onWithdrawn} />
        </div>
      )}
    </div>
  );
}
