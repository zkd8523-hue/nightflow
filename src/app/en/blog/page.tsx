import type { Metadata } from "next";
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { listEnBlogPosts, type EnBlogPost } from "@/lib/enBlog";

const TITLE = "Korea Nightlife Guides — Where to Stay, Where to Go, What to Expect | NightFlow";
const DESC =
  "Practical guides for a night out in Korea: which area to stay in, alternatives to famous clubs, going out solo, and Busan nights. Written from NightFlow's club data.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: {
    canonical: "https://nightflow.kr/en/blog",
    languages: { "en-US": "https://nightflow.kr/en/blog", "x-default": "https://nightflow.kr/en/blog" },
  },
  openGraph: { title: "Korea Nightlife Guides", description: DESC, url: "https://nightflow.kr/en/blog", locale: "en_US", type: "website" },
  twitter: { card: "summary_large_image", title: "Korea Nightlife Guides", description: DESC },
};

// 글이 늘면 이 순서로 묶어 보여 준다(없는 묶음은 안 나옴)
const KIND_ORDER = ["Where to stay", "Club guide", "Tips"];

function thumb(p: EnBlogPost) {
  return `/api/og?title=${encodeURIComponent(p.h1)}&sub=${encodeURIComponent(`${p.area} · ${p.kind}`)}&lang=en`;
}

export default function EnBlogIndexPage() {
  const posts = listEnBlogPosts();
  const kinds = [...KIND_ORDER.filter((k) => posts.some((p) => p.kind === k)), ...new Set(posts.map((p) => p.kind).filter((k) => !KIND_ORDER.includes(k)))];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "blog" }} />
      <div className="max-w-2xl mx-auto px-5 py-12 space-y-10">
        <header className="space-y-3">
          <Link href="/en" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[28px] font-black tracking-tight leading-[1.2]">Korea Nightlife Guides</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Answers to the questions travelers ask before a night out in Korea: where to stay, which clubs are still open,
            and how to go out on your own. Club names, areas, music and hours come from the venues listed on NightFlow, and
            every guide shows the date we last checked the facts.
          </p>
          <p className="text-[13px] text-muted-foreground">
            Browse clubs by area:{" "}
            <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/hongdae">Hongdae</Link> ·{" "}
            <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/itaewon">Itaewon</Link> ·{" "}
            <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/gangnam">Gangnam</Link> ·{" "}
            <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/busan">Busan</Link>
          </p>
        </header>

        {kinds.map((k) => (
          <section key={k} className="space-y-3">
            <h2 className="text-[18px] font-black">{k}</h2>
            <ul className="space-y-3">
              {posts.filter((p) => p.kind === k).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/en/blog/${p.slug}`}
                    className="block rounded-2xl bg-card border border-border overflow-hidden hover:border-foreground/30"
                  >
                    {/* 글마다 다른 제목 이미지(/api/og) — 사진이 생기면 교체 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(p)} alt="" width={1200} height={630} loading="lazy" className="w-full aspect-[1200/630] object-cover" />
                    <div className="p-4 space-y-1.5">
                      <p className="text-[11px] font-bold text-brand-amber uppercase tracking-wide">
                        {p.area} · {p.minutes} min read
                      </p>
                      <p className="font-bold text-[15px] leading-snug">{p.h1}</p>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">{p.description}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="space-y-3 text-center pt-2">
          <p className="text-[13px] text-muted-foreground">Already know where you&apos;re going? Book entry or a table in English.</p>
          <Link
            rel="nofollow"
            data-nf-track="book_cta_blog_index"
            href="/flags/new?lang=en"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 Book Korean Clubs
          </Link>
        </section>
      </div>
    </div>
  );
}
