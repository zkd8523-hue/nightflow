"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pickUpcomingBenefit, benefitLabel, getActiveWeekStartISO } from "@/lib/utils/hotdeal";
import { SEOUL_AREAS } from "@/lib/clubs/tags";
import type { HotdealBenefitsByDow } from "@/types/database";

const isSeoulArea = (area: string | null) =>
  SEOUL_AREAS.includes(area as (typeof SEOUL_AREAS)[number]);

/** 배열 순서(셔플 등)는 유지한 채 서울(강남/홍대/이태원) 클럽을 앞으로 */
function seoulFirst<T extends { area: string | null }>(arr: T[]): T[] {
  const seoul = arr.filter((c) => isSeoulArea(c.area));
  const rest = arr.filter((c) => !isSeoulArea(c.area));
  return [...seoul, ...rest];
}

interface ClubBenefitItem {
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
  benefit_text: string | null;
  benefit_tags: string[];
  md_count: number;
  fav_count: number;
}

const MAX_CARDS = 12;
const PRIORITY_GROUP_SIZE = 8;
// "오퍼 많은 그룹" 상위노출 큐레이션. 클럽 id 또는 이름(name)으로 지정.
// 여기 속한 클럽은 최상위(최대 PRIORITY_GROUP_SIZE개)로 노출되며, 이 그룹 내에서 새로고침마다 셔플.
// 비워두면 기존 혜택-우선 정렬을 그대로 사용 (비회귀).
// 아래 목록 = 누적 오퍼 수 상위 8개 클럽 (프로덕션 puzzle_offers 집계, 2026-07-01 기준).
// 하드코딩 상위노출 제거 (2026-07-10). 비워두면 혜택-우선 정렬로 폴백.
const PRIORITY_CLUBS: string[] = [];
const HIDDEN_PATTERN = /운영자/;
const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

