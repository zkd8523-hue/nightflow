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

const AREAS = ["Seoul", "Busan"];

export default async function EnBlogIndexPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  // 목록 안에서 도시로 거르기(?area=busan) — 위 탭은 블로그 밖으로 나가지 않는다(2026-10-04 사용자 지적)
  const q = ((await searchParams).area || "").toLowerCase();
  const area = AREAS.find((a) => a.toLowerCase() === q) || null;
  const all = listEnBlogPosts();
  const posts = area ? all.filter((p) => p.area === area) : all;
  const kinds = [...KIND_ORDER.filter((k) => posts.some((p) => p.kind === k)), ...new Set(posts.map((p) => p.kind).filter((k) => !KIND_ORDER.includes(k)))];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "blog" }} />
      <div className="max-w-2xl mx-auto px-5 py-12 space-y-10">
        <header className="space-y-3">
          <Link href="/en" className="text-[13px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[30px] font-black tracking-tight leading-[1.2]">Korea Nightlife Guides</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Where to stay, which clubs are still open, and how to go out on your own. Facts come from NightFlow&apos;s club
            listings and official sources, with the date we last checked.
          </p>
          <nav className="flex flex-wrap gap-2 pt-1" aria-label="Filter guides">
            {[["All", "/en/blog", !area], ...AREAS.map((a) => [a, `/en/blog?area=${a.toLowerCase()}`, area === a] as const)].map(([n, h, on]) => (
              <Link
                key={String(h)}
                href={String(h)}
                scroll={false}
                className={`h-9 px-4 inline-flex items-center rounded-full text-[13px] font-bold ${
                  on ? "bg-foreground text-background" : "border border-border hover:border-foreground/40"
                }`}
              >
                {n} ({n === "All" ? all.length : all.filter((p) => p.area === n).length})
              </Link>
            ))}
          </nav>
        </header>

        {kinds.map((k) => {
          const list = posts.filter((p) => p.kind === k);
          const [first, ...rest] = list;
          return (
            <section key={k} className="space-y-3">
              <h2 className="text-[19px] font-black">{k}</h2>
              <Link href={`/en/blog/${first.slug}`} className="block rounded-2xl bg-card border border-border overflow-hidden hover:border-foreground/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={first.hero?.url || thumb(first)} alt={first.hero?.alt || ""} width={1200} height={675} loading="lazy" className="w-full aspect-[16/9] object-cover" />
                <div className="p-4 space-y-1.5">
                  <p className="text-[12px] font-bold text-brand-amber uppercase tracking-wide">{first.area} · {first.minutes} min read</p>
                  <p className="font-bold text-[17px] leading-snug">{first.h1}</p>
                  <p className="text-[14px] text-muted-foreground leading-relaxed line-clamp-2">{first.description}</p>
                </div>
              </Link>
              {rest.map((p) => (
                <Link key={p.slug} href={`/en/blog/${p.slug}`} className="flex gap-3 p-3 rounded-2xl bg-card border border-border hover:border-foreground/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.hero?.url || thumb(p)} alt={p.hero?.alt || ""} width={96} height={96} loading="lazy" className="w-24 h-24 rounded-xl object-cover shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-[12px] font-bold text-brand-amber uppercase tracking-wide">{p.area} · {p.minutes} min</p>
                    <p className="font-bold text-[15px] leading-snug line-clamp-3">{p.h1}</p>
                  </div>
                </Link>
              ))}
            </section>
          );
        })}

        <p className="text-[13px] text-muted-foreground text-center">
          Browse clubs by area:{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/hongdae">Hongdae</Link> ·{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/itaewon">Itaewon</Link> ·{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/gangnam">Gangnam</Link> ·{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/en/clubs/busan">Busan</Link>
        </p>

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
