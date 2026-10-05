"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/events";

// 클러빙 뉴스 호별 조회 계측 (2026-10-05).
//
// 왜: 뉴스레터를 계속 쓸지는 "호마다 읽히는가"로 판단하는데, 호 페이지에는 공유·영상 클릭
// 이벤트만 있고 진입 이벤트가 없었다. 구독 전환율(구독자 ÷ 조회)을 호별로 보려면
// 분모가 필요하다 — 관리자 뉴스레터 화면이 이 이벤트를 slug 별로 집계한다.
//
// 호 페이지는 force-static 서버 컴포넌트라 훅을 직접 못 써서 계측만 하는 조각을 얹는다
// (LineupPageTracker와 같은 방식).
export function WeeklyIssueTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent("weekly_issue_view", { slug });
  }, [slug]);

  return null;
}
