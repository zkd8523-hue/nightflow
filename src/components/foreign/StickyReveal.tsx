"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

// 하단 고정 CTA를 본문 CTA(watchId)가 화면 위로 지나간 뒤에만 띄운다.
// 첫 화면에 예약 버튼이 두 개 동시에 보이지 않게(2026-10-24 운영자 지적 — 같은 버튼 반복).
// 아래쪽 본문 예약 버튼이 화면에 들어오면 다시 숨긴다.
// 숨은 동안엔 inert — 키보드 포커스가 안 보이는 버튼으로 가지 않게.
export function StickyReveal({ watchId, children }: { watchId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el) return;
    // 본문 예약 버튼이 하나라도 화면에 보이면 숨긴다 — 맨 아래 CTA 섹션과 겹쳐 같은 버튼이 두 개 보였다.
    const inline = [...document.querySelectorAll<HTMLElement>('[data-nf-track="book_cta"], [data-nf-track="book_cta_inline"], [data-nf-track="info_club_book"]')];
    const visible = new Set<Element>();
    let passed = false;
    const update = () => setShow(passed && visible.size === 0);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === el) passed = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
      }
      update();
    });
    for (const t of new Set([el, ...inline])) io.observe(t);
    return () => io.disconnect();
  }, [watchId]);
  return (
    <div aria-hidden={!show} inert={!show} className={`transition-transform duration-200 ${show ? "translate-y-0" : "translate-y-full pointer-events-none"} fixed bottom-0 inset-x-0 z-40`}>
      {children}
    </div>
  );
}

/** 하단 고정 예약 바 — 본문 버튼(id="book-cta")이 지나간 뒤에만 뜬다. 이모지 없음(하이엔드 점검 2026-10-24). */
export function StickyBookBar({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <StickyReveal watchId="book-cta">
      <div className={`border-t border-border bg-background/95 backdrop-blur px-4 pt-3 pb-3 pb-safe ${className}`}>
        <div className="max-w-2xl mx-auto">
          <Link rel="nofollow" href={href} data-nf-track="book_cta_sticky"
            className="block w-full text-center py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400">
            {label}
          </Link>
        </div>
      </div>
    </StickyReveal>
  );
}
