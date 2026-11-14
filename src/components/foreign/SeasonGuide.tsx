// 시즌·상황별 안내 페이지 공용 틀(2026-10-20). 할로윈 페이지(HalloweenSeoul2026)와 같은 구조 —
// 헤더 → 지역 카드 → 진행 순서 → 실제 가격표 → FAQ → 예약 → 더 보기.
// 크리스마스·신년·단체/생일처럼 "날짜나 상황이 정해진 단체 손님"을 예약으로 잇는 페이지들이 쓴다.
// 문구는 src/lib/foreign/seasonGuides.ts에 페이지별로 둔다.
//
// 하지 않는 것(할로윈과 같은 원칙):
//   - 클럽별 이벤트·라인업을 지어내지 않는다. 클럽이 인스타에 발표한다고만 적는다.
//   - Event 구조화 데이터 없음(우리가 주최자가 아니다). WebPage + FAQ + 가격 ItemList만.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AgodaStrip } from "@/components/affiliate/AgodaStrip";
import type { Metadata } from "next";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd } from "@/components/foreign/RealTablePrices";
import { StickyBookBar } from "@/components/foreign/StickyReveal";
import { createClient } from "@/lib/supabase/server";
import { formatWon } from "@/lib/clubs/tablePricing";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { getKrwRates, krwTo, langToCurrency, type KrwRates } from "@/lib/utils/currency";
import type { SeoLang } from "@/lib/seo/clubBookingSeo";

const BASE = "https://nightflow.kr";

export type SeasonGuideCopy = {
  title: string;
  description: string;
  ogTitle: string;
  ogSub: string;
  keywords: string[];
  eyebrow: string;
  h1: string;
  intro: string;
  areasH2: string;
  areas: { name: string; tag: string; body: string; href: string }[];
  stepsH2: string;
  steps: { time: string; text: string }[];
  pricesH2: string;
  pricesNote: string;
  faqH2: string;
  faqs: { q: string; a: string }[];
  ctaH2: string;
  ctaBody: string;
  cta: string;
  /** 첫 화면 예약 버튼 위 한 단락 — 누구를 위한 페이지인지(2026-11-14, 연말: 4~10명 단체 테이블) */
  forWho?: string;
  /** 첫 화면 예약 버튼 밑 한 줄 — "무료 신청 · 예약금 없음 · 당일 클럽에 결제" */
  ctaNote?: string;
  /** 추천 클럽 카드 첫 화면(cfg.picks와 같이 쓴다). 있으면 날짜 버튼·forWho 대신 카드가 첫 화면이다. */
  hero?: {
    /** 제목 밑 한 줄 */
    sub: string;
    /** "≈ {won} each for {n}" — {won}·{n} 자리 표시 */
    each: string;
    /** 카드 가격 앞 라벨 ("Christmas tables from") */
    fromLabel: string;
    /** cfg.picks.dates와 같은 순서의 버튼 문구 */
    bookOn: string[];
    /** 카드 아래 한 줄 — 누가 어떻게 확정해 주는지 */
    host: string;
    /** 다른 클럽·날짜 링크 */
    other: string;
  };
  /** 날짜가 정해진 시즌이면 첫 화면 버튼을 날짜별로 쪼갠다 — 누르면 폼 달력이 그 날짜로 채워진다(?date=).
      할로윈 페이지 방문자 절반이 화면 3분의 1도 안 내리고 나갔다(스크롤 중앙값 35%, 2026-10-30).
      첫 화면에서 한 번 누르면 날짜까지 끝나게 한다. */
  dates?: { date: string; label: string }[];
  /** 날짜 버튼 위 짧은 제목 */
  datesH?: string;
  /** 날짜 버튼 밑 "다른 날짜" 링크 */
  otherDate?: string;
  moreH2: string;
  more: { label: string; href: string }[];
  back: string;
  breadcrumb: string;
};

