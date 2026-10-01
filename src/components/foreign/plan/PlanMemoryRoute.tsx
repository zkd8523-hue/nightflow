import Link from "next/link";
import { ForeignShell } from "@/components/foreign/ForeignShell";
import { ActivitiesTopBar } from "./SiteTabs";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { createClient } from "@/lib/supabase/server";
import { foreignClubPageHref } from "@/lib/clubs/slug";
import { type Route, TOURS, PLAN_BASE, PHOTO_CREDIT, BOOK_HREF, img } from "@/lib/planMemory/content";
import { PlanJsonLd } from "./PlanJsonLd";
import { BookCta, HowBooking, Trust, SafetyLink, Hero, TourCards, ViatorNote, Crumb, SecondaryCta } from "./PlanMemoryParts";

type ClubRow = { name_en: string | null; name: string; area: string; google_rating: number | null; google_review_count: number | null; featured_rank: number | null };

/** 코스 페이지의 클럽 3곳 — 하드코딩 대신 DB에서 읽어 클럽 페이지 링크·평점이 실제 값과 맞게 한다. */
async function loadClubs(route: Route): Promise<ClubRow[]> {
  if (!route.clubArea) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("name_en, name, area, google_rating, google_review_count, featured_rank")
    .eq("status", "approved")
    .is("deleted_at", null)
    .eq("is_test", false)
    .eq("hidden_from_guide", false)
    .eq("area", route.clubArea);
  const rows = (data ?? []) as ClubRow[];
  if (route.clubNames) {
    const want = route.clubNames.map((n) => n.toLowerCase());
    return want
      .map((w) => rows.find((r) => (r.name_en ?? "").toLowerCase() === w))
      .filter((r): r is ClubRow => !!r);
  }
  return rows
    .filter((r) => r.name_en)
    .sort((a, b) => (a.featured_rank ?? 999) - (b.featured_rank ?? 999) || (b.google_review_count ?? 0) - (a.google_review_count ?? 0))
    .slice(0, 3);
}

// 부산 서면 3곳의 요일·입장 줄 — facts-nr-busan-s.md(나플 표기 기준). DB 컬럼 형식이 제각각이라 여기서만 고정 문구.
const BUSAN_NOTE: Record<string, string> = {
  "groove & spot": "Open nightly · hip-hop & EDM · buy 1 drink to enter",
  belpos: "Fri–Sat · no slippers",
  azit: "Thu–Sun from ~1 a.m. · entry ₩20,000",
};

