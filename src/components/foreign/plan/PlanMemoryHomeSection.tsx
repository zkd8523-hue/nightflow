// 홈(/en) "Night Activities" 진입 줄 — 동네 이름을 몰라도 고를 수 있게 "어떤 밤"으로 보여 준다.
// 클라이언트 홈(EnHomeClient)에 끼우므로 서버 의존 없는 순수 컴포넌트.
// 제목은 박스 밖, "Clubs in Seoul"과 같은 위계(22px black + See all — 사용자 지정 2026-10-01).
import Link from "next/link";
import { HOME_CARDS, PLAN_BASE, img } from "@/lib/planMemory/content";

export function PlanMemoryHomeSection() {
  return (
    <section className="space-y-3 pb-8">
      <div className="px-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={PLAN_BASE} className="text-[22px] font-black text-foreground tracking-tight hover:opacity-80">🌙 Night Activities</Link>
          <Link href={PLAN_BASE} className="shrink-0 text-[12px] font-bold text-brand-amber whitespace-nowrap">See all →</Link>
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5">more than clubs! Night views, tours &amp; routes.</p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
        {HOME_CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="w-[150px] shrink-0 overflow-hidden rounded-xl bg-card border border-border hover:border-foreground/30 transition-colors">
            <div className="h-[96px] bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${img(c.image, 400)})` }} />
            <div className="px-2.5 py-2">
              <p className="text-[12.5px] font-bold leading-tight">{c.title}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
