"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
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
  /**
   * 실제 발행 시각(ISO). 이걸 기준으로 24시간 동안 NEW 리본이 붙는다.
   *
   * slug(발행일)로 대신하지 않는 이유: slug 는 날짜뿐이라 그 날 00시가 기준이
   * 되고, 목요일 저녁에 올리면 반나절이 그냥 날아간다.
   */
  publishedAt?: string;
  /**
   * 표지 이미지 안에 이미 제목이 박혀 있는 호. 이때 카드가 제목을 또 그리면
   * 같은 말이 두 번 보이고, 글자를 읽히게 하려고 깔던 어두운 막이 표지의
   * 밝은 종이색을 회색으로 더럽힌다. 그래서 막과 제목을 둘 다 그리지 않는다.
   */
  coverHasTitle?: boolean;
}

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * "발행 24시간 안인가"를 **마운트 뒤에** 판정한다.
 *
 * 서버에서 계산하면 빌드·캐시 시점에 박제돼서 24시간이 지나도 리본이 안
 * 사라진다. 첫 렌더는 무조건 false 로 두고(서버·클라이언트 HTML 이 같아야
 * 하이드레이션이 깨지지 않는다) 마운트 후에 켠다.
 */
function useFreshSlugs(issues: WeeklyIssueCard[]): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  // 의존성은 발행 시각 목록으로 잡는다 — issues 배열은 매 렌더 새로 만들어져
  // 그대로 넣으면 effect 가 끝없이 돈다.
  const stamps = issues.map((i) => `${i.slug}:${i.publishedAt ?? ""}`).join("|");

  useEffect(() => {
    const now = Date.now();
    const next = new Set<string>();
    let soonest = Infinity;

    for (const i of issues) {
      if (!i.publishedAt) continue;
      const at = Date.parse(i.publishedAt);
      if (Number.isNaN(at)) continue;
      const left = at + NEW_WINDOW_MS - now;
      if (left > 0) {
        next.add(i.slug);
        soonest = Math.min(soonest, left);
      }
    }

    setFresh(next);
    if (next.size === 0) return;

    // 보고 있는 동안 24시간이 지나면 그 자리에서 떼어낸다
    const t = window.setTimeout(() => {
      setFresh((prev) => {
        const after = new Set(prev);
        for (const i of issues) {
          if (!i.publishedAt) continue;
          if (Date.parse(i.publishedAt) + NEW_WINDOW_MS <= Date.now()) after.delete(i.slug);
        }
        return after;
      });
    }, soonest + 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamps]);

  return fresh;
}

/**
 * 우측 상단 대각선 NEW 리본.
 *
 * ⚠️ 전역 CSS 클래스를 쓰지 않고 인라인 스타일로 박는다. globals.css 에 넣었더니
 * 규칙은 멀쩡한데 브라우저에 적용이 안 돼 `<i>NEW</i>` 가 기울임 글씨로 카드
 * 왼쪽 아래에 그냥 흘러나왔다(캐시인지 레이어인지 특정 못 함). 인라인은 그런
 * 경로가 없다. 광택 애니메이션만 keyframes 가 필요해 전역에 남긴다 —
 * 그게 안 와도 리본 자체는 그대로 보인다.
 */
function NewRibbon() {
  return (
    <span
      aria-label="새 호"
      style={{
        position: "absolute", top: 0, right: 0, width: 124, height: 124,
        overflow: "hidden", zIndex: 3, pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute", display: "block", width: 190, top: 30, right: -46,
          padding: "8px 0", textAlign: "center", transform: "rotate(45deg)",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 15, fontWeight: 700, fontStyle: "normal", letterSpacing: "0.22em",
          color: "#fff", background: "#FF4A3D",
          boxShadow: "0 3px 12px rgba(0,0,0,.45)", overflow: "hidden",
        }}
      >
        NEW
        <span
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            background:
              "linear-gradient(100deg,transparent 18%,rgba(255,255,255,.6) 50%,transparent 82%)",
            transform: "translateX(-130%)",
            animation: "nf-rib-sweep 2.8s cubic-bezier(.4,0,.2,1) infinite",
          }}
        />
      </span>
    </span>
  );
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
  // 훅은 조건부 return 보다 먼저 — 호가 0개가 되는 순간 훅 개수가 달라지면 터진다
  const fresh = useFreshSlugs(issues);

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
                {fresh.has(issue.slug) && <NewRibbon />}
                {!issue.coverHasTitle && (
                  <>
                    {/* 사진 위 글씨가 읽히려면 아래쪽을 확실히 덮어야 한다 */}
                    <span
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(transparent 22%, rgba(8,8,10,.78) 60%, rgba(8,8,10,.97) 100%)",
                      }}
                    />
                    <span className="absolute left-[13px] right-[13px] bottom-[11px]">
                      {/* 포스터 활자와 같은 명조로 간다 — 아티클은 매거진이고,
                          카드 제목이 앱 UI 고딕이면 그 톤이 끊긴다 */}
                      <span
                        className="block text-[20px] leading-[1.26] tracking-[-0.022em] text-[#FAF9F7] whitespace-pre-line"
                        style={{ fontFamily: "var(--font-serif-kr), serif", fontWeight: 800 }}
                      >
                        {issue.title}
                      </span>
                    </span>
                  </>
                )}
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
