import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { WEEKLY_ISSUES } from "@/lib/weekly/issues";
import { WeeklyIssueBody } from "@/components/weekly/WeeklyIssueBody";
import { WeeklyBenefitSections } from "@/components/weekly/WeeklyBenefitSections";

export const dynamic = "force-static";

export function generateStaticParams() {
  return WEEKLY_ISSUES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = WEEKLY_ISSUES.find((i) => i.slug === slug);
  if (!issue) return { title: "클러빙 뉴스" };

  const flat = issue.title.replace(/\n/g, " ");
  return {
    title: `${flat} - 클러빙 뉴스 ${issue.volume}`,
    description: `${issue.period} 이번 주 클럽·공연·DJ 정리. ${issue.meta}`,
    alternates: { canonical: `https://nightflow.kr/weekly/${issue.slug}` },
    openGraph: {
      title: `${flat} - 클러빙 뉴스 ${issue.volume}`,
      description: `${issue.period} · ${issue.meta}`,
      url: `https://nightflow.kr/weekly/${issue.slug}`,
      type: "article",
      images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
  };
}

export default async function WeeklyIssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = WEEKLY_ISSUES.find((i) => i.slug === slug);
  if (!issue) notFound();

  return (
    <main className="max-w-lg mx-auto pb-10">
      <nav className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <Link href="/weekly" className="font-mono text-[11px] text-muted-foreground">
          ‹ 지난 호
        </Link>
        {/* 홈 섹션과 같은 이름을 쓴다 — 거기서 눌러 들어온 사람이 다른 데로
            온 줄 알면 안 된다 */}
        <span className="text-[13px] font-black tracking-tight inline-flex items-center gap-1">
          <span>🪩</span>
          클러빙 뉴스
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {issue.volume}
        </span>
      </nav>

      <WeeklyIssueBody slug={issue.slug} benefits={<WeeklyBenefitSections />} />
    </main>
  );
}
