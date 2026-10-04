import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { getEnBlogPost, listEnBlogSlugs } from "@/lib/enBlog";

// 영어 블로그 글 — 기존 /en 가이드 페이지와 겹치지 않는 질문형 글(2026-10-04 시작).
// 본문은 src/content/en-blog/<slug>.md, 예약 버튼은 다른 /en 페이지와 같은 /flags/new?lang=en.

export const dynamicParams = false;

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
      images: [{ url: `https://nightflow.kr/api/og?title=${encodeURIComponent(post.h1)}&lang=en`, width: 1200, height: 630 }],
    },
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="guide" lang="en" meta={{ page: `blog/${post.slug}` }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-2xl mx-auto px-5 py-12 space-y-8">
        <header className="space-y-3">
          <Link href="/en/blog" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← NightFlow Guides
          </Link>
          <h1 className="text-[28px] font-black tracking-tight leading-[1.2]">{post.h1}</h1>
          <p className="text-[12px] text-muted-foreground">Updated {post.updated}</p>
        </header>

        {post.toc.length > 2 && (
          <nav className="p-4 rounded-2xl bg-card border border-border text-[13px] space-y-1">
            <p className="font-bold">On this page</p>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-0.5">
              {post.toc.map((t) => (
                <li key={t.id}><a className="hover:text-foreground" href={`#${t.id}`}>{t.text}</a></li>
              ))}
            </ol>
          </nav>
        )}

        <div
          className="text-[15px] leading-[1.75] text-foreground/90 space-y-4
            [&_h2]:text-[21px] [&_h2]:font-black [&_h2]:pt-6 [&_h2]:scroll-mt-20 [&_h2]:text-foreground
            [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:pt-3 [&_h3]:text-foreground
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
            [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-foreground
            [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
            [&_.nf-table]:overflow-x-auto [&_table]:w-full [&_table]:text-[13px] [&_th]:text-left [&_th]:font-bold
            [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-3 [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        <section className="space-y-3 text-center pt-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">{post.cta}</p>
          <Link
            rel="nofollow"
            data-nf-track="book_cta"
            href="/flags/new?lang=en"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 Book Korean Clubs
          </Link>
        </section>

        {post.related.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="text-[18px] font-black">Related Guides</h2>
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              {post.related.map((r) => (
                <li key={r.href}><Link className="hover:text-foreground" href={r.href}>{r.label} →</Link></li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
