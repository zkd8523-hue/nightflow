"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics/events";

// 라인업·공연 쪽 페이지 조회 계측 (2026-09-27).
//
// 왜: 인스타 라인업 자동 수집(Apify, collect-club-events)을 계속 돌릴지 판단해야 하는데
// 이 페이지들에는 추적 이벤트가 하나도 없었다. user_events 세션은 "첫 추적 이벤트" 시점에
// 만들어지므로(userEvents.ts getOrRotateSession), 라인업만 보고 나간 방문은 로그에 한 줄도
// 안 남았다 — 30일 세션 14,498개 중 라인업 착지가 12개로 잡힌 건 실측이 아니라 사각지대다.
// 이 컴포넌트가 진입 즉시 이벤트를 쏘면서 세션·유입원·landing_path도 이 페이지 기준으로 잡힌다.
//
// 서버 컴포넌트 페이지(SEO)라 훅을 직접 못 써서 계측만 하는 클라이언트 조각을 얹는다
// (ForeignPageTracker와 같은 방식, 한국어 트랙용 최소판).

export type LineupPageKind =
  | "lineups_home"      // /lineups
  | "lineups_area"      // /lineups/[area]
  | "events_home"       // /events
  | "events_area"       // /events/area/[area]
  | "events_date"       // /events/[date]
  | "event_detail"      // /events/[date]/[slug]
  | "club_lineup_hub"   // /clubs/[id]/lineup
  | "club_lineup_date"  // /clubs/[id]/lineup/[date]
  | "dj_profile"        // /dj/[slug]
  | "artist_profile";   // /artists/[slug]

export function LineupPageTracker({
  kind,
  meta = {},
}: {
  kind: LineupPageKind;
  /** 페이지별 식별자(area·club_id·slug 등)와 "볼 게 있었나"(upcoming 개수). */
  meta?: Record<string, unknown>;
}) {
  const pathname = usePathname();
  const metaKey = JSON.stringify(meta);

  useEffect(() => {
    trackEvent("lineup_page_view", { page_kind: kind, ...JSON.parse(metaKey) });
  }, [kind, pathname, metaKey]);

  return null;
}
