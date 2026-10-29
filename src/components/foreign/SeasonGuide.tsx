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
  /** 첫 화면 예약 버튼 밑 한 줄 — "무료 신청 · 예약금 없음 · 당일 클럽에 결제" */
  ctaNote?: string;
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
  const rows = (await fetchRealTablePrices(lang)).sort((a, b) => rank(a.area) - rank(b.area));
  const priceLd = realTablePricesJsonLd(rows, lang, url);

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
          <RealTablePrices lang={lang} rows={rows} midAd={false} />
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
