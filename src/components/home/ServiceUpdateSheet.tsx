"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { trackEvent } from "@/lib/analytics/events";
import { isInAppBrowser } from "@/lib/utils/browser";

// 개편 공지 1회 노출 키. 문구/정책이 또 바뀌면 v2로 올려 재노출한다.
const SERVICE_UPDATE_KEY = "nightflow_service_update_v1";

/**
 * 서비스 개편 공지 바텀시트 (로그인 유저 1회).
 *
 * 배경: 깃발(역경매)·핫딜 UI를 걷어내고 게스트 간판(무료입장·프리드링크) 중심으로 전환.
 * 기존 유저가 "내 깃발 어디 갔지?"로 혼란스러워하지 않도록 종료 사실 + 새 방향을 함께 안내한다.
 *
 * - 로그인 유저에게만 (비로그인은 애초에 깃발을 쓴 적이 없어 공지 대상 아님)
 * - localStorage 미기록이면 1회 자동 오픈, 닫으면 영구 숨김
 * - 외국어 트랙은 스킵 — 깃발이 유지되는 트랙이라 이 공지가 사실과 다르다
 */
export function ServiceUpdateSheet({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (typeof window !== "undefined") {
      // 외국어 트랙(/en, /ja, /zh 또는 ?lang=)은 깃발이 그대로 살아있으므로 공지 제외
      const path = window.location.pathname;
      const langParam = new URLSearchParams(window.location.search).get("lang");
      const isForeignPath = path.startsWith("/en") || path.startsWith("/ja") || path.startsWith("/zh");
      const isForeignLang = !!langParam && langParam !== "ko";
      if (isForeignPath || isForeignLang) return;
    }
    // 인앱 브라우저는 InAppBrowserBanner와 겹쳐 메시지가 두 개 뜬다 → 스킵
    if (isInAppBrowser()) return;
    try {
      if (localStorage.getItem(SERVICE_UPDATE_KEY) === "1") return;
    } catch {
      return;
    }
    setOpen(true);
    trackEvent("service_update_popup_view");
  }, [show]);

  const markSeen = () => {
    try {
      localStorage.setItem(SERVICE_UPDATE_KEY, "1");
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
        className="h-auto bg-card border-border rounded-t-3xl px-6 pb-10"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-[20px] font-black text-foreground text-left tracking-tight">
            깃발 서비스가 종료됐어요
          </SheetTitle>
          <SheetDescription className="sr-only">
            깃발 서비스 종료 및 혜택·쿠폰 중심 개편 안내
          </SheetDescription>
        </SheetHeader>

        <p className="mt-1 text-[14px] text-muted-foreground font-medium leading-relaxed break-keep">
          <span className="text-foreground/90 font-semibold">
            프리패스, 무료입장, 프리드링크와 할인 쿠폰
          </span>{" "}
          중심으로 변경되며 일행을 모아 함께 가는 파티는 계속 이용하실 수 있어요.
        </p>

        <Link
          href="/clubs"
          onClick={() => {
            trackEvent("service_update_popup_cta");
            markSeen();
            setOpen(false);
          }}
          className="mt-5 flex items-center justify-center w-full h-12 bg-inverse text-inverse-foreground rounded-2xl font-black text-[15px] active:scale-[0.98] transition-transform"
        >
          오늘의 혜택 보러가기
        </Link>
      </SheetContent>
    </Sheet>
  );
}
