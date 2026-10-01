import Link from "next/link";
import { ForeignShell } from "@/components/foreign/ForeignShell";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { ROUTES, TOURS, PLAN_BASE, BOOK_HREF, img } from "@/lib/planMemory/content";
import { PlanJsonLd } from "./PlanJsonLd";
import { TourRegionFilter } from "./TourRegionFilter";
import { BookCta, HowBooking, Trust, TourCards, ViatorNote, Tabs, Crumb } from "./PlanMemoryParts";

// 허브 = 투어가 기본(2026-10-01 사용자 결정: 밤 코스는 결국 클럽 예약 — 이 섹션의 주인공은 투어).
export function PlanMemoryHub() {
  const tours = Object.values(TOURS);
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory" }} />
      <PlanJsonLd path={PLAN_BASE} headline="Korea Night Tours 2026 — Seoul, Busan & More Things to Do" description="Night views, river cruises and evening tours across Korea — Seoul, Busan and more. Plus night routes with clubs you can book in English." image={img(TOURS.hanCruise.image, 1200)} crumbs={[{ name: "NightFlow", path: "/en" }, { name: "Night Activities", path: PLAN_BASE }]} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href="/en" label="NightFlow" />
        <header className="space-y-2">
          <h1 className="text-[30px] font-black leading-[1.1] tracking-tight">Night Activities in Korea</h1>
          <p className="text-[14.5px] text-muted-foreground">Night views, cruises and evening tours across Korea — with or without a club after.</p>
        </header>
        <Tabs active="tours" />
        <TourRegionFilter tours={tours} />
        <ViatorNote />
        <Link data-nf-track="route:night-routes" href={`${PLAN_BASE}/night-routes`} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3 hover:border-foreground/30">
          <div className="h-[64px] w-[64px] shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${img(ROUTES[0].hero, 300)})` }} />
          <div className="min-w-0">
            <p className="font-bold text-[15px] leading-tight">Want a night out too?</p>
            <p className="text-[12.5px] text-muted-foreground">Night routes in Hongdae, Itaewon and Busan — ending at a club you can book.</p>
          </div>
          <span className="ml-auto font-black text-muted-foreground">›</span>
        </Link>
      </div>
    </ForeignShell>
  );
}

const ROUTE_ORDER = ["hongdae-night", "itaewon-night", "busan-night", "haeundae-evening"];

export function PlanMemoryNightRoutes() {
  const routes = ROUTE_ORDER.map((s) => ROUTES.find((r) => r.slug === s)!).filter(Boolean);
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory/night-routes" }} />
      <PlanJsonLd path={`${PLAN_BASE}/night-routes`} headline="Korea Night Routes 2026 — Hongdae, Itaewon, Busan Nightlife" description="Pick a night in Seoul or Busan — Hongdae, Itaewon, Busan drone show or Haeundae — and book a club table in English." image={img(ROUTES[0].hero, 1200)} crumbs={[{ name: "NightFlow", path: "/en" }, { name: "Night Activities", path: PLAN_BASE }, { name: "Night routes", path: `${PLAN_BASE}/night-routes` }]} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href={PLAN_BASE} label="Night Activities" />
        <header className="space-y-2">
          <h1 className="text-[28px] font-black leading-[1.12] tracking-tight">Night routes in Seoul &amp; Busan</h1>
          <p className="text-[14.5px] text-muted-foreground">Pick a night. Every club route ends at a club you can book in English.</p>
        </header>
        <Tabs active="routes" />
        <h2 className="text-[20px] font-black pt-1">What kind of night do you want?</h2>
        <div className="space-y-2.5">
          {routes.map((r) => (
            <Link key={r.slug} data-nf-track={`route:${r.slug}`} href={`${PLAN_BASE}/${r.slug}`} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3 hover:border-foreground/30">
              <div className="h-[76px] w-[76px] shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${img(r.hero, 300)})` }} />
              <div className="min-w-0">
                <p className="font-bold text-[15px] leading-tight">{r.card.title}</p>
                <p className="text-[12.5px] text-muted-foreground">{r.card.line}</p>
                <p className="text-[11px] font-bold text-emerald-300 mt-1">{r.card.meta}</p>
              </div>
              <span className="ml-auto font-black text-muted-foreground">›</span>
            </Link>
          ))}
        </div>
        <div className="space-y-3 pt-2">
          <BookCta href={BOOK_HREF()} label="Just book a club table" />
          <HowBooking />
          <Trust />
        </div>
      </div>
    </ForeignShell>
  );
}

export function PlanMemoryGettingAround() {
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory/getting-around" }} />
      <PlanJsonLd path={`${PLAN_BASE}/getting-around`} headline="Getting Home Safely at Night in Korea — Last Train, Taxi, 1330 Helpline" description="Last trains, taxi apps, cash, age rules and help numbers (1330, 112, 119) for a night out in Seoul or Busan." image={img(TOURS.seoulSmallGroup.image, 1200)} crumbs={[{ name: "NightFlow", path: "/en" }, { name: "Night Activities", path: PLAN_BASE }, { name: "Getting around", path: `${PLAN_BASE}/getting-around` }]} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href={PLAN_BASE} label="Night Activities" />
        <header className="space-y-2">
          <h1 className="text-[28px] font-black leading-[1.12] tracking-tight">Getting home safely at night</h1>
          <p className="text-[14.5px] text-muted-foreground">Sort your ride before the night starts.</p>
        </header>
        <Tabs active="getting" />
        <div className="grid grid-cols-3 gap-2">
          {[["1330", "Korea Travel Helpline · interpreter · tourist police"], ["112", "Police"], ["119", "Emergency"]].map(([n, d]) => (
            <div key={n} className="rounded-xl bg-card border border-border p-3 text-center">
              <b className="block text-[20px]">{n}</b>
              <span className="text-[11.5px] text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
        <ul className="list-disc pl-5 space-y-2 text-[14px]">
          <li><b>Last trains run until around midnight.</b> Times differ by line, station and day — check the subway app on the day.</li>
          <li><b>Set up a taxi app before you go out.</b> Travel guides say Kakao T works with foreign cards. Taxis cost more from 22:00 to 04:00 (VisitKorea).</li>
          <li><b>Carry a little cash.</b> Not every taxi or venue takes every card.</li>
          <li><b>Bring your passport.</b> Age rule (Korean law, 2026): born in 2007 or earlier. Clubs check at the door. <Link href="/en/club-entry-rules" className="font-bold text-brand-amber">Full age &amp; ID rules →</Link></li>
        </ul>
        <h2 className="text-[20px] font-black pt-2">Pick your night</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["Hongdae", "Clubs · Seoul", `${PLAN_BASE}/hongdae-night`],
            ["Itaewon", "Clubs · Seoul", `${PLAN_BASE}/itaewon-night`],
            ["Seomyeon", "Clubs · Busan", `${PLAN_BASE}/busan-night`],
            ["Haeundae", "Beach evening", `${PLAN_BASE}/haeundae-evening`],
            ["Night tours", "No club", PLAN_BASE],
          ].map(([t, s, h]) => (
            <Link key={t} href={h} className="rounded-xl bg-card border border-border p-3 text-center hover:border-foreground/30">
              <b className="block text-[13.5px]">{t}</b>
              <span className="text-[11px] text-muted-foreground">{s}</span>
            </Link>
          ))}
        </div>
      </div>
    </ForeignShell>
  );
}

// 투어 카드 공용 export(홈 섹션 등에서 재사용 가능)
export { TourCards, ViatorNote };
