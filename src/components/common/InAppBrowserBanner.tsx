"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isInAppBrowser, isIOS, isAndroid, getBrowserKind } from "@/lib/utils/browser";
import { trackEvent } from "@/lib/analytics/events";

// 인스타/페북/라인 인앱 브라우저 넛지 팝업 — 홈·클럽·깃발 등 모든 (main) 랜딩에 노출.
// 배경: 광고(paid) 유입의 99.7%가 인스타 인앱 웹뷰인데, 임베디드 웹뷰는 구글/카카오 OAuth가
//       구조적으로 막혀(disallowed_useragent) 가입이 안 됨. 기존 안내는 /login 에만 있어
//       홈에서 죽는 광고 유입자(상세열람 0.9%)는 그 안내를 아예 못 봤음 → 착지 즉시 노출.
// 안드로이드: intent:// 로 크롬 자동 열기. iOS: Apple 정책상 자동 이동 불가 → 수동 안내.
const DISMISS_KEY = "nf_inapp_banner_dismissed";

export function InAppBrowserBanner() {
  const [open, setOpen] = useState(false);
  const [android, setAndroid] = useState(false);
  const [lang, setLang] = useState<"ko" | "en">("ko");

  useEffect(() => {
    // 미리보기용 강제 노출 — ?inapp=android / ?inapp=ios (로컬·데스크톱에서도 확인 가능).
    // 실제 유저는 이 파라미터를 안 붙이므로 프로덕션 영향 없음. forced일 땐 dismiss 무시.
    const forced = new URLSearchParams(window.location.search).get("inapp");
    const forceIos = forced === "ios";
    const forceAndroid = forced === "android";
    if (!forced && !isInAppBrowser()) return;
    if (!forced && typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") return;
    const l = new URLSearchParams(window.location.search).get("lang");
    setLang(l && l !== "ko" ? "en" : "ko");
    const isIos = forced ? forceIos : isIOS();
    setAndroid(forced ? forceAndroid : (isAndroid() && !isIos));
    setOpen(true);
    trackEvent("in_app_banner_shown", { browser: getBrowserKind(), platform: isIos ? "ios" : "android" });

    // iOS는 자동 이동이 불가 → 유저가 수동으로 "Safari에서 열기"를 누름. 그때 열리는 URL은
    // "현재 URL"이므로, 미리 현재 URL에 nf_anon(현재 anon_id)을 심어두면 사파리가 그걸 실어가
    // 인앱→사파리 세션이 같은 anon으로 스티칭된다(광고 전환 추적 가능). utm은 광고 링크에 이미 있음.
    if (isIos) {
      try {
        const anon = localStorage.getItem("nf_anon_id");
        const url = new URL(window.location.href);
        if (anon && !url.searchParams.get("nf_anon")) {
          url.searchParams.set("nf_anon", anon);
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
      } catch {}
    }
  }, []);

  const t = (ko: string, en: string) => (lang === "en" ? en : ko);

  const dismiss = () => {
    trackEvent("in_app_banner_dismiss", { platform: android ? "android" : "ios" });
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  // 현재 anon_id를 URL에 실어 외부 브라우저로 스티칭 (광고 → 크롬 착지 → 가입을 한 anon으로 추적).
  const stitchedPath = () => {
    const params = new URLSearchParams(window.location.search);
    try {
      const anon = localStorage.getItem("nf_anon_id");
      if (anon && !params.get("nf_anon")) params.set("nf_anon", anon);
    } catch {}
    const qs = params.toString();
    return window.location.pathname + (qs ? `?${qs}` : "");
  };

  const openChrome = () => {
    trackEvent("in_app_banner_open_click", { platform: "android" });
    window.location.href = `intent://nightflow.kr${stitchedPath()}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        className="h-auto bg-background border-border rounded-t-3xl px-5 pt-7 pb-8 gap-0 text-center"
      >
        <SheetHeader className="p-0 gap-0 items-center">
          <div className="text-[44px] leading-none mb-3">🌐</div>
          <SheetTitle className="text-foreground text-[20px] font-black tracking-tight leading-snug break-keep">
            <span className="block">
              {android
                ? t("크롬에서 더 편하게", "For a smoother experience,")
                : t("사파리에서 더 편하게", "For a smoother experience,")}
            </span>
            <span className="block">
              {android
                ? t("이용하세요", "open in Chrome")
                : t("이용하세요", "open in Safari")}
            </span>
          </SheetTitle>
        </SheetHeader>

        {android ? (
          <button
            onClick={openChrome}
            className="w-full h-14 mt-5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[16px] rounded-2xl shadow-[0_2px_12px_rgba(245,158,11,0.35)] transition-all"
          >
            {t("크롬으로 열기", "Open in Chrome")} →
          </button>
        ) : (
          <div className="w-full mt-5 space-y-2.5 text-left">
            <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black font-black text-[14px] shrink-0">1</span>
              <span className="text-[14px] font-bold text-foreground flex items-center gap-1.5">
                {t("우측 상단", "Tap top-right")}
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted border border-border font-black text-foreground">⋯</span>
              </span>
            </div>
            <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black font-black text-[14px] shrink-0">2</span>
              <span className="text-[14px] font-bold text-foreground">
                {t('"Safari에서 열기" 선택', 'Select "Open in Safari"')}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={dismiss}
          className="mt-3 text-[13px] text-muted-foreground font-semibold hover:text-foreground transition-colors"
        >
          {t("그냥 둘러볼게요", "Just browsing")}
        </button>
      </SheetContent>
    </Sheet>
  );
}
