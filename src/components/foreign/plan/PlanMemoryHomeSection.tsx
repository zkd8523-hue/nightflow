// 홈(/en) "Plan your Memory" 진입 줄 — 동네 이름을 몰라도 고를 수 있게 "어떤 밤"으로 보여 준다.
// 클라이언트 홈(EnHomeClient)에 끼우므로 서버 의존 없는 순수 컴포넌트.
import Link from "next/link";
import { HOME_CARDS, PLAN_BASE, BOOK_HREF, img } from "@/lib/planMemory/content";

export function PlanMemoryHomeSection() {
  return (
    <section className="px-4 pb-8">
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-black">Plan your Memory</h2>
          <Link href={PLAN_BASE} className="text-[13px] font-bold text-brand-amber">See all →</Link>
        </div>
        <p className="mt-1 mb-3 text-[13.5px] text-muted-foreground">First night in Korea? Pick a night — clubs, views or tours.</p>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {HOME_CARDS.map((c) => (
            <Link key={c.href} href={c.href} className="w-[140px] shrink-0 overflow-hidden rounded-xl bg-background border border-border">
              <div className="h-[92px] bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${img(c.image, 400)})` }} />
              <div className="px-2.5 py-2">
                <p className="text-[12.5px] font-bold leading-tight">{c.title}</p>
                <p className="text-[11px] text-muted-foreground">{c.sub}</p>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          Already know where?{" "}
          <Link rel="nofollow" href={BOOK_HREF()} className="font-bold text-brand-amber">Book a club table →</Link>
        </p>
      </div>
    </section>
  );
}
