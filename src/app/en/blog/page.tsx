import type { Metadata } from "next";
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { listEnBlogPosts } from "@/lib/enBlog";

export const metadata: Metadata = {
  title: { absolute: "Korea Nightlife Guides — Where to Stay, Where to Go, What to Expect | NightFlow" },
  description:
    "Practical guides for a night out in Korea: which area to stay in, alternatives to famous clubs, going out solo, and Busan nights. Written from NightFlow's club data.",
  alternates: {
    canonical: "https://nightflow.kr/en/blog",
    languages: { "en-US": "https://nightflow.kr/en/blog", "x-default": "https://nightflow.kr/en/blog" },
  },
};

export default function EnBlogIndexPage() {
  const posts = listEnBlogPosts();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ForeignPageTracker kind="info" lang="en" meta={{ page: "blog" }} />
      <div className="max-w-2xl mx-auto px-5 py-12 space-y-8">
        <header className="space-y-3">
          <Link href="/en" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[28px] font-black tracking-tight leading-[1.2]">Korea Nightlife Guides</h1>
        </header>
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link href={`/en/blog/${p.slug}`} className="block p-5 rounded-2xl bg-card border border-border hover:border-foreground/30">
                <p className="font-bold text-[15px]">{p.h1}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">{p.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