export type SeasonGuideConfig = {
  slug: string;
  /** schema.org WebPage.about 이름 */
  about: string;
  /** 날짜가 있는 시즌이면 "2026-12-24/2026-12-26" 같은 기간 */
  temporalCoverage?: string;
  /** 가격표 지역 순서(한국어 지역명) */
  areaOrder: string[];
  /** 그 시즌의 지역별 테이블 최저금액(평소보다 높을 때만). 가격표·구조화 데이터가 이 값을 쓴다. */
  seasonFloors?: Record<string, number>;
  /** 첫 화면 추천 클럽(운영자 지역별 추천 area_pick 기준) + 예약 버튼 날짜. 예약 가능 목록에 없는 클럽은 조용히 빠진다. */
  picks?: { clubIds: string[]; dates: string[]; groupSize: number };
  /** 언어별 문구. 춘절처럼 일부 언어에만 있는 페이지도 있다 — 없는 언어는 404, hreflang에서도 뺀다. */
  copy: Partial<Record<SeoLang, SeasonGuideCopy>>;
};

const HREFLANG: Record<SeoLang, string> = { en: "en-US", zh: "zh-CN", "zh-tw": "zh-TW", ja: "ja-JP" };

const OG_LOCALE: Record<SeoLang, string> = { en: "en_US", ja: "ja_JP", zh: "zh_CN", "zh-tw": "zh_TW" };

export function seasonGuideMetadata(cfg: SeasonGuideConfig, lang: SeoLang): Metadata {
  const c = cfg.copy[lang];
  if (!c) return {};
  const url = `${BASE}/${lang}/${cfg.slug}`;
  const langs = Object.keys(cfg.copy) as SeoLang[];
  const og = `${BASE}/api/og?title=${encodeURIComponent(c.ogTitle)}&sub=${encodeURIComponent(c.ogSub)}&lang=${lang}`;
  return {
    title: { absolute: c.title },
    description: c.description,
    keywords: c.keywords,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(langs.map((l) => [HREFLANG[l], `${BASE}/${l}/${cfg.slug}`])),
        "x-default": `${BASE}/${langs.includes("en") ? "en" : langs[0]}/${cfg.slug}`,
      },
    },
    openGraph: {
      title: c.title,
      description: c.description,
      url,
      locale: OG_LOCALE[lang],
      type: "website",
      images: [{ url: og, width: 1200, height: 630 }],
    },
  };
}