export async function PlanMemoryRoute({ route }: { route: Route }) {
  const clubs = await loadClubs(route);
  const bookHref = BOOK_HREF(route.bookArea);
  const tours = route.tours.map((id) => TOURS[id]).filter(Boolean);
  const credit = PHOTO_CREDIT[route.hero];

  return (
    <ForeignShell lang="en" sidebarCta={route.bookArea ? { href: bookHref, label: route.ctaLabel, kind: `plan_${route.slug}` } : undefined}>
      <ActivitiesTopBar />
      <ForeignPageTracker kind="info" lang="en" meta={{ page: `plan-your-memory/${route.slug}` }} />
      <PlanJsonLd
        path={`${PLAN_BASE}/${route.slug}`}
        headline={route.metaTitle}
        description={route.metaDescription}
        image={img(route.hero, 1200)}
        crumbs={[{ name: "NightFlow", path: "/en" }, { name: "Night Activities", path: PLAN_BASE }, { name: "Night routes", path: `${PLAN_BASE}/night-routes` }, { name: route.card.title, path: `${PLAN_BASE}/${route.slug}` }]}
      />
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-32 space-y-5">
        <Crumb href={`${PLAN_BASE}/night-routes`} label="Night routes" />
        <header className="space-y-2">
          <p className="text-[12.5px] font-bold text-brand-amber">{route.eyebrow}</p>
          <h1 className="text-[28px] sm:text-[32px] font-black leading-[1.12] tracking-tight text-balance">{route.title}</h1>
          <p className="text-[14.5px] text-muted-foreground text-pretty">{route.lead}</p>
        </header>
        <Hero src={route.hero} alt={route.heroAlt} caption={route.heroCaption} credit={credit} />

        {route.bookArea ? (
          <div className="space-y-3">
            <BookCta href={bookHref} label={route.ctaLabel ?? "Book a club table"} />
            {route.priceLine && <p className="text-center text-[12.5px] font-bold">{route.priceLine}</p>}
            <HowBooking />
            <Trust />
            <SafetyLink />
          </div>
        ) : (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black">{route.toursTitle}</h2>
            <TourCards tours={tours} campaign={route.campaign} compact />
            <ViatorNote />
          </section>
        )}

        {route.days && (
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <a href="#steps" className="rounded-xl bg-card border border-border p-2.5 text-muted-foreground"><b className="block text-[13.5px] text-brand-amber">Saturday</b>Drone show → clubs</a>
            <a href="#clubs" className="rounded-xl bg-card border border-border p-2.5 text-muted-foreground"><b className="block text-[13.5px] text-brand-amber">Friday</b>Straight to clubs</a>
            <Link href={`${PLAN_BASE}/haeundae-evening`} className="rounded-xl bg-card border border-border p-2.5 text-muted-foreground"><b className="block text-[13.5px] text-brand-amber">Sun–Thu</b>Most clubs open Fri–Sat — try a Haeundae evening</Link>
          </div>
        )}

        <section id="steps" className="space-y-2 scroll-mt-20">
          <h2 className="text-[20px] font-black pt-2">{route.stepsTitle}</h2>
          {route.steps.map((s) => (
            <div key={s.title} className="flex gap-3 rounded-2xl bg-card border border-border p-4">
              <div className="w-[64px] shrink-0 text-[12.5px] font-black text-brand-amber">{s.time}</div>
              <div className="min-w-0">
                <p className="font-bold text-[15px]">{s.title}</p>
                <p className="text-[13px] text-muted-foreground text-pretty">
                  {s.body}{" "}
                  {s.bookLink && route.bookArea && (
                    <Link rel="nofollow" data-nf-track="book_cta_step" href={bookHref} className="font-bold text-brand-amber">Book a table →</Link>
                  )}
                </p>
                {s.pills && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.pills.map((p) => <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{p}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {route.bridge && (
          <>
            <SafetyLink />
            <Link data-nf-track="route_bridge" href={route.bridge.href} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
              <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${img(route.bridge.image, 300)})` }} />
              <div className="min-w-0"><p className="font-bold text-[15px]">{route.bridge.title}</p><p className="text-[12.5px] text-muted-foreground">{route.bridge.body}</p></div>
              <span className="ml-auto font-black text-muted-foreground">›</span>
            </Link>
          </>
        )}

        {clubs.length > 0 && (
          <section id="clubs" className="space-y-2.5 scroll-mt-20">
            <h2 className="text-[20px] font-black pt-2">{route.clubsTitle}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {clubs.map((c) => {
                const href = foreignClubPageHref("en", c.area, c.name_en) ?? bookHref;
                const note = route.clubNames ? BUSAN_NOTE[(c.name_en ?? "").toLowerCase()] : c.google_rating ? `★${c.google_rating.toFixed(1)}${c.google_review_count ? ` (${c.google_review_count.toLocaleString("en-US")})` : ""}` : "";
                return (
                  <Link key={c.name_en} data-nf-track="club_card" href={href} className="rounded-xl bg-card border border-border p-3 text-center hover:border-foreground/30">
                    <p className="font-bold text-[13.5px]">{c.name_en}</p>
                    {note && <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>}
                    <span className="mt-2 block rounded-full bg-white py-1 text-[11.5px] font-black text-black">Book</span>
                  </Link>
                );
              })}
            </div>
            {route.clubsNote && <p className="text-[11px] text-muted-foreground">{route.clubsNote}</p>}
            {route.allClubs && <SecondaryCta href={route.allClubs.href} label={route.allClubs.label} track="see_all_clubs" />}
          </section>
        )}

        {route.bookArea && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black pt-2">{route.toursTitle}</h2>
            <TourCards tours={tours} campaign={route.campaign} />
            <ViatorNote />
          </section>
        )}

        {route.slug === "busan-night" && (
          <Link data-nf-track="route_bridge" href={`${PLAN_BASE}/night-routes`} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
            <div className="min-w-0"><p className="font-bold text-[15px]">Also in Seoul: Hongdae · Itaewon</p><p className="text-[12.5px] text-muted-foreground">More night routes with bookable clubs.</p></div>
            <span className="ml-auto font-black text-muted-foreground">›</span>
          </Link>
        )}
        {route.footnote && <p className="text-[11px] text-muted-foreground">{route.footnote}</p>}
      </div>

      {/* 모바일 하단 고정 예약 바 — 데스크톱은 사이드바 버튼이 같은 역할 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur px-4 py-2.5 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">
            <b className="block text-[13.5px] text-foreground">{route.bookArea ? route.ctaLabel : "Still want to dance?"}</b>
            {route.bookArea ? (route.priceLine?.split(" · ")[0] ?? "Zero fee") + " · pay at club" : "Seomyeon · Line 2 · Fri–Sat"}
          </div>
          <Link rel="nofollow" data-nf-track="book_cta_sticky" href={route.bookArea ? bookHref : `${PLAN_BASE}/busan-night`} className="shrink-0 rounded-full bg-brand-amber px-4 py-2.5 text-[14px] font-black text-black">
            {route.bookArea ? "Book a table" : "See clubs"}
          </Link>
        </div>
      </div>
    </ForeignShell>
  );
}
