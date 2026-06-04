"use client";

import { useEffect } from "react";

const ADSENSE_SRC =
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6936468170635504";

// AdSense 스크립트를 "첫 사용자 상호작용 이후"에만 로드한다.
// next/script lazyOnload 보다 더 공격적 — 광고 단위(<ins>)가 아직 없는 현재 구성에서
// LCP/메인스레드를 광고 JS(약 169KB + long task)로부터 완전히 보호한다.
// ads.txt + 스크립트 태그는 상호작용 후 주입되므로 AdSense 계정/심사 요건은 유지.
export function DeferredAdSense() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 이미 주입됐으면 스킵 (라우팅 재마운트 대비)
    if (document.getElementById("adsense-deferred")) return;

    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const s = document.createElement("script");
      s.id = "adsense-deferred";
      s.src = ADSENSE_SRC;
      s.async = true;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
      cleanup();
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, load));
      window.clearTimeout(fallback);
    };
    events.forEach((e) =>
      window.addEventListener(e, load, { once: true, passive: true })
    );

    // 상호작용이 전혀 없어도 일정 시간 뒤엔 로드 (광고 노출 기회 보장).
    // 현재 광고 단위(<ins>)가 없어 조기 로드 이득이 없으므로 넉넉히 지연 — 첫 화면 CLS/LCP 보호 우선.
    const fallback = window.setTimeout(load, 15000);

    return cleanup;
  }, []);

  return null;
}