export async function SeasonGuide({ cfg, lang }: { cfg: SeasonGuideConfig; lang: SeoLang }) {
  const c = cfg.copy[lang];
  if (!c) notFound();
  const bookHref = `/flags/new?lang=${lang}`;
  const url = `${BASE}/${lang}/${cfg.slug}`;
  const rank = (a: string) => {
    const i = cfg.areaOrder.indexOf(a);
    return i === -1 ? cfg.areaOrder.length : i;
  };
  const sf = cfg.seasonFloors;
  const rows = (await fetchRealTablePrices(lang))
    .map((r) => (sf?.[r.area] ? { ...r, from: Math.max(r.from, sf[r.area]) } : r))
    .sort((a, b) => rank(a.area) - rank(b.area));
  const priceLd = realTablePricesJsonLd(rows, lang, url);

  // 추천 카드 — 가격·링크는 가격표 행(rows, 시즌 하한 반영)에서, 로고·장르만 따로 읽는다.
  const pickRows = cfg.picks && c.hero
    ? cfg.picks.clubIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is (typeof rows)[number] => !!r)
    : [];
  let pickMeta = new Map<string, { thumb: string | null; genres: string[] }>();
  let rates: KrwRates | null = null;
  if (pickRows.length) {
    const supabase = await createClient();
    const [{ data }, fx] = await Promise.all([
      supabase.from("clubs").select("id, thumbnail_url, tags").in("id", pickRows.map((r) => r.id)),
      getKrwRates(),
    ]);
    rates = fx.rates;
    pickMeta = new Map(
      (data ?? []).map((d) => [
        d.id as string,
        {
          thumb: (d.thumbnail_url as string | null) ?? null,
          genres: ((d.tags as string[] | null) ?? [])
            .filter((t) => t.startsWith("genre:"))
            .map((t) => TAG_LABEL_I18N[t.slice(6)]?.[lang] ?? null)
            .filter((x): x is string => !!x)
            .slice(0, 2),
        },
      ]),
    );
  }
  const cur = langToCurrency(lang);
  const approx = (won: number) => (cur && rates ? krwTo(won, cur, rates) : null);
  // 1인당 — 천 원 단위로 반올림
  const each = (won: number, n: number) => formatWon(Math.round(won / n / 1000) * 1000);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: c.title,
        description: c.description,
        inLanguage: lang === "zh-tw" ? "zh-TW" : lang === "zh" ? "zh-CN" : lang,
        about: { "@type": "Thing", name: cfg.about },
        ...(cfg.temporalCoverage ? { temporalCoverage: cfg.temporalCoverage } : {}),
      },
      ...(priceLd ? [priceLd] : []),
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: `${BASE}/${lang}` },
          { "@type": "ListItem", position: 2, name: c.breadcrumb, item: url },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe lg:pb-0">
      <ForeignPageTracker kind="info" lang={lang} meta={{ page: cfg.slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4">
          <Link href={`/${lang}`} className="text-[12px] text-muted-foreground hover:text-foreground">{c.back}</Link>
          <p className="text-[12px] font-black tracking-wider text-brand-amber">{c.eyebrow}</p>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15] break-keep">{c.h1}</h1>
          {/* 예약 버튼을 소개 문단 위로 올렸다(2026-10-30) — 문단 밑에 있으면 모바일 첫 화면에서 안 보인다.
              id="book-cta"가 화면 위로 지나가면 하단 고정 바(StickyBookBar)가 뜬다. */}
          {pickRows.length > 0 && c.hero && cfg.picks ? (
            <div id="book-cta" className="space-y-3">
              <p className="text-[15px] text-foreground/90 leading-relaxed break-keep">{c.hero.sub}</p>
              <div className="space-y-3">
                {pickRows.map((r) => {
                  const m = pickMeta.get(r.id);
                  const fx = approx(r.from);
                  return (
                    <div key={r.id} className="rounded-2xl bg-card border border-border p-3.5 space-y-3">
                      <div className="flex gap-3.5">
                        {m?.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.thumb} alt={r.name} width={88} height={88} loading="eager" className="w-[88px] h-[88px] rounded-xl object-cover shrink-0 bg-black" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          {r.href ? (
                            <Link href={r.href} className="text-[17px] font-black leading-tight hover:text-brand-amber">{r.name}</Link>
                          ) : (
                            <p className="text-[17px] font-black leading-tight">{r.name}</p>
                          )}
                          <p className="text-[12px] font-bold text-brand-amber mt-0.5">{[r.areaLabel, ...(m?.genres ?? [])].join(" · ")}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">{c.hero!.fromLabel}</p>
                          <p className="text-[19px] font-black tabular-nums leading-tight">
                            {formatWon(r.from)}
                            {fx && <span className="ml-1.5 text-[12px] font-bold text-muted-foreground">≈ {fx}</span>}
                          </p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">
                            {c.hero!.each.replace("{won}", each(r.from, cfg.picks!.groupSize)).replace("{n}", String(cfg.picks!.groupSize))}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {cfg.picks!.dates.map((d, i) => (
                          <Link rel="nofollow" key={d}
                            data-nf-track="book_cta_pick"
                            data-nf-label={`${r.name}|${d}`}
                            href={`/flags/new?lang=${lang}&date=${d}&club=${r.id}`}
                            className="rounded-xl bg-inverse text-inverse-foreground py-2.5 font-black text-[13px] text-center hover:opacity-90 transition-opacity"
                          >
                            {c.hero!.bookOn[i] ?? d}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">{c.hero.host}</p>
              <Link rel="nofollow" data-nf-track="book_cta" href={bookHref} className="inline-block text-[13px] font-bold text-brand-amber hover:underline">
                {c.hero.other}
              </Link>
            </div>
          ) : (
          <>
          {c.forWho && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-[14px] font-bold text-foreground leading-relaxed break-keep">{c.forWho}</p>
          )}
          <div id="book-cta" className="space-y-2">
            {c.dates?.length ? (
              <>
                {c.datesH && <p className="text-[12px] font-bold text-muted-foreground">{c.datesH}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {c.dates.map((d) => (
                    <Link rel="nofollow"
                      key={d.date}
                      data-nf-track="book_cta_date"
                      data-nf-label={d.date}
                      href={`${bookHref}&date=${d.date}`}
                      className="rounded-xl bg-inverse text-inverse-foreground px-3 py-3 font-black text-[14px] text-center leading-snug break-keep hover:opacity-90 transition-opacity"
                    >
                      {d.label}
                    </Link>
                  ))}
                </div>
                {c.otherDate && (
                  <Link rel="nofollow" data-nf-track="book_cta" href={bookHref} className="inline-block text-[13px] font-bold text-brand-amber hover:underline">
                    {c.otherDate}
                  </Link>
                )}
              </>
            ) : (
              <Link rel="nofollow"
                data-nf-track="book_cta"
                href={bookHref}
                className="inline-block px-6 py-3 rounded-full bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 transition-colors"
              >
                {c.cta}
              </Link>
            )}
            {c.ctaNote && <p className="text-[12px] text-muted-foreground break-keep">{c.ctaNote}</p>}
          </div>
          </>
          )}
          <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{c.intro}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.areasH2}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {c.areas.map((a) => (
              <Link key={a.href} href={a.href} data-nf-track="area_card" className="rounded-2xl bg-card border border-border p-4 hover:border-amber-500/40 transition-colors flex flex-col">
                <h3 className="text-[16px] font-black">{a.name}</h3>
                <p className="text-[11px] font-bold text-brand-amber mt-0.5">{a.tag}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-2 flex-1">{a.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.stepsH2}</h2>
          <ol className="rounded-2xl border border-border bg-card divide-y divide-border">
            {c.steps.map((s) => (
              <li key={s.time} className="grid grid-cols-[92px_1fr] gap-3 px-4 py-3">
                <span className="text-[13px] font-black tabular-nums text-brand-amber">{s.time}</span>
                <span className="text-[13px] text-muted-foreground leading-relaxed break-keep">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* 일정 아래, 가격표 위. 체크인은 시즌 시작일 */}
        <AgodaStrip angle="early" lang={lang} placement="foreign_info" area={null} stay={cfg.temporalCoverage ? { checkIn: cfg.temporalCoverage.split("/")[0], nights: 1, adults: 2 } : undefined} />

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.pricesH2}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{c.pricesNote}</p>
          <RealTablePrices lang={lang} rows={rows} midAd={false} floorByArea={sf} />
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.faqH2}</h2>
          {c.faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-[14px] font-bold text-foreground break-keep">{f.q}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">{c.ctaH2}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">{c.ctaBody}</p>
          <Link rel="nofollow"
            data-nf-track="book_cta"
            href={bookHref}
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            {c.cta}
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">{c.moreH2}</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            {c.more.map((m) => (
              <li key={m.href}><Link className="hover:text-foreground" href={m.href}>{m.label}</Link></li>
            ))}
          </ul>
        </section>
      </div>
      {/* 하단 고정 바는 이모지 없이(StickyBookBar 규칙) — 앞에 붙은 이모지·공백만 뗀다. */}
      <StickyBookBar className="lg:hidden" href={bookHref} label={c.cta.replace(/^[^\p{L}\p{N}]+/u, "")} />
    </div>
  );
}
