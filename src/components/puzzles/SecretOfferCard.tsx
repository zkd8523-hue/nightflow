"use client";

import { Button } from "@/components/ui/button";
import { BadgeCheck, CheckCircle2, Flame, XCircle } from "lucide-react";
import { AdminWithdrawOfferButton } from "@/components/admin/AdminWithdrawOfferButton";
import type { PuzzleOffer } from "@/types/database";
import { formatRelativeTime } from "@/lib/utils/format";

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
  const club = offer.club as { name?: string; area?: string } | null;
  const dealCount = offer.md?.md_deal_count ?? null;
  const staggerStyle = { "--stagger-idx": index } as React.CSSProperties;

  return (
    <div
      style={staggerStyle}
      className={`animate-offer-card-enter relative rounded-2xl border p-4 space-y-3 overflow-hidden ${
        offer.status === "accepted"
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-[#1C1C1E] border-neutral-800"
      }`}
    >
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
          <span className="text-[11px] text-neutral-500 font-medium" suppressHydrationWarning>
            {formatRelativeTime(offer.created_at)}
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
