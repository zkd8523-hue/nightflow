"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 요일 바로가기.
 *
 * 한 호에 아홉 곳이 들어가면서 "일요일만 볼 사람"이 금·토를 전부 스크롤해야
 * 하는 문제가 생겼다. 위에 요일을 붙여 두고 눌러서 내려가게 한다.
 *
 * 붙박이(sticky)로 두는 이유: 중간까지 읽다가 다른 요일로 건너뛰고 싶어지는
 * 쪽이 더 잦다. 맨 위로 올라갔다 다시 내려오게 하면 바로가기를 둔 의미가 없다.
 *
 * 생김새는 섹션 머리(DayHead)와 같은 문법으로 간다 — 글자 + 그 요일 색의
 * 굵은 선. 채운 알약 버튼을 쓰면 기사 안에서 혼자 앱 UI처럼 튀고, 세 칸 중
 * 하나만 흰 덩어리가 되어 좌우 균형도 깨진다.
 */
export type WeeklyDay = { id: string; label: string; sub?: string; color?: string };

/** Header.tsx 의 h-[52px]. 이 바는 그 아래에 붙는다 */
const HEADER_H = 52;
/** 이 바 자체 높이 — 섹션이 이 둘에 가리지 않게 scroll-margin 을 계산한다 */
const NAV_H = 42;

/** 섹션에 걸어 줄 값. 헤더 + 이 바에 제목이 가리지 않게 띄운다 */
export const WEEKLY_SCROLL_MARGIN = `calc(${HEADER_H + NAV_H + 12}px + env(safe-area-inset-top))`;

export function WeeklyDayNav({ days }: { days: WeeklyDay[] }) {
  const [active, setActive] = useState<string | null>(null);
  // 눌러서 이동하는 동안은 관찰자가 중간 섹션들을 스쳐 지나가며 깜빡인다.
  // 그 사이엔 눌린 요일을 고정해 둔다.
  const lockRef = useRef<number | null>(null);

  useEffect(() => {
    const els = days
      .map((d) => document.getElementById(d.id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        // 위쪽 경계를 막 지난 섹션 중 가장 위에 있는 것을 현재로 본다
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      // 위는 바 높이만큼 깎고, 아래는 크게 깎아 "화면 상단 밴드"만 판정 영역으로 둔다
      { rootMargin: `-${HEADER_H + NAV_H + 8}px 0px -68% 0px`, threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [days]);

  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    if (lockRef.current) window.clearTimeout(lockRef.current);
    lockRef.current = window.setTimeout(() => { lockRef.current = null; }, 800);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  useEffect(() => () => { if (lockRef.current) window.clearTimeout(lockRef.current); }, []);

  return (
    <nav
      aria-label="요일 바로가기"
      /* 화면 폭 끝까지 빼서(-mx-4) 본문 위에 얹힌 띠로 읽히게 한다. 안쪽에서
         다시 px-4 로 글을 본문 선에 맞춘다. 반투명 + blur 는 스크롤할 때
         아래 글이 비쳐 지나가며 "떠 있는 층"이라는 걸 알려 준다.

         ⚠️ 이 nav 는 반드시 <article> 의 직계 자식이어야 한다. div 로 한 번
         감싸면 sticky 가 그 div 높이(= 바 하나) 안에서만 유효해서, div 가
         화면을 지나가는 순간 같이 밀려 올라간다. */
      className="sticky z-40 mt-7 -mx-4 bg-background/92 backdrop-blur-sm border-y border-border"
      style={{ top: `calc(${HEADER_H}px + env(safe-area-inset-top))` }}
    >
      <ul className="flex items-stretch list-none m-0 p-0 px-4" style={{ height: NAV_H }}>
        {days.map((d) => {
          const on = active === d.id;
          const color = d.color ?? "var(--foreground)";
          return (
            <li key={d.id} className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => go(d.id)}
                aria-current={on ? "true" : undefined}
                /* 밑줄은 버튼 안에 따로 그린다 — border-b 로 주면 눌림 상태에서
                   글자가 1px 흔들린다. focus-visible 로 한정해 마우스 클릭 뒤
                   링이 남지 않게 한다(세 칸 중 하나만 테두리가 생겨 보였다). */
                className="relative w-full h-full inline-flex items-baseline justify-center gap-1.5
                           pt-[13px] text-[13.5px] font-black tracking-tight transition-colors
                           focus:outline-none focus-visible:bg-muted rounded-[6px]"
                style={{ color: on ? color : "var(--muted-foreground)" }}
              >
                {d.label}
                {d.sub && (
                  <span className="font-mono text-[10.5px] font-semibold opacity-70">{d.sub}</span>
                )}
                <span
                  aria-hidden="true"
                  className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-full transition-opacity"
                  style={{ background: color, opacity: on ? 1 : 0 }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