export function ClubBenefitSection() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ClubBenefitItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const thisWeekISO = getActiveWeekStartISO();

      const [slotsRes, clubsRes, favoritesRes] = await Promise.all([
        supabase
          .from("weekly_hotdeal_slots")
          .select("club_id, benefits_by_dow, expires_at")
          .eq("week_start", thisWeekISO),
        supabase
          .from("clubs")
          .select("id, name, area, thumbnail_url, operating_hours, tags, seed_favorite_count, club_partners(md_id)")
          .is("deleted_at", null),
        // 클럽별 좋아요(찜) 카운트 — 실제 row + seed_favorite_count 합산
        supabase
          .from("user_favorite_clubs")
          .select("club_id"),
      ]);

      if (cancelled) return;

      // 이번 주 전체에서 "오늘부터 가장 가까운 다가오는 요일" 혜택 추출 (전 화면 공용 규칙).
      // 오늘 혜택이 없어도 이번 주 남은 요일 혜택을 미리 노출해 노출을 최대화한다.
      // (미래 요일은 "(금) …" 라벨 + from은 항상 "HH:00부터"로 예고, dowIdx는 날짜순 정렬 키)
      const slotMap = new Map<string, { text: string; tags: string[]; dowIdx: number }>();
      for (const s of (slotsRes.data ?? []) as Array<{
        club_id: string;
        benefits_by_dow: HotdealBenefitsByDow | null;
        expires_at: string;
      }>) {
        if (!s.club_id) continue;
        // 노출 판정은 week_start(getActiveWeekStartISO, 월 18시 게이트 포함) 단일 기준.
        const ub = pickUpcomingBenefit(s.benefits_by_dow);
        if (ub && (ub.labeledText || ub.tags.length > 0)) {
          slotMap.set(s.club_id, { text: ub.labeledText, tags: ub.tags, dowIdx: ub.dowIdx });
        }
      }

      type ClubRow = {
        id: string;
        name: string;
        area: string | null;
        thumbnail_url: string | null;
        seed_favorite_count: number | null;
        club_partners: { md_id: string }[] | null;
      };
      const rows = (clubsRes.data ?? []) as unknown as ClubRow[];

      // 클럽별 좋아요 카운트 집계 (실제 row + seed_favorite_count)
      const favCountMap: Record<string, number> = {};
      for (const f of (favoritesRes.data ?? []) as Array<{ club_id: string }>) {
        if (!f.club_id) continue;
        favCountMap[f.club_id] = (favCountMap[f.club_id] || 0) + 1;
      }
      for (const c of rows) {
        const seed = c.seed_favorite_count ?? 0;
        if (seed > 0) favCountMap[c.id] = (favCountMap[c.id] || 0) + seed;
      }
      const filtered = SHOW_TEST_CLUBS ? rows : rows.filter((c) => !HIDDEN_PATTERN.test(c.name));

      // Hot Deal Tonight 중복 제거 로직 제거 — 핫딜(daily_hotdeals) 폐기로 점유 클럽 개념이 사라짐.
      // 이제 모든 클럽이 "오늘 어디갈래?" 후보가 된다.
      const remaining = filtered;

      // 셔플 헬퍼 (Fisher-Yates) — 그룹 내 순서를 새로고침마다 랜덤화
      const shuffle = <T,>(arr: T[]): T[] => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // "오퍼 많은 그룹" 큐레이션: PRIORITY_CLUBS에 속한 클럽을 최상위(최대 8)로 →
      // 그 그룹 안에서 셔플. 큐레이션이 비어있으면 priorityGroup=[] 이라 기존 동작과 동일.
      const priorityGroup = shuffle(
        remaining.filter(
          (c) => PRIORITY_CLUBS.includes(c.id) || PRIORITY_CLUBS.includes(c.name)
        )
      ).slice(0, PRIORITY_GROUP_SIZE);
      const prioritySet = new Set(priorityGroup.map((c) => c.id));
      const rest = remaining.filter((c) => !prioritySet.has(c.id));

      // 나머지: 혜택 있는 클럽 최우선 → 파트너(MD) 지정된 클럽 → 그 외.
      // 각 그룹 안에서는 서울(강남/홍대/이태원) 클럽을 지방 클럽보다 먼저 노출.
      // 혜택 클럽은 서울 여부 다음으로 "가장 가까운 혜택 요일(dowIdx)" 오름차순(=날짜순) 정렬.
      // 같은 요일끼리, 그리고 파트너/그외 그룹 내부(서울·지방 각각)는 셔플로 공정 노출.
      const withBenefit = shuffle(rest.filter((c) => slotMap.has(c.id)));
      withBenefit.sort((a, b) => {
        const aSeoul = isSeoulArea(a.area) ? 0 : 1;
        const bSeoul = isSeoulArea(b.area) ? 0 : 1;
        if (aSeoul !== bSeoul) return aSeoul - bSeoul;
        return (slotMap.get(a.id)?.dowIdx ?? 99) - (slotMap.get(b.id)?.dowIdx ?? 99);
      });
      const noBenefit = rest.filter((c) => !slotMap.has(c.id));
      const withPartner = seoulFirst(
        shuffle(noBenefit.filter((c) => (c.club_partners?.length ?? 0) > 0))
      );
      const withoutPartner = seoulFirst(
        shuffle(noBenefit.filter((c) => (c.club_partners?.length ?? 0) === 0))
      );
      let ordered = [...priorityGroup, ...withBenefit, ...withPartner, ...withoutPartner];

      // 비프로덕션: 테스트 클럽(운영자/...)을 최상위로 끌어올림 (Hot Deal Now와 동일 패턴)
      if (SHOW_TEST_CLUBS) {
        const testClubs = ordered.filter((c) => HIDDEN_PATTERN.test(c.name));
        const others = ordered.filter((c) => !HIDDEN_PATTERN.test(c.name));
        ordered = [...testClubs, ...others];
      }
      const topClubs = ordered.slice(0, MAX_CARDS);
      if (!cancelled) {
        setItems(
          topClubs.map((c) => ({
            club_id: c.id,
            club_name: c.name,
            club_area: c.area,
            club_thumbnail: c.thumbnail_url,
            benefit_text: slotMap.get(c.id)?.text || null,
            benefit_tags: slotMap.get(c.id)?.tags ?? [],
            md_count: c.club_partners?.length ?? 0,
            fav_count: favCountMap[c.id] ?? 0,
          }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (items === null || items.length === 0) return null;

  return (
    <section className="space-y-2">
      <Link href="/clubs?view=list" className="flex items-baseline justify-between px-1">
        <h2 className="text-[18px] font-black text-foreground flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🥂</span>
          오늘 어디갈래?
        </h2>
        <span className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5">
          더보기
          <ChevronRight className="w-3 h-3" />
        </span>
      </Link>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y pb-1 -ml-2 -mr-4 pr-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {items.map((item) => (
          <Link
            key={item.club_id}
            href={`/clubs/${item.club_id}`}
            className="flex-shrink-0 w-[44%] max-w-[180px] snap-start snap-always active:scale-[0.98] transition-transform"
          >
            {/* 혜택 띠 + 이미지를 하나의 테두리로 감싸 카드 경계를 명확히 함 (라이트에서 흰 로고가 배경과 붙어 보이는 문제 방지) */}
            <div className="rounded-md border border-border overflow-hidden">
              {/* 혜택 띠 (이미지 위 별도 영역) */}
              {item.benefit_text && (
                <div className="bg-amber-500 px-2.5 pt-1.5 pb-1 border-b border-black/20">
                  <span
                    className="block whitespace-pre-line text-black text-[13px] tracking-tight text-center leading-[1.1] line-clamp-2"
                    style={{ fontFamily: "var(--font-display-kr)" }}
                  >
                    {item.benefit_text}
                  </span>
                </div>
              )}

              {/* 이미지 */}
              <div className="relative w-full aspect-[4/3] bg-card">
              {item.club_thumbnail ? (
                <Image
                  src={item.club_thumbnail}
                  alt={`${item.club_area ? `${item.club_area} ` : ""}${item.club_name} 클럽 사진`}
                  fill
                  sizes="180px"
                  className="object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-foreground/30">
                  {item.club_name.charAt(0)}
                </div>
              )}
              </div>
            </div>

            {/* 텍스트 */}
            <div className="mt-2 px-0.5 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-foreground font-bold text-[13px] truncate leading-tight min-w-0">
                  {item.club_name}
                </p>
                {item.fav_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500 flex-shrink-0">
                    <Heart className="w-3 h-3 fill-red-500 stroke-none" />
                    {item.fav_count}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {item.club_area ?? "기타"}
              </p>
              {item.benefit_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.benefit_tags.slice(0, 3).map((tag) => {
                    const { label, emoji } = benefitLabel(tag);
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30 text-[9px] font-black leading-none"
                      >
                        {emoji && <span>{emoji}</span>}
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
