"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown, Info } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";
import { isInAppBrowser } from "@/lib/utils/browser";

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
  const [secretInfoOpen, setSecretInfoOpen] = useState(false);

  useEffect(() => {
    if (!autoShow) return;
    // 외국인 트랙(?lang=en/ja/zh/zh-tw 또는 /en, /ja, /zh, /zh-tw 하위)은 이 팝업 스킵.
    // 이유: 팝업 내용이 한국어 100%(원화·한국 클럽 용어·한국어 오퍼 예시).
    // Maeve(프랑스)/Ahsan(미국) 로그에도 popup_view만 있고 popup_cta는 0 → 보고 즉시 닫음.
    // 외국인 전용 팝업은 별도 컴포넌트로 향후 제작 예정.
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      const langParam = new URLSearchParams(window.location.search).get("lang");
      const isForeignPath = path.startsWith("/en") || path.startsWith("/ja") || path.startsWith("/zh");
      const isForeignLang = !!langParam && langParam !== "ko";
      if (isForeignPath || isForeignLang) return;
    }
    // 인앱 브라우저(인스타/페북/라인)에서는 스킵 — 로그인 자체가 막혀 CTA가 막다른 길이고,
    // 착지 즉시 InAppBrowserBanner("크롬/사파리로 열기")와 메시지가 겹침. 넛지 하나로 단일화.
    // (광고 유입 99.7%가 인앱 → 팝업 노출 8000건 대비 CTA 0.36%로 사실상 낭비였음)
    if (isInAppBrowser()) return;
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
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[92vh] bg-background border-border rounded-t-3xl px-5 pt-6 pb-7 gap-0"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-3">
          <SheetTitle className="text-foreground text-[21px] font-black tracking-tight leading-tight">
            <span className="text-brand-amber text-[26px]">클럽 예약</span> 나플에서는 이렇게! ⛳
          </SheetTitle>
        </SheetHeader>

        {/* ① 깃발 꽂기 — 실제 PuzzleCard 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">1. 조건 등록</span>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 relative">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-black text-foreground break-keep">7/12(토) 홍대</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[19px] font-black text-money tracking-tight">예산 500,000원</span>
            <span className="text-[11px] font-bold text-foreground/80 bg-muted rounded-full px-2 py-0.5">4명</span>
          </div>
        </div>

        <div className="flex justify-center py-1">
          <ArrowDown className="w-5 h-5 text-brand-amber" />
        </div>

        {/* ② 시크릿 오퍼 — 실제 RecentMatchShowcaseSheet 스타일 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">2. 시크릿오퍼 받기</span>
          <button
            type="button"
            onClick={() => setSecretInfoOpen(true)}
            className="inline-flex items-center align-middle ml-1.5 gap-0.5 text-[11.5px] font-bold text-brand-amber underline underline-offset-2 decoration-amber-400/50 hover:text-brand-amber"
          >
            시크릿오퍼란?
            <Info className="w-3 h-3" />
          </button>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {["퍼레이드", "전광판", "믹서 무한", "생일 이벤트 지원"].map((ext) => (
              <span
                key={ext}
                className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30"
              >
                {ext}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-foreground/80 italic leading-snug">
            &ldquo;홍대에서 1등이 되게 해드리겠습니다&rdquo;
          </p>
          {/* 강조 문구 (실제 쇼케이스 하드코딩 문구 재사용) */}
          <p className="text-[12.5px] font-black text-brand-amber leading-snug break-keep pt-1 border-t border-border mt-1">
            🎉 당일 예약보다 <span className="text-brand-amber">30만원치 더</span> 받았어요
          </p>
        </div>

        <div className="flex justify-center py-1">
          <ArrowDown className="w-5 h-5 text-brand-amber" />
        </div>

        {/* ③ 채팅 상담 — 마음에 드는 오퍼와 바로 대화 */}
        <p className="mb-1.5">
          <span className="text-[14px] text-foreground font-bold">3. 채팅 상담</span>
        </p>
        <div className="bg-card rounded-2xl border border-border p-3 space-y-1.5">
          <div className="flex justify-start">
            <span className="bg-neutral-300 text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tl-sm px-3 py-1.5 max-w-[82%]">
              예약 가능할까요?
            </span>
          </div>
          <div className="flex justify-end">
            <span className="bg-neutral-300 text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tr-sm px-3 py-1.5 max-w-[82%]">
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
          className="flex flex-col items-center justify-center w-full h-14 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black rounded-2xl shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all leading-tight mt-3.5"
        >
          <span className="font-black text-[15px]">예약 바로가기</span>
          <span className="text-[10px] font-bold text-black/55 mt-0.5">모든 서비스 무료</span>
        </Link>
      </SheetContent>
    </Sheet>

    {/* 시크릿오퍼란? 설명 시트 */}
    <Sheet open={secretInfoOpen} onOpenChange={setSecretInfoOpen}>
      <SheetContent
        side="bottom"
        className="h-auto bg-background border-border rounded-t-3xl px-5 pt-6 pb-8 gap-0"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-4">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight">
            💌 시크릿오퍼
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-2.5">
          {[
            "오퍼는 본인에게만 공개",
            "100% 기밀, 맞춤 패키지",
            "당일 워크인보다 좋은 혜택들 중에서 비교",
            "나에게 맞는 옵션을 골라보세요!",
          ].map((point) => (
            <div key={point} className="flex items-start gap-2 bg-card rounded-xl border border-border px-3.5 py-2.5">
              <span className="text-brand-amber font-black text-[13px] mt-0.5">→</span>
              <span className="text-[13.5px] text-foreground/90 font-medium break-keep">{point}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
