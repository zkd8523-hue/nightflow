"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BadgeCheck, CheckCircle2, Flame, XCircle, ChevronRight, Instagram, User, Pencil, MessageCircle } from "lucide-react";
import { AdminWithdrawOfferButton } from "@/components/admin/AdminWithdrawOfferButton";
import { FeatureGate } from "@/components/common/FeatureGate";
import type { PuzzleOffer } from "@/types/database";
import { formatRelativeTime } from "@/lib/utils/format";
import { splitOfferIncludes } from "@/lib/utils/offerTags";
import { toEnglishInclude } from "@/lib/utils/liquorEn";
import { useTranslatedComment } from "@/hooks/useTranslatedComment";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { LiquorPill } from "./LiquorPill";
import { useLiquorProducts } from "@/hooks/useLiquorProducts";


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
  lang?: Lang;
  /** 조각(파티): 1:1 대신 단체채팅에서 상담 */
  isRecruitingParty?: boolean;
  /** 같은 클럽의 여러 MD 오퍼를 묶어 보여줄 때 — 그룹 상단에서 클럽명을 한 번만 보여주므로 카드 자체 헤더는 숨김 */
  hideClubHeader?: boolean;
  /** 클럽 그룹 내 오퍼가 2개 이상일 때만 #번호 배지 노출 (1개면 구분할 필요 없음) */
  showOfferNumber?: boolean;
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
  lang = "ko",
  isRecruitingParty = false,
  hideClubHeader = false,
  showOfferNumber = true,
}: SecretOfferCardProps) {
  const isForeigner = lang !== "ko";
  const club = offer.club as { name?: string; area?: string } | null;
  const dealCount = offer.md?.md_deal_count ?? null;
  const staggerStyle = { "--stagger-idx": index } as React.CSSProperties;
  const t = makeT(lang);
  const commentEn = useTranslatedComment(offer.comment, isForeigner);
  const { products: liquorProducts } = useLiquorProducts();

  return (
    <div
      style={staggerStyle}
      className={
        hideClubHeader
          ? "animate-offer-card-enter relative py-5 first:pt-0 space-y-3"
          : `animate-offer-card-enter relative rounded-2xl border p-4 space-y-3 ${
              offer.status === "accepted"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-[#0E0E10] border-neutral-800"
            }`
      }
    >
      {hideClubHeader ? (
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-black text-neutral-300 tabular-nums">
            {offer.status === "accepted"
              ? t("✓ 매치됨", "✓ Matched")
              : showOfferNumber
                ? `${offerNumber}`.padStart(2, "0")
                : ""}
          </span>
          <span className="text-[11px] text-neutral-500 font-medium" suppressHydrationWarning>
            {formatRelativeTime(offer.created_at)}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            {offer.club_id ? (
              <Link
                href={`/clubs/${offer.club_id}`}
                className="inline-flex items-baseline gap-0.5 text-[21px] font-black text-white hover:text-amber-300 transition-colors"
              >
                {club?.name || t("클럽", "Club")}
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 self-center" />
              </Link>
            ) : (
              <p className="text-[21px] font-black text-white">
                {club?.name || t("클럽", "Club")}
              </p>
            )}
          </div>
          {offer.status === "accepted" ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold">
              {t("✓ 매치됨", "✓ Matched")}
            </span>
          ) : club?.area ? (
            <span className="text-[12px] text-neutral-500 font-black">{areaLabel(club.area, lang)}</span>
          ) : (
            <span className="text-[11px] text-neutral-500 font-medium" suppressHydrationWarning>
              {formatRelativeTime(offer.created_at)}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {/* 가격 제외 — 고정 예산이라 모든 오퍼가 동일 → 노이즈 */}
        {offer.includes.length > 0 && (() => {
          const { liquors, sellingPoints, extras } = splitOfferIncludes(offer.includes);
          return (
            <div className="space-y-1.5">
              {liquors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {liquors.map((inc) => (
                    <LiquorPill key={inc} includeText={inc} products={liquorProducts} isForeigner={isForeigner} />
                  ))}
                </div>
              )}
              {sellingPoints.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sellingPoints.map((inc) => (
                    <span
                      key={inc}
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-[7px] bg-amber-500/12 text-amber-200 border border-amber-500/25"
                    >
                      {isForeigner ? toEnglishInclude(inc) : inc} 🤫
                    </span>
                  ))}
                </div>
              )}
              {extras.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {extras.map((inc) => (
                    <span
                      key={inc}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-[7px] bg-neutral-900 text-neutral-300 border border-neutral-700/70"
                    >
                      {isForeigner ? toEnglishInclude(inc) : inc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {offer.comment && (
          <p className="text-[13px] leading-relaxed text-neutral-300 border-l border-neutral-600 pl-3">
            &ldquo;{isForeigner ? (commentEn ?? offer.comment) : offer.comment}&rdquo;
          </p>
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
        <FeatureGate
          flag="offer_chat"
          fallback={
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => onAccept(offer.id)}
                disabled={actionLoading}
                className="flex-1 h-10 bg-white hover:bg-neutral-200 text-black font-black text-[13px] rounded-xl"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {t("수락하기", "Accept")}
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
          }
        >
          {isRecruitingParty ? (
            /* 조각: 카드엔 액션 없음(보기 전용). 상담·초대·수락은 단체채팅에서 진행. */
            null
          ) : offer.leader_chat_started_at ? (
            isAdmin ? (
              /* admin 모니터링: MD 답장 여부로 상태 구분 + 상담 건수/마지막 대화(Migration 417) */
              <Link
                href={`/messages/${offer.id}`}
                className={`flex flex-col items-center justify-center gap-0.5 w-full mt-1 rounded-xl py-2 px-3 font-bold text-[13px] ${
                  offer.chat_meta?.replied
                    ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-100"
                    : "bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" />
                  {offer.chat_meta?.replied ? "대화중" : "파트너 답장 기다리는중"}
                </span>
                {offer.chat_meta && (
                  <span className="text-[11px] font-medium text-neutral-400">
                    방장 {offer.chat_meta.leader} · 파트너 {offer.chat_meta.md}
                    {offer.chat_meta.last_at && (
                      <> · 마지막 {offer.chat_meta.last_by === "md" ? "파트너" : "방장"} {formatRelativeTime(offer.chat_meta.last_at)}</>
                    )}
                  </span>
                )}
              </Link>
            ) : (
              /* 채팅 진행 중: 회색 "상담중" 하나만 (즉시수락 숨겨 혼동 방지) */
              <Link
                href={`/messages/${offer.id}`}
                className="flex items-center justify-center gap-1.5 w-full h-11 mt-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-neutral-100 font-bold text-[13px]"
              >
                <MessageCircle className="w-4 h-4" />
                {t("상담중", "Chatting")}
              </Link>
            )
          ) : hideClubHeader ? (
            /* 클럽 그룹 안 여러 MD 카드 — 빛나는 골드 칩형 CTA (주류 배지보다 위계 우선) */
            <div className="flex justify-end pt-1">
              <Link
                href={`/messages/${offer.id}`}
                className="inline-flex items-center gap-1.5 rounded-full px-4 h-9 bg-gradient-to-b from-amber-400 to-amber-500 text-black font-black text-[13px] shadow-[0_0_16px_-2px_rgba(245,158,11,0.6)] hover:from-amber-300 hover:to-amber-400 active:scale-[0.97] transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                {t("상담하기", "Chat")}
              </Link>
            </div>
          ) : (
            /* 상담하기 단일 CTA — 즉시수락 제거, 채팅 상담을 통해서만 성사 유도 */
            <div className="pt-1">
              <Link
                href={`/messages/${offer.id}`}
                className="flex items-center justify-center gap-1.5 w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[13px]"
              >
                <MessageCircle className="w-4 h-4" />
                {t("무료 상담하기", "Free chat")}
              </Link>
            </div>
          )}
        </FeatureGate>
      )}

      {isAdmin && offer.md && (
        <div className="pt-2 mt-1 border-t border-red-500/20 bg-red-500/5 -mx-4 px-4 pb-1 space-y-1">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">관리자 전용 — 파트너 식별 정보</p>
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
