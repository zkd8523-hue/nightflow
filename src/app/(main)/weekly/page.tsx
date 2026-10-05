import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { WEEKLY_ISSUES } from "@/lib/weekly/issues";

// 호는 코드 상수라 다시 검증할 게 없다 — 배포가 곧 발행이다.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "클러빙 뉴스 - 이번 주 클럽·공연·DJ 정리",
  description:
    "이번 주 서울·지방 클럽에서 열리는 파티와 공연, 들어볼 만한 DJ를 매주 목요일 저녁 한 통으로 정리합니다.",
  alternates: { canonical: "https://nightflow.kr/weekly" },
  openGraph: {
    title: "클러빙 뉴스 - 이번 주 클럽·공연·DJ 정리",
    description: "주말 제일 핫한 곳, 매주 깔끔하게. 나플.",
    url: "https://nightflow.kr/weekly",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

export default function WeeklyIndexPage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-10">
      <header className="mb-5">
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#DFFF00]">
          매주 목요일 저녁
        </p>
        <h1 className="text-[26px] font-black tracking-tight leading-[1.18] mt-1.5">
          클러빙 뉴스
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-2 leading-relaxed">
          주말 제일 핫한 곳, 매주 깔끔하게 정리해드릴게요
        </p>
      </header>

      {WEEKLY_ISSUES.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-6 text-center">
          <p className="text-[14px] font-bold">첫 호를 준비하고 있어요</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            목요일 저녁에 첫 호가 나갑니다
          </p>
        </div>
      ) : (
        /* 캐릿 아카이브식 격자 — 한 줄에 두 개.
           큰 카드를 세로로 쌓으면 한 호가 250px씩 먹어 52호면 13,000px가 된다.
           날짜를 카드마다 박아두면 월별 헤더를 따로 세울 필요도 없다. */
        <ul className="grid grid-cols-2 gap-x-2.5 gap-y-5">
          {WEEKLY_ISSUES.map((issue) => (
            <li key={issue.slug}>
              <Link
                href={`/weekly/${issue.slug}`}
                className="flex flex-col h-full active:scale-[0.99] transition-transform"
              >
                <span className="block rounded-lg overflow-hidden bg-card">
                  {issue.coverUrl ? (
                    <Image
                      src={issue.coverUrl}
                      alt={`${issue.volume} 표지`}
                      width={320}
                      height={180}
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <span className="block w-full aspect-video bg-muted" />
                  )}
                </span>

                {/* 제목은 두 줄까지. 길이가 제각각이면 아래 VOL 배지 줄이 들쭉날쭉해진다 */}
                <span className="block text-[12.5px] font-extrabold leading-[1.38] tracking-[-0.018em] mt-2 line-clamp-2">
                  {issue.title.replace(/\n/g, " ")}
                </span>

                {/* mt-auto 로 카드 맨 아래에 붙인다 — 제목이 한 줄이든 두 줄이든 같은 높이 */}
                <span className="flex items-center gap-1.5 mt-auto pt-[7px]">
                  <span className="font-mono text-[8.5px] font-bold bg-[#DFFF00] text-[#0A0A0A] rounded-[3px] px-[5px] py-[2px]">
                    {issue.volume}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {issue.slug.replace(/-/g, ".")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
