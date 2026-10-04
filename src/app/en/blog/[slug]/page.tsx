import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { getEnBlogPost, heroFigureParts, listEnBlogSlugs } from "@/lib/enBlog";

function fmtDate(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// 영어 블로그 글 — 기존 /en 가이드 페이지와 겹치지 않는 질문형 글(2026-10-04 시작).
// 본문은 src/content/en-blog/<slug>.md, 예약 버튼은 다른 /en 페이지와 같은 /flags/new?lang=en.

export const dynamicParams = false;

function ogImage(post: { h1: string; area: string; kind: string }) {
  return `https://nightflow.kr/api/og?title=${encodeURIComponent(post.h1)}&sub=${encodeURIComponent(`${post.area} · ${post.kind} — NightFlow Guides`)}&lang=en`;
}

function BookButton({ where }: { where: string }) {
  return (
    <Link
      rel="nofollow"
      data-nf-track={where}
      href="/flags/new?lang=en"
      className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors"
    >
      🍾 Book Korean Clubs
    </Link>
  );
}

export function generateStaticParams() {
  return listEnBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getEnBlogPost((await params).slug);
  if (!post) return {};
  const url = `https://nightflow.kr/en/blog/${post.slug}`;
  return {
    title: { absolute: post.title },
    description: post.description,
    alternates: { canonical: url, languages: { "en-US": url, "x-default": url } },
    openGraph: {
      title: post.h1,
      description: post.description,
      url,
      locale: "en_US",
      type: "article",
      images: [{ url: post.hero?.url || ogImage(post), width: 1200, height: 630 }],
    },
    // 루트 기본 twitter 카드가 한국어(나플)라 글마다 영어로 덮어쓴다
    twitter: { card: "summary_large_image", title: post.h1, description: post.description, images: [post.hero?.url || ogImage(post)] },
  };
}

export default async function EnBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getEnBlogPost((await params).slug);
  if (!post) notFound();
  const url = `https://nightflow.kr/en/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.h1,
        description: post.description,
        datePublished: post.date,
        author: { "@type": "Organization", name: "NightFlow Editorial Team", url: "https://nightflow.kr/en/blog" },
        image: post.hero?.url || ogImage(post),
        dateModified: post.updated,
        mainEntityOfPage: url,
        publisher: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/en" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
          { "@type": "ListItem", position: 2, name: "Guides", item: "https://nightflow.kr/en/blog" },
          { "@type": "ListItem", position: 3, name: post.h1, item: url },
        ],
      },
    ],
  };

  const hero = post.hero ? heroFigureParts(post.hero) : null;
  const related = post.related.map((r) => ({ ...r, post: r.href.startsWith("/en/blog/") ? getEnBlogPost(r.href.slice(9)) : null }));

  return (
    <div className="min-h-screen bg-[#121214] text-foreground">
      <ForeignPageTracker kind="guide" lang="en" meta={{ page: `blog/${post.slug}` }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-[720px] mx-auto px-5 pt-8 pb-16 space-y-7">
        <header className="space-y-3">
          <nav className="text-[13px] text-muted-foreground">
            <Link href="/en" className="hover:text-foreground">NightFlow</Link>
            <span className="mx-1.5">›</span>
            <Link href="/en/blog" className="hover:text-foreground">Guides</Link>
            <span className="mx-1.5">›</span>
            <span>{post.area}</span>
          </nav>
          <h1 className="text-[28px] sm:text-[34px] font-black tracking-tight leading-[1.2]">{post.h1}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-brand-amber/15 text-brand-amber font-bold text-[12px] uppercase tracking-wide">{post.area}</span>
            <span>By NightFlow Editorial Team</span>
            <span>·</span>
            <span>{post.minutes} min read</span>
            <span>·</span>
            <span>Updated {fmtDate(post.checked)}</span>
          </div>
        </header>

        {hero && (
          <figure className="-mx-5 sm:mx-0 space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.url} alt={hero.alt} width={1200} height={675} fetchPriority="high" className="w-full aspect-[16/9] object-cover sm:rounded-2xl" />
            <figcaption className="px-5 sm:px-0 text-[12px] text-muted-foreground">
              {hero.caption} · Photo:{" "}
              {hero.creditHref ? <a className="underline" href={hero.creditHref} target="_blank" rel="nofollow noopener">{hero.credit}</a> : hero.credit} on{" "}
              <a className="underline" href={hero.unsplashHref} target="_blank" rel="nofollow noopener">Unsplash</a>
            </figcaption>
          </figure>
        )}

        {post.toc.length > 2 && (
          <details className="rounded-2xl bg-card border border-border text-[14px]">
            <summary className="px-4 py-3 cursor-pointer font-bold">On this page · {post.toc.length} sections</summary>
            <ol className="list-decimal pl-9 pr-4 pb-3 text-muted-foreground space-y-1 leading-[1.6]">
              {post.toc.map((t) => (
                <li key={t.id}><a className="hover:text-foreground" href={`#${t.id}`}>{t.text}</a></li>
              ))}
            </ol>
          </details>
        )}

        {post.html.split("<!--NF_MID_CTA-->").map((part, i) => (
          <div key={i} className="space-y-7">
            {i > 0 && (
              <div className="p-4 rounded-2xl bg-card border border-border space-y-3 text-center">
                <p className="text-[14px] text-muted-foreground">Picked a club? Check this week&apos;s availability and book in English.</p>
                <Link
                  rel="nofollow"
                  data-nf-track="book_cta_mid"
                  href="/flags/new?lang=en"
                  className="block w-full py-3.5 rounded-xl bg-brand-amber text-black font-black text-[15px] hover:opacity-90 transition-colors"
                >
                  Book Korean Clubs →
                </Link>
              </div>
            )}
            <div
              className="text-[16px] sm:text-[17px] leading-[1.7] text-[#e6e6e6] space-y-5
            [&_h2]:text-[22px] [&_h2]:leading-[1.3] [&_h2]:font-black [&_h2]:pt-8 [&_h2]:mb-1 [&_h2]:scroll-mt-20 [&_h2]:text-white
            [&_h3]:text-[18px] [&_h3]:leading-[1.35] [&_h3]:font-bold [&_h3]:pt-3 [&_h3]:text-white
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5
            [&_a]:text-amber-300 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-white
            [&_.nf-lead]:bg-card [&_.nf-lead]:border-l-4 [&_.nf-lead]:border-brand-amber [&_.nf-lead]:rounded-xl [&_.nf-lead]:p-4 [&_.nf-lead]:text-white
            [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
            [&_.nf-fig]:space-y-1.5 [&_.nf-fig_img]:w-full [&_.nf-fig_img]:aspect-[3/2] [&_.nf-fig_img]:object-cover [&_.nf-fig_img]:rounded-2xl
            [&_figcaption]:text-[12px] [&_figcaption]:leading-[1.5] [&_figcaption]:text-muted-foreground [&_figcaption_a]:text-muted-foreground
            [&_.nf-table]:overflow-x-auto [&_.nf-table]:-mx-5 [&_.nf-table]:px-5 sm:[&_.nf-table]:mx-0 sm:[&_.nf-table]:px-0
            [&_table]:min-w-[560px] [&_table]:w-full [&_table]:text-[14px] [&_table]:leading-[1.5]
            [&_thead]:bg-card [&_th]:text-left [&_th]:font-bold [&_th]:py-2.5 [&_th]:px-3 [&_th]:text-white
            [&_td]:border-t [&_td]:border-border [&_td]:py-2.5 [&_td]:px-3 [&_td]:align-top
            [&_td:first-child]:font-semibold [&_td:first-child]:text-muted-foreground [&_td:first-child]:min-w-[110px]
            [&_tbody_tr:nth-child(even)]:bg-white/[0.03]"
              dangerouslySetInnerHTML={{ __html: part }}
            />
          </div>
        ))}

        {post.hasAffiliate && (
          <p className="text-[12px] text-muted-foreground">
            ⓘ Some links on this page are affiliate links: if you book through them we may earn a commission, at no extra cost to you.
          </p>
        )}

        <section className="space-y-3 text-center pt-2">
          <p className="text-[14px] text-muted-foreground leading-relaxed">{post.cta}</p>
          <BookButton where="book_cta" />
        </section>

        {related.length > 0 && (
          <section className="space-y-3 pt-2">
            <h2 className="text-[18px] font-black">Related guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <Link key={r.href} href={r.href} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:border-foreground/30">
                  {r.post?.hero && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.post.hero.url} alt="" width={80} height={80} loading="lazy" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                  )}
                  <span className="text-[14px] font-bold leading-snug">{r.label} →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-6 border-t border-border text-[12px] text-muted-foreground space-y-1">
          <p>Written by the NightFlow Editorial Team from NightFlow&apos;s club listings and the official sources linked in each guide.</p>
          <p>
            <Link className="underline" href="/en/blog">All guides</Link> ·{" "}
            <Link className="underline" href="/en/clubs">All clubs</Link> ·{" "}
            <Link className="underline" href="/en/faq">FAQ</Link>
          </p>
        </footer>
      </article>
    </div>
  );
}
