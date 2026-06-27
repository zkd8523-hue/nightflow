"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BadgeCheck, CheckCircle2, Flame, XCircle, ChevronRight, Instagram, User, Pencil } from "lucide-react";
import { AdminWithdrawOfferButton } from "@/components/admin/AdminWithdrawOfferButton";
import type { PuzzleOffer } from "@/types/database";
import { formatRelativeTime } from "@/lib/utils/format";
import { LIQUOR_KEYWORDS } from "@/lib/constants/liquor";

function isLiquor(item: string): boolean {
  return LIQUOR_KEYWORDS.some((kw) => item.includes(kw));
}

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
  onAdminEdit?: (offer: PuzzleOffer) => void;
  isForeigner?: boolean;
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
  onAdminEdit,
  isForeigner,
}: SecretOfferCardProps) {
  const club = offer.club as { name?: string; area?: string } | null;
  const dealCount = offer.md?.md_deal_count ?? null;
  const staggerStyle = { "--stagger-idx": index } as React.CSSProperties;
  const t = (ko: string, en: string) => (isForeigner ? en : ko);

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
          {offer.club_id ? (
            <Link
              href={`/clubs/${offer.club_id}`}
              className="inline-flex items-center gap-0.5 text-[15px] font-black text-white hover:text-amber-300 transition-colors"
            >
              {club?.name || t("클럽", "Club")}
              {club?.area && (
                <span className="text-neutral-500 font-medium"> · {club.area}</span>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-neutral-500 ml-0.5" />
            </Link>
          ) : (
            <p className="text-[15px] font-black text-white">
              {club?.name || t("클럽", "Club")}
              {club?.area && (
                <span className="text-neutral-500 font-medium"> · {club.area}</span>
              )}
            </p>
          )}
        </div>
        {offer.status === "accepted" ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold">
            {t("✓ 수락됨", "✓ Accepted")}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500 font-medium" suppressHydrationWarning>
            {formatRelativeTime(offer.created_at)}
          </span>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-neutral-800/60">
        <p className="text-[16px] font-black text-green-400">
          {isForeigner ? `₩${offer.proposed_price.toLocaleString()}` : `${offer.proposed_price.toLocaleString()}원`}
        </p>
        {offer.includes.length > 0 && (() => {
          const liquors = offer.includes.filter(isLiquor);
          const extras = offer.includes.filter((i) => !isLiquor(i));
          return (
            <div className="space-y-1.5">
              {liquors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {liquors.map((inc) => (
                    <span
                      key={inc}
                      className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    >
                      🍾 {inc}
                    </span>
                  ))}
                </div>
              )}
              {extras.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {extras.map((inc) => (
                    <span
                      key={inc}
                      className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-500 border border-neutral-800"
                    >
                      {inc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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
          <span className="text-[10px] font-bold text-neutral-400">{isForeigner ? `${dealCount} deals` : `거래 ${dealCount}회`}</span>
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
            {t("수락", "Accept")}
          </Button>
          <Button
            onClick={() => onReject(offer.id)}
            disabled={actionLoading}
            variant="outline"
            className="flex-1 h-10 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[13px] rounded-xl"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            {t("거절", "Reject")}
          </Button>
        </div>
      )}

      {isAdmin && offer.md && (
        <div className="pt-2 mt-1 border-t border-red-500/20 bg-red-500/5 -mx-4 px-4 pb-1 space-y-1">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">관리자 전용 — MD 식별 정보</p>
          <div className="flex items-center gap-3 text-[12px] text-neutral-300 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3 text-neutral-500" />
              <span className="font-bold text-white">{offer.md.display_name || "이름 없음"}</span>
            </span>
            {offer.md.instagram && (
              <a
                href={`https://instagram.com/${offer.md.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-pink-400 hover:text-pink-300"
              >
                <Instagram className="w-3 h-3" />
                <span className="font-mono">@{offer.md.instagram.replace(/^@/, "")}</span>
              </a>
            )}
            {!offer.md.instagram && (
              <span className="text-neutral-600 text-[11px]">인스타 미등록</span>
            )}
          </div>
        </div>
      )}

      {isAdmin && offer.status === "pending" && (
        <div className="pt-1 flex justify-end gap-2">
          {onAdminEdit && (
            <button
              type="button"
              onClick={() => onAdminEdit(offer)}
              disabled={actionLoading}
              className="h-8 px-3 rounded-lg border border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 font-bold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Pencil className="w-3.5 h-3.5" />
              수정
            </button>
          )}
          <AdminWithdrawOfferButton offerId={offer.id} variant="full" onWithdrawn={onWithdrawn} />
        </div>
      )}
    </div>
  );
}
