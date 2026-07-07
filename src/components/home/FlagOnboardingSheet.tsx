"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

// 인라인 가이드(showTopGuide/showGuide)와 동일 키 — 한쪽에서 닫으면 양쪽 다 안 뜸
const FLAG_CTA_SHOWN_KEY = "nightflow_flag_onboarding_v1";

/**
 * 홈 첫 방문 시 깃발 사용법을 실제 카드 UI로 보여주는 바텀시트 팝업.
 * - 실제 PuzzleCard / RecentMatchShowcaseSheet 비주얼을 정적·컴팩트 복제 → 스크롤 없이 한 화면
 * - autoShow=true(비로그인 첫 방문)일 때만, localStorage 미기록이면 1회 자동 오픈
 * - 닫거나 "바로가기" 누르면 localStorage 기록 → 영구 숨김
 */
export function FlagOnboardingSheet({ autoShow }: { autoShow: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoShow) return;
    try {
      if (localStorage.getItem(FLAG_CTA_SHOWN_KEY) === "1") return;
    } catch {
      return;
    }
    setOpen(true);
    trackEvent("flag_onboarding_popup_view");
  }, [autoShow]);

  const markSeen = () => {
    try {
      localStorage.setItem(FLAG_CTA_SHOWN_KEY, "1");
    } catch {}
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) markSeen();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[92vh] bg-[#0A0A0A] border-neutral-800 rounded-t-3xl px-5 pt-6 pb-7 gap-0"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-3">
          <SheetTitle className="text-white text-[21px] font-black tracking-tight leading-tight">
            <span className="text-amber-400">클럽 예약</span>, 나플에서는 이렇게! ⛳
          </SheetTitle>
        </SheetHeader>

        {/* ① 깃발 꽂기 — 실제 PuzzleCard 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-white font-bold">1 조건 등록</span> <span className="text-[10.5px] font-normal text-neutral-500">날짜, 인원, 예산</span>
        </p>
        <div className="bg-[#1C1C1E] rounded-2xl p-3 relative">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-black text-white break-keep">7/12(토) 홍대</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[19px] font-black text-green-400 tracking-tight">예산 500,000원</span>
            <span className="text-[11px] font-bold text-neutral-300 bg-neutral-800 rounded-full px-2 py-0.5">4명</span>
          </div>
        </div>

        <div className="flex justify-center py-1">
          <ArrowDown className="w-5 h-5 text-amber-500" />
        </div>

        {/* ② 시크릿 오퍼 — 실제 RecentMatchShowcaseSheet 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-white font-bold">2 제안 받기</span> <span className="text-[10.5px] font-normal text-neutral-500">당신만을 위한 맞춤 패키지</span>
        </p>
        <div className="bg-[#1C1C1E] rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {["퍼레이드", "전광판", "믹서 무한", "생일 이벤트 지원"].map((ext) => (
              <span
                key={ext}
                className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
              >
                {ext}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-neutral-300 italic leading-snug">
            &ldquo;홍대에서 1등이 되게 해드리겠습니다&rdquo;
          </p>
          {/* 강조 문구 (실제 쇼케이스 하드코딩 문구 재사용) */}
          <p className="text-[12.5px] font-black text-amber-200 leading-snug break-keep pt-1 border-t border-neutral-800 mt-1">
            🎉 당일 예약보다 <span className="text-amber-300">30만원치 더</span> 받았어요
          </p>
        </div>

        <div className="flex justify-center py-1">
          <ArrowDown className="w-5 h-5 text-amber-500" />
        </div>

        {/* ③ 채팅 상담 — 마음에 드는 오퍼와 바로 대화 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-white font-bold">3 채팅 상담</span> <span className="text-[10.5px] font-normal text-neutral-500">마음에 드는 오퍼 고르기</span>
        </p>
        <div className="bg-[#1C1C1E] rounded-2xl p-3 space-y-1.5">
          <div className="flex justify-start">
            <span className="bg-white text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tl-sm px-3 py-1.5 max-w-[82%]">
              예약 가능할까요?
            </span>
          </div>
          <div className="flex justify-end">
            <span className="bg-white text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tr-sm px-3 py-1.5 max-w-[82%]">
              네! 바로 도와드릴게요 😊
            </span>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/login?redirect=/flags/new"
          onClick={() => {
            trackEvent("flag_onboarding_popup_cta");
            markSeen();
            setOpen(false);
          }}
          className="flex flex-col items-center justify-center w-full h-12 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black rounded-2xl shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all leading-tight mt-3.5"
        >
          <span className="font-black text-[15px]">예약 바로가기</span>
          <span className="text-[10px] font-bold text-black/55 mt-0.5">모든 서비스 무료</span>
        </Link>
      </SheetContent>
    </Sheet>
  );
}
