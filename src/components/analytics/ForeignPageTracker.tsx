"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackForeignEvent } from "@/lib/analytics/events";

/**
 * SEO로 유입되는 외국어 정적 페이지(클럽 개별 328p, 실용정보 16p)의 계측기.
 *
 * 이 페이지들은 SEO 때문에 서버 컴포넌트로 유지해야 해서 훅을 직접 못 쓴다.
 * 그래서 계측만 담당하는 클라이언트 컴포넌트를 얹고, 클릭은 링크마다 래퍼를
 * 씌우는 대신 `data-nf-track` 속성 + 위임 리스너 하나로 받는다.
 * (링크가 페이지당 10개 넘고 4개 언어로 복제돼서, 래퍼 방식이면 수정 지점이 40곳 넘음)
 *
 * 붙이는 이벤트:
 *   - {kind}_page_view         진입
 *   - {kind}_page_view (scroll) 25/50/75% 도달
 *   - {kind}_page_click        data-nf-track 링크 클릭 (target으로 구분)
 */
export function ForeignPageTracker({
  kind,
  lang,
  meta = {},
}: {
  kind: "club" | "guide";
  lang: string;
  meta?: Record<string, unknown>;
}) {
  const pathname = usePathname();
  const viewEvent = kind === "club" ? "foreign_club_page_view" : "foreign_guide_page_view";
  const scrollEvent = kind === "club" ? "foreign_club_page_scroll" : "foreign_guide_page_scroll";
  const clickEvent = kind === "club" ? "foreign_club_page_click" : "foreign_guide_page_click";
  const metaKey = JSON.stringify(meta);

  // 진입
  useEffect(() => {
    trackForeignEvent(viewEvent, { lang, source: "seo", path: pathname, ...JSON.parse(metaKey) });
  }, [viewEvent, lang, pathname, metaKey]);

  // 스크롤 도달 — 랜딩 후 어디까지 읽고 나가는지.
  //  · 키에 경로를 넣어야 한 세션에서 클럽을 여러 개 봐도 각각 잡힌다
  //    (ClubsClient의 세션 단위 키는 두 번째 페이지부터 스크롤이 안 잡힘)
  //  · user_events는 "이벤트 이름" 단위로 1초 dedupe를 건다. 그래서
  //    (a) 진입과 다른 이름을 써야 랜딩 직후 스크롤이 안 먹히고,
  //    (b) 스크롤이 멈춘 뒤 한 번만, 그때까지 새로 넘은 최대 깊이로 보낸다.
  //        (매 임계값마다 쏘면 빠르게 훑는 유저는 1초 창에 걸려 25%만 남고 75%가 사라짐)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefix = `nf_fp_scroll_${pathname}_`;
    const thresholds = [25, 50, 75];
    const QUIET_MS = 1200;   // dedupe 창(1초)보다 길게
    let ticking = false;
    let pendingDepth = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (!pendingDepth) return;
      const depth = pendingDepth;
      pendingDepth = 0;
      trackForeignEvent(scrollEvent, {
        lang, scroll_depth: depth, path: pathname, ...JSON.parse(metaKey),
      });
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) { ticking = false; return; }
        const ratio = window.scrollY / scrollable;
        for (const th of thresholds) {
          if (ratio < th / 100) continue;
          try {
            if (sessionStorage.getItem(prefix + th)) continue;
            sessionStorage.setItem(prefix + th, "1");
          } catch { /* 시크릿 모드 — 중복 허용하고 계속 */ }
          if (th > pendingDepth) pendingDepth = th;
        }
        if (pendingDepth) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, QUIET_MS);
        }
        ticking = false;
      });
    };

    // 스크롤 도중 이탈하면 타이머가 못 돈다 — 나가기 직전에 남은 걸 흘려보냄
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [scrollEvent, lang, pathname, metaKey]);

  // 클릭 위임 — data-nf-track 을 단 요소(혹은 그 조상)를 누르면 발동
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-nf-track]");
      if (!el) return;
      trackForeignEvent(clickEvent, {
        lang,
        path: pathname,
        target: el.getAttribute("data-nf-track") || "unknown",
        label: el.getAttribute("data-nf-label") || undefined,
        ...JSON.parse(metaKey),
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [clickEvent, lang, pathname, metaKey]);

  return null;
}
