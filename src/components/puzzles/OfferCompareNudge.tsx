"use client";

import { Scale, X } from "lucide-react";
import { type Lang, makeT } from "@/lib/i18n";

interface OfferCompareNudgeProps {
  /** "비교하기" — 정가 비교창 열기 */
  onCompare: () => void;
  /** 닫기(나중에) */
  onClose: () => void;
  lang?: Lang;
}

/**
 * 방장이 오퍼를 받고도 상담을 시작하지 않고 머무를 때 1회 뜨는 넛지.
 * 압박이 아니라 "정말 정가보다 이득인지 직접 확인" → 비교창으로 유도.
 * (깃발은 예산 고정이라 가격이 아닌 '혜택'으로 비교해야 함)
 */
export function OfferCompareNudge({ onCompare, onClose, lang = "ko" }: OfferCompareNudgeProps) {
  const t = makeT(lang);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/70 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm mx-auto overflow-hidden rounded-3xl border border-[#E8DFC8] bg-[#F5EFE0] p-6 pb-6 text-center shadow-[0_20px_60px_-16px_rgba(120,100,60,0.35)] animate-in fade-in zoom-in-95 duration-200">
        {/* 상단 리본 하이라이트 — 선물 상자 뚜껑 느낌 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("닫기", "Close")}
          className="absolute top-4 right-4 p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-b from-amber-100 to-amber-200/70 ring-1 ring-inset ring-amber-300/50 mb-4 mt-1 text-[34px] leading-none shadow-[0_6px_16px_-6px_rgba(245,158,11,0.6)]">
          <span aria-hidden>🎁</span>
        </div>

        <h3 className="text-[19px] font-black text-neutral-900 leading-snug break-keep">
          {t("시크릿오퍼, 정가보다 얼마나 더 받는 걸까요?", "Secret offer — how much more than list price?")}
        </h3>
        <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed break-keep">
          {t(
            "직접 확인하고 고르세요!",
            "See for yourself before you pick!",
          )}
        </p>

        <button
          type="button"
          onClick={onCompare}
          className="mt-5 flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-black font-black text-[15px] shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)] hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] transition-all"
        >
          <Scale className="w-5 h-5" />
          {t("한 눈에 비교하기", "Compare at a glance")}
        </button>
      </div>
    </div>
  );
}
