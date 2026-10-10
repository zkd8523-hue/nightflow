"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export interface WeeklyIssueCard {
  /** URL 슬러그 — /weekly/2026-10-06 */
  slug: string;
  /** "VOL.02" */
  volume: string;
  /** "10.05 — 10.11" */
  period: string;
  /** 표지 제목. 줄바꿈은 \n 으로 */
  title: string;
  /** 표지 사진 (클럽 썸네일 등) */
  coverUrl: string | null;
  /** 카드 아래 한 줄 — "라인업 11 · DJ 57명 · 공연 11" */
  meta: string;
  /** 아직 안 나온 호 — 링크를 걸지 않는다 */
  upcoming?: boolean;
}

/**
 * 홈의 "클러빙 뉴스" 캐러셀.
 *
 * 치수는 HomeShareCarousel 과 맞춘다(w-[88%] max-w-[420px] / gap-3 /
 * snap-x proximity / -mx-2 px-2). 홈 안에서 캐러셀마다 손놀림이 달라지면
 * 같은 화면처럼 안 읽힌다.
 *
 * 호가 하나뿐일 때도 캐러셀로 둔다 — 다음 호 예고 카드가 "매주 나온다"를
 * 보여주는 자리라, 한 장만 덩그러니 있는 배너보다 낫다.
 */
export function WeeklyNewsCarousel({
  issues,
  totalCount,
}: {
  issues: WeeklyIssueCard[];
  totalCount?: number;
}) {
  if (issues.length === 0) return null;

  const total = totalCount ?? issues.filter((i) => !i.upcoming).length;

  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between mb-2 px-1">
        {/* 바로 위 "오늘의 쿠폰"(18px)과 같은 크기 — 붙어 있는 두 섹션의
            제목 크기가 다르면 아래쪽이 한 단 낮은 항목처럼 읽힌다 */}
        <h2 className="text-[18px] font-black text-foreground flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🪩</span>
          아티클
        </h2>
        <Link
          href="/weekly"
          className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5"
        >
          더보기
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div
        data-no-pull-refresh
        className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide snap-x snap-proximity
                   touch-pan-x touch-pan-y pb-1 -mx-2 px-2"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {issues.map((issue) => {
          const inner = (
            <>
              <span className="relative block rounded-2xl overflow-hidden bg-card">
                {issue.coverUrl ? (
                  <Image
                    src={issue.coverUrl}
                    alt={`${issue.volume} 표지`}
                    width={420}
                    height={236}
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="block w-full aspect-video bg-muted" />
                )}
                {/* 사진 위 글씨가 읽히려면 아래쪽을 확실히 덮어야 한다 */}
                <span
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(transparent 22%, rgba(8,8,10,.78) 60%, rgba(8,8,10,.97) 100%)",
                  }}
                />
                <span className="absolute left-[13px] right-[13px] bottom-[11px]">
                  <span className="block text-[19px] font-black leading-[1.2] tracking-[-0.028em] text-[#FAF9F7] whitespace-pre-line">
                    {issue.title}
                  </span>
                </span>
              </span>
              {/* VOL 배지는 /weekly 목록과 같은 자리·같은 모양으로 둔다 —
                  같은 호가 화면마다 다르게 생기면 매번 다시 읽어야 한다 */}
              <span className="flex items-center gap-1.5 mt-2 px-0.5">
                <span className="font-mono text-[8.5px] font-bold bg-[#DFFF00] text-[#0A0A0A] rounded-[3px] px-[5px] py-[2px] shrink-0">
                  {issue.volume}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {issue.period}
                </span>
                {!issue.upcoming && (
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {issue.slug.replace(/-/g, ".")}
                  </span>
                )}
              </span>
            </>
          );

          // 아직 안 나온 호는 누를 데가 없다 — 링크로 감싸면 빈 페이지로 보낸다
          if (issue.upcoming) {
            return (
              <div
                key={issue.slug}
                className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always block opacity-80"
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={issue.slug}
              href={`/weekly/${issue.slug}`}
              className="flex-shrink-0 w-[88%] max-w-[420px] snap-start snap-always block
                         active:scale-[0.98] transition-transform"
            >
              {inner}
            </Link>
          );
        })}

        {/* 끝 카드 — 다른 캐러셀과 같은 텍스트형 더보기 */}
        {total > issues.filter((i) => !i.upcoming).length && (
          <Link
            href="/weekly"
            className="flex-shrink-0 w-[64%] max-w-[280px] snap-start snap-always
                       flex items-center justify-center group"
            aria-label="지난 호 더보기"
          >
            <div className="text-center w-full -mt-5">
              <div className="inline-flex items-center gap-1 text-[15px] font-black text-foreground/80 group-hover:text-foreground transition-colors">
                더보기
                <ChevronRight className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">지난 호 보러가기</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
