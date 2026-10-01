// 홈(/en) "Plan your Memory" 진입 줄 — 동네 이름을 몰라도 고를 수 있게 "어떤 밤"으로 보여 준다.
// 클라이언트 홈(EnHomeClient)에 끼우므로 서버 의존 없는 순수 컴포넌트.
// 제목은 박스 밖 — 홈의 다른 섹션("Koreans are doing it right now" 등)과 같은 머리 모양(사용자 지정 2026-10-01).
import Link from "next/link";
import { HOME_CARDS, PLAN_BASE, BOOK_HREF, img } from "@/lib/planMemory/content";

export function PlanMemoryHomeSection() {
  return (
    <section className="space-y-3 pb-8">
      <div className="px-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-black text-foreground">🌙 Plan your Memory</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">First night in Korea? Pick a night — clubs, views or tours.</p>
        </div>
        <Link href={PLAN_BASE} className="shrink-0 text-[12px] font-bold text-brand-amber">See all →</Link>
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
      <p className="px-4 text-[12px] text-muted-foreground">
        Already know where?{" "}
        <Link rel="nofollow" href={BOOK_HREF()} className="font-bold text-brand-amber">Book a club table →</Link>
      </p>
    </section>
  );
}
