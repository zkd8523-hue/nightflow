"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 클럽 지역 (강남/홍대/이태원 등). 없으면 "주변"으로 표기 */
  area?: string | null;
  /** 진입 클럽명 — "여기 포함" 안심 문구용 */
  clubName: string;
  /** 깃발 작성 링크 (비로그인 시 로그인 리다이렉트 포함) */
  ctaHref: string;
}

/**
 * 클럽 상세에서 "예약하기"를 누른 최초 유저에게 깃발(지역 역경매) 메커니즘을
 * 익숙한 언어로 설명하는 가이드 시트.
 * 1. 날짜·인원·예산 올리기
 * 2. 지역 클럽 MD들이 앞다퉈 제안 (진입 클럽 포함)
 * 3. 골라서 직접 연락
 * → CTA에서 처음으로 '깃발' 용어 등장
 */
export function FlagExplainerSheet({ open, onOpenChange, area, clubName, ctaHref }: Props) {
  const trimmedArea = area?.trim() || "";
  const areaText = trimmedArea || "주변";
  const areaTitle = trimmedArea ? `${trimmedArea} 클럽` : "클럽";
  const ctaLabel = "제안 받아보기";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl !max-h-[90vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{areaTitle} 예약 방법 안내</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-[22px] font-black text-white tracking-tight leading-tight">
              🎉 {areaTitle}, 요즘은 이렇게 예약해요
            </h2>
            <p className="text-[13px] text-neutral-400 leading-snug">
              예약금 없이 여러 곳 제안 받고 골라요
            </p>
          </div>

          {/* Step 1: 조건 올리기 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">1</div>
              <p className="text-[14px] text-white font-bold">원하는 날짜·인원·예산 정하기</p>
            </div>
            <div className="bg-black/40 rounded-xl px-3 py-2.5">
              <span className="text-neutral-300 text-[13px] font-medium">
                &quot;{areaText}, 토요일 4명, 15만원🚩&quot;
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 2: MD들이 제안 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">2</div>
              <p className="text-[14px] text-white font-bold">{areaText} 클럽들이 앞다퉈 제안</p>
            </div>
            <p className="text-[13px] text-neutral-300 leading-snug pl-8">
              <span className="text-amber-400 font-bold">{clubName} 포함</span> 여러 클럽이 예산에 맞는
              패키지 제안 → 비교해서 골라요
            </p>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 3: 골라서 연락 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">3</div>
              <p className="text-[14px] text-white font-bold">마음에 드는 제안 골라 채팅 상담 후 결정!</p>
            </div>
          </div>

          {/* CTA — 여기서 '깃발' 용어 첫 등장 */}
          <Link
            href={ctaHref}
            onClick={() => onOpenChange(false)}
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            {ctaLabel}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
