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
  /** club=클럽 상세, guide=실용정보(dress-code 등), info=FAQ·vip-tables·kpop 등 나머지 SEO 페이지 */
  kind: "club" | "guide" | "info";
  lang: string;
  meta?: Record<string, unknown>;
}) {
  const pathname = usePathname();
  const viewEvent =
    kind === "club" ? "foreign_club_page_view"
    : kind === "guide" ? "foreign_guide_page_view"
    : "foreign_info_page_view";
  const scrollEvent =
    kind === "club" ? "foreign_club_page_scroll"
    : kind === "guide" ? "foreign_guide_page_scroll"
    : "foreign_info_page_scroll";
  const clickEvent =
    kind === "club" ? "foreign_club_page_click"
    : kind === "guide" ? "foreign_guide_page_click"
    : "foreign_info_page_click";
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

  // 이탈 지점 — "어디까지 보고 나갔나"를 한 건으로 남긴다.
  // 기존 이벤트는 전부 진입·클릭·스크롤 도달 같은 긍정 행동뿐이라, 이탈은
  // "세션의 마지막 이벤트가 무엇이었나"로 역산할 수밖에 없었다(부정확).
  //
  // visibilitychange(hidden)로 잡는 이유: 모바일에서 탭 전환·홈으로 나가기는
  // beforeunload가 안 뜨는 경우가 많다. pagehide를 함께 걸어 데스크톱 새로고침·
  // 창 닫기도 커버한다. 세션당 1회만 — 탭을 여러 번 오가도 중복으로 안 쌓이게.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const enteredAt = Date.now();
    const sentKey = `nf_fp_exit_${pathname}`;
    let sent = false;

    const send = () => {
      if (sent) return;
      try {
        if (sessionStorage.getItem(sentKey)) { sent = true; return; }
        sessionStorage.setItem(sentKey, "1");
      } catch { /* 시크릿 모드 — 중복 허용하고 계속 */ }
      sent = true;

      // 이 시점까지의 스크롤 깊이(%). 스크롤이 아예 불가능한 짧은 페이지는 100으로 본다
      // (다 보인 상태라 "0%만 읽고 나감"으로 기록되면 오해를 부른다).
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const depth = scrollable <= 0
        ? 100
        : Math.min(100, Math.round((window.scrollY / scrollable) * 100));

      trackForeignEvent("foreign_page_exit", {
        lang,
        path: pathname,
        page_kind: kind,
        scroll_depth: depth,
        time_on_page_sec: Math.round((Date.now() - enteredAt) / 1000),
        ...JSON.parse(metaKey),
      });
    };

    const onHide = () => { if (document.visibilityState === "hidden") send(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      // 라우팅으로 이 페이지를 벗어나는 경우(SPA 전환)도 이탈로 잡는다
      send();
    };
  }, [kind, lang, pathname, metaKey]);

  return null;
}
