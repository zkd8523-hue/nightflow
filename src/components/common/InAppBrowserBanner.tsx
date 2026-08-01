"use client";

import { useEffect, useState } from "react";
import { isInAppBrowser, isIOS, isAndroid, getBrowserKind } from "@/lib/utils/browser";
import { trackEvent } from "@/lib/analytics/events";

// 인스타/페북/라인 인앱 브라우저 넛지 — 홈·클럽·깃발 등 모든 (main) 랜딩에 노출.
// 배경: 광고(paid) 유입의 99.7%가 인스타 인앱 웹뷰인데, 임베디드 웹뷰는 구글/카카오 OAuth가
//       구조적으로 막혀(disallowed_useragent) 가입이 안 됨. 기존 안내는 /login 에만 있어
//       홈에서 죽는 광고 유입자(상세열람 0.9%)는 그 안내를 아예 못 봤음 → 착지 즉시 노출.
// 안드로이드: intent:// 로 크롬 자동 열기. iOS: Apple 정책상 자동 이동 불가 → 수동 안내.
const DISMISS_KEY = "nf_inapp_banner_dismissed";

export function InAppBrowserBanner() {
  const [show, setShow] = useState(false);
  const [android, setAndroid] = useState(false);
  const [lang, setLang] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (!isInAppBrowser()) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") return;
    const l = new URLSearchParams(window.location.search).get("lang");
    setLang(l && l !== "ko" ? "en" : "ko");
    const isIos = isIOS();
    setAndroid(isAndroid() && !isIos);
    setShow(true);
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

  if (!show) return null;

  const t = (ko: string, en: string) => (lang === "en" ? en : ko);

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

  const dismiss = () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-black px-4 py-3">
      <div className="max-w-lg mx-auto flex items-start gap-3">
        <span className="text-[18px] leading-none mt-0.5">🌐</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black leading-snug">
            {t(
              "인스타 브라우저에선 로그인·예약이 안 돼요",
              "Login & booking don't work in the Instagram browser",
            )}
          </p>
          {android ? (
            <button
              onClick={openChrome}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white text-[13px] font-bold active:scale-[0.98] transition-transform"
            >
              {t("크롬으로 열기", "Open in Chrome")} →
            </button>
          ) : (
            <p className="text-[12px] font-semibold leading-relaxed mt-1 text-black/80">
              {t(
                "우측 상단 ⋯ → \"Safari에서 열기\"를 눌러주세요",
                'Tap ⋯ (top-right) → "Open in Safari"',
              )}
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t("닫기", "Close")}
          className="shrink-0 text-black/60 hover:text-black text-[18px] leading-none px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
