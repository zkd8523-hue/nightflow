"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown, ArrowLeft, MessageCircle } from "lucide-react";
import { PuzzlePiece } from "@/components/puzzles/PuzzleCard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * MD가 "내 조각이 어떻게 유저에게 노출되고 채워지는지" 한눈에 보여주는 시각 가이드.
 * 1. 홈/조각 탭에 내 조각 카드 노출 (자리정보·인당가격·잔여석)
 * 2. 유저가 좌석 신청
 * 3. 오픈채팅으로 합류 → 현장에서 만남
 * (핫딜/게스트 간판 PreviewSheet와 동일한 공식)
 */
export function SharePreviewSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl !h-[88vh] !max-h-[88vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>조각 노출 미리보기</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <p className="text-[12px] text-brand-amber font-black tracking-wider">PREVIEW</p>
            <h2 className="text-[22px] font-black text-foreground tracking-tight">
              내 조각이 이렇게 채워져요
              <span className="text-[13px] font-bold text-muted-foreground ml-1.5">(1클럽 1파트너 · 선착순)</span>
            </h2>
            <p className="text-[13px] text-muted-foreground leading-snug">
              유저가 홈에서 자리를 보고
              <br />
              오픈채팅으로 합류해요
            </p>
          </div>

          {/* Step 1: 홈/조각 탭 카드 노출 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">1</div>
              <p className="text-[13px] text-foreground font-bold">홈 &quot;조각&quot;에 내 자리 노출</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 space-y-2">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[15px] font-bold text-brand-amber">초메인 테이블</span>
                <span className="text-[14px] font-black text-money">1인 60,000원</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PuzzlePiece key={i} filled={i < 2} />
                ))}
                <span className="text-[11px] font-semibold text-brand-amber dark:text-brand-amber/80 ml-1">👀 오늘 12명이 봤어요</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1 text-brand-amber text-[10px] font-bold">
              <ArrowLeft className="w-3 h-3" />
              유저가 보고 빈 자리에 합류
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 2: 유저가 좌석 신청 → 퍼즐이 채워짐 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">2</div>
              <p className="text-[13px] text-foreground font-bold">유저가 신청하면 자리가 채워져요</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PuzzlePiece key={i} filled={i < 3} />
                ))}
                <span className="text-[11px] font-bold ml-1 text-red-400">마지막 1자리</span>
              </div>
              <p className="text-[11px] text-muted-foreground">한 명씩 채워질 때마다 실시간 반영돼요</p>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 3: 오픈채팅 합류 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">3</div>
              <p className="text-[13px] text-foreground font-bold inline-flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-money" />
                오픈채팅으로 합류
              </p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-snug pl-8">
              신청한 유저가 내 오픈채팅에 들어와
              <br />
              현장에서 한 테이블로 만나요
            </p>
          </div>

          {/* CTA — 대시보드 조각 탭으로 이동 (대시보드에서 열렸어도 같은 페이지라 무해) */}
          <Link
            href="/md/dashboard?section=share"
            onClick={() => onOpenChange(false)}
            className="w-full h-14 bg-amber-500 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            🧩 내 조각 자리 선점하기
          </Link>

          <p className="text-[11px] text-muted-foreground text-center">
            매주 월 18:00 새 자리 오픈 · 1파트너 1클럽 1주
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
