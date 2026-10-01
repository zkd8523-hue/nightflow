"use client";
// 상단 두 갈래 탭 "Clubs | Activities"(2026-10-01, 사용자 선택 B안) — 클럽 말고도 할 게 있다는 걸
// 첫 화면에서 보이게. 홈(Clubs)과 Night Activities 페이지 양쪽 맨 위에 같은 모양으로 둔다.
// 모바일 = 헤더 아래 반반 탭 줄, 데스크톱 = 헤더 줄 왼쪽의 알약 두 개(반반 탭이 1400px 넘게 늘어나 어색했다 — 사용자 지적).
import Link from "next/link";
import { trackForeignEvent } from "@/lib/analytics/events";
import { PLAN_BASE } from "@/lib/planMemory/content";

type Active = "clubs" | "activities";

const track = (active: Active) => () =>
  active === "clubs" && trackForeignEvent("foreign_sidebar_cta_click", { lang: "en", kind: "top_tab_activities" });

/** 모바일 전용 줄(lg:hidden). */
export function SiteTabs({ active }: { active: Active }) {
  const cls = (on: boolean, accent = false) =>
    `flex-1 text-center py-2.5 text-[14.5px] font-extrabold transition-colors ${
      on ? "text-foreground border-b-2 border-foreground" : accent ? "text-brand-amber" : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <nav className="lg:hidden shrink-0 flex border-b border-border px-4">
      <Link href="/en" className={cls(active === "clubs")}>🍾 Clubs</Link>
      <Link href={PLAN_BASE} onClick={track(active)} className={cls(active === "activities", true)}>
        🌙 Activities
        {active === "clubs" && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-amber align-top" />}
      </Link>
    </nav>
  );
}

/** 데스크톱 전용(hidden lg:flex) — 헤더 줄 왼쪽에 넣는다. */
export function SiteTabsInline({ active }: { active: Active }) {
  const cls = (on: boolean, accent = false) =>
    `rounded-full px-4 py-2 text-[14px] font-extrabold transition-colors ${
      on ? "bg-card border border-border text-foreground" : accent ? "text-brand-amber hover:bg-card" : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <nav className="hidden lg:flex items-center gap-1">
      <Link href="/en" className={cls(active === "clubs")}>🍾 Clubs</Link>
      <Link href={PLAN_BASE} onClick={track(active)} className={cls(active === "activities", true)}>🌙 Activities</Link>
    </nav>
  );
}

/** Night Activities 페이지 맨 위 — 모바일: 로고 줄 + 반반 탭, 데스크톱: 홈 헤더와 같은 줄에 알약 탭. */
export function ActivitiesTopBar() {
  return (
    <div className="sticky top-0 z-30 bg-background">
      <div className="lg:hidden px-4 pt-3 pb-2">
        <Link href="/en" className="inline-block">
          <span className="block text-[17px] font-black tracking-tight">NightFlow</span>
          <span className="block text-[11px] text-muted-foreground leading-none mt-0.5">Korea Club Guide</span>
        </Link>
      </div>
      <SiteTabs active="activities" />
      <div className="hidden lg:block border-b border-border px-8 py-3">
        <div className="max-w-[1100px] mx-auto"><SiteTabsInline active="activities" /></div>
      </div>
    </div>
  );
}
