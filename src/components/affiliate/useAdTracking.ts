"use client";

// 제휴 광고 노출·클릭 계측. trackEvent → GA4 + Mixpanel + user_events 3곳.
// - ad_impression: 카드가 화면에 50% 이상, 1초 이상 보였을 때 페이지당 1번.
// - ad_click: 상품·숙소를 누를 때. position(몇 번째 칸)을 같이 남겨 칸 위치 효과를 뺄 수 있게.
// 회원 성별은 보내지 않는다 — user_events.user_id로 users.gender를 조인해서 본다.

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics/events";

export interface AdTrackParams {
  ad_id: string; // aff_coupang | aff_agoda
  placement: string; // club_detail | home | clubs_guide | artist | event_detail | events | lineups | booking | foreign_club ...
  area?: string;
  items?: string; // 노출된 상품/숙소 id 목록 "a,b,c"
  variant?: string; // rail | grid | band | strip
}

export function useAdImpression<T extends HTMLElement>(params: AdTrackParams | null) {
  const ref = useRef<T | null>(null);
  const sent = useRef(false);
  const key = params ? `${params.ad_id}|${params.placement}|${params.items ?? ""}` : "";
  // 타이머가 1초 뒤에 보내므로 그 사이 바뀐 값(마운트 후 정해지는 문구 각도 등)을 실어야 한다.
  // 첫 렌더 값을 잡아 두면 노출은 전부 기본 각도(taxi)로 찍혔다(2026-10-30 발견).
  const latest = useRef(params);
  latest.current = params;

  // 같은 자리라도 보여주는 조합이 바뀌면(탭 전환 등) 새 노출로 센다
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    sent.current = false;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el || !params || sent.current || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timer) {
            timer = setTimeout(() => {
              if (sent.current) return;
              sent.current = true;
              trackEvent("ad_impression", { ...(latest.current ?? params) });
              io.disconnect();
            }, 1000);
          }
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return ref;
}

export function trackAdClick(params: AdTrackParams & { item_id: string; position: number; target?: string }) {
  trackEvent("ad_click", { ...params });
}
