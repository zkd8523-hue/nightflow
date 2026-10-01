import Link from "next/link";
import { ForeignShell } from "@/components/foreign/ForeignShell";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { ROUTES, TOURS, PLAN_BASE, BOOK_HREF, img } from "@/lib/planMemory/content";
import { BookCta, HowBooking, Trust, SafetyLink, TourCards, ViatorNote, Tabs, Crumb, SecondaryCta } from "./PlanMemoryParts";

const ROUTE_ORDER = ["hongdae-night", "itaewon-night", "busan-night", "haeundae-evening"];

export function PlanMemoryHub() {
  const routes = ROUTE_ORDER.map((s) => ROUTES.find((r) => r.slug === s)!).filter(Boolean);
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory" }} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href="/en" label="NightFlow" />
        <header className="space-y-2">
          <h1 className="text-[30px] font-black leading-[1.1] tracking-tight">Plan your Memory in Korea</h1>
          <p className="text-[14.5px] text-muted-foreground">Pick a night. Every club route ends at a club you can book in English.</p>
        </header>
        <SecondaryCta href={BOOK_HREF()} label="🍾 Already know? Book a club table" />
        <Trust />
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
          <Link data-nf-track="route:tours" href={`${PLAN_BASE}/tours`} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3 hover:border-foreground/30">
            <div className="h-[76px] w-[76px] shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${img(TOURS.hanCruise.image, 300)})` }} />
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight">No club — views &amp; tours</p>
              <p className="text-[12.5px] text-muted-foreground">River cruise, tower views, guided night tours.</p>
              <p className="text-[11px] font-bold text-emerald-300 mt-1">Seoul · Busan</p>
            </div>
            <span className="ml-auto font-black text-muted-foreground">›</span>
          </Link>
        </div>
        <div className="space-y-3 pt-2">
          <BookCta href={BOOK_HREF()} label="Just book a club table" />
          <HowBooking />
        </div>
      </div>
    </ForeignShell>
  );
}

export function PlanMemoryTours() {
  const seoul = ["seoulSmallGroup", "hanCruise", "seoulPrivate", "nTowerWalk"].map((k) => TOURS[k]);
  const busan = ["busanHike", "skyCapsule", "busanNightView", "busanByNight"].map((k) => TOURS[k]);
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory/tours" }} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href={PLAN_BASE} label="Plan your Memory" />
        <header className="space-y-2">
          <h1 className="text-[28px] font-black leading-[1.12] tracking-tight">Night tours in Seoul &amp; Busan</h1>
          <p className="text-[14.5px] text-muted-foreground">Views and cruises for your evening — with or without a club after.</p>
        </header>
        <Tabs active="tours" />
        <SafetyLink label="🛟 Getting home after a tour: last train · taxi · help numbers →" />
        <h2 className="text-[20px] font-black">Seoul</h2>
        <TourCards tours={seoul} campaign="tours-seoul" compact />
        <SecondaryCta href={BOOK_HREF()} label="🍾 Want to dance after? Book a club table" />
        <h2 className="text-[20px] font-black pt-2">Busan</h2>
        <TourCards tours={busan} campaign="tours-busan" compact />
        <SecondaryCta href={BOOK_HREF("부산")} label="🍾 Seomyeon clubs after? Book a table" />
        <ViatorNote />
      </div>
    </ForeignShell>
  );
}

export function PlanMemoryGettingAround() {
  return (
    <ForeignShell lang="en">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "plan-your-memory/getting-around" }} />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-24 space-y-4">
        <Crumb href={PLAN_BASE} label="Plan your Memory" />
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
          <li><b>Bring your passport.</b> Age rule (Korean law, 2026): born in 2007 or earlier. Clubs check at the door.</li>
        </ul>
        <h2 className="text-[20px] font-black pt-2">Pick your night</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["Hongdae", "Clubs · Seoul", `${PLAN_BASE}/hongdae-night`],
            ["Itaewon", "Clubs · Seoul", `${PLAN_BASE}/itaewon-night`],
            ["Seomyeon", "Clubs · Busan", `${PLAN_BASE}/busan-night`],
            ["Haeundae", "Beach evening", `${PLAN_BASE}/haeundae-evening`],
            ["Night tours", "No club", `${PLAN_BASE}/tours`],
          ].map(([t, s, h]) => (
            <Link key={t} href={h} className="rounded-xl bg-card border border-border p-3 text-center hover:border-foreground/30">
              <b className="block text-[13.5px]">{t}</b>
              <span className="text-[11px] text-muted-foreground">{s}</span>
            </Link>
          ))}
        </div>
        <BookCta href={BOOK_HREF()} label="Book a club table — zero fee" />
        <HowBooking />
      </div>
    </ForeignShell>
  );
}

// 투어 카드 공용 export(홈 섹션 등에서 재사용 가능)
export { TourCards, ViatorNote };
