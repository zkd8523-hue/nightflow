"use client";

import { useEffect, useState, type ReactNode } from "react";

// 하단 고정 CTA를 본문 CTA(watchId)가 화면 위로 지나간 뒤에만 띄운다.
// 첫 화면에 예약 버튼이 두 개 동시에 보이지 않게(2026-10-24 운영자 지적 — 같은 버튼 반복).
// 숨은 동안엔 inert — 키보드 포커스가 안 보이는 버튼으로 가지 않게.
export function StickyReveal({ watchId, children }: { watchId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [watchId]);
  return (
    <div aria-hidden={!show} inert={!show} className={`transition-transform duration-200 ${show ? "translate-y-0" : "translate-y-full pointer-events-none"} fixed bottom-0 inset-x-0 z-40`}>
      {children}
    </div>
  );
}
