"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackEvent } from "@/lib/analytics/events";

/**
 * 누르면 이벤트를 남기는 Link — 서버 컴포넌트(예: 홈 LineupTicker) 안의 링크는
 * onClick을 달 수 없어서, 클릭 계측이 필요한 자리만 이걸로 바꾼다.
 * 이벤트 이름·속성은 직렬화 가능한 값만 받는다(서버→클라이언트 props).
 */
export function TrackedLink({
  event,
  eventProps = {},
  onClick,
  ...props
}: ComponentProps<typeof Link> & { event: string; eventProps?: Record<string, unknown> }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        trackEvent(event, eventProps);
        onClick?.(e);
      }}
    />
  );
}
