"use client";

import { useEffect } from "react";

// 손님 확정서 열람 기록용 비콘 — /api/booking-viewed 참고.
// 링크 미리보기 크롤러는 JS를 실행하지 않으므로 실제 브라우저에서 연 경우만 찍힌다.
export function BookingViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    fetch("/api/booking-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {});
  }, [token]);
  return null;
}
