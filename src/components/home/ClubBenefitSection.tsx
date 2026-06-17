"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeDowSlots, summarizeSlots, benefitLabel, getActiveWeekStartISO, getBusinessDowKey } from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";

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
const HIDDEN_PATTERN = /운영자/;
const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

export function ClubBenefitSection() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ClubBenefitItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const thisWeekISO = getActiveWeekStartISO();
      const todayDowKey = getBusinessDowKey();

      const [slotsRes, clubsRes, hotdealsRes, favoritesRes] = await Promise.all([
        supabase
          .from("weekly_hotdeal_slots")
          .select("club_id, benefits_by_dow, expires_at")
          .eq("week_start", thisWeekISO),
        supabase
          .from("clubs")
          .select("id, name, area, thumbnail_url, operating_hours, tags, seed_favorite_count, club_partners(md_id)")
          .is("deleted_at", null),
        // Hot Deal Now에 노출되는 클럽은 제외하기 위해 핫딜도 조회
        supabase
          .from("daily_hotdeals")
          .select("club_id")
          .eq("status", "active")
          .gt("ends_at", new Date().toISOString()),
        // 클럽별 좋아요(찜) 카운트 — 실제 row + seed_favorite_count 합산
        supabase
          .from("user_favorite_clubs")
          .select("club_id"),
      ]);

      if (cancelled) return;

      // 유효한 슬롯에서 오늘 혜택 추출
      const slotMap = new Map<string, { text: string; tags: string[] }>();
      for (const s of (slotsRes.data ?? []) as Array<{
        club_id: string;
        benefits_by_dow: HotdealBenefitsByDow | null;
        expires_at: string;
      }>) {
        if (!s.club_id) continue;
        // 노출 판정은 week_start(getActiveWeekStartISO, 월 18시 게이트 포함) 단일 기준.
        // expires_at(=다음 월 18:00, Migration 283)과 등가이므로 중복 필터는 두지 않는다.
        const todaySlots = normalizeDowSlots(
          (s.benefits_by_dow ?? {})[todayDowKey as HotdealDow]
        );
        const summary = summarizeSlots(todaySlots);
        // 오늘 슬롯의 모든 benefits를 합쳐 unique 배열로
        const tagSet = new Set<string>();
        for (const slot of todaySlots) {
          for (const b of slot.benefits ?? []) tagSet.add(b);
        }
        if (summary || tagSet.size > 0) {
          slotMap.set(s.club_id, { text: summary, tags: [...tagSet] });
        }
      }

      // Hot Deal Now에 노출되는 클럽 ID 집합
      // - 활성 핫딜이 1개 이상이면 Hot Deal Now는 "핫딜 있는 클럽만" 보임 → 그 클럽들 제외
      // - 핫딜이 0개면 Hot Deal Now는 폴백으로 "MD 카운트 상위" 노출 → 상위 3개 정도를 제외
      const activeHotdealClubIds = new Set(
        ((hotdealsRes.data ?? []) as Array<{ club_id: string }>).map((d) => d.club_id)
      );

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

      // Hot Deal Tonight가 점유하는 클럽 결정
      let hotdealOccupied: Set<string>;
      if (activeHotdealClubIds.size > 0) {
        hotdealOccupied = activeHotdealClubIds;
      } else {
        // 폴백 분기: 핫딜 0개일 때 Hot Deal Tonight은
        //   "게스트 간판(오늘 혜택) 없는 클럽 우선(MD desc) → 간판 클럽 후순위" 로
        //   최대 MAX_CARDS개 노출 (HotdealHomeSection 폴백과 동일 정렬).
        //   그 클럽들을 여기서 제외해 두 섹션 중복을 막는다.
        //   (간판 클럽은 아래 remaining에서 어차피 제외 면제되므로 실질 영향 없음)
        const fallbackOrder = [...filtered].sort((a, b) => {
          const at = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(a.name) ? 1 : 0;
          const bt = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(b.name) ? 1 : 0;
          if (at !== bt) return bt - at;
          const ab = slotMap.has(a.id) ? 1 : 0; // 게스트 간판 클럽은 후순위
          const bb = slotMap.has(b.id) ? 1 : 0;
          if (ab !== bb) return ab - bb;
          const ma = a.club_partners?.length ?? 0;
          const mb = b.club_partners?.length ?? 0;
          if (mb !== ma) return mb - ma;
          return a.name.localeCompare(b.name);
        });
        hotdealOccupied = new Set(fallbackOrder.slice(0, MAX_CARDS).map((c) => c.id));
      }

      // Hot Deal Tonight 점유 클럽 제외. 단:
      //  - 게스트 간판(오늘 혜택) 클럽은 무조건 노출 (제외 면제 → 항상 우선노출)
      //  - 비프로덕션 테스트 클럽도 면제 → 두 섹션 모두 노출
      const remaining = filtered.filter((c) => {
        if (slotMap.has(c.id)) return true;
        if (SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(c.name)) return true;
        return !hotdealOccupied.has(c.id);
      });

      // 혜택 있는 클럽 최우선 → 혜택 없는 클럽은 셔플 (Fisher-Yates)
      const withBenefit = remaining.filter((c) => slotMap.has(c.id));
      const withoutBenefit = remaining.filter((c) => !slotMap.has(c.id));
      // 혜택 유무 그룹 내에서 각각 셔플 (새로고침마다 다르게 노출)
      for (let i = withBenefit.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [withBenefit[i], withBenefit[j]] = [withBenefit[j], withBenefit[i]];
      }
      for (let i = withoutBenefit.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [withoutBenefit[i], withoutBenefit[j]] = [withoutBenefit[j], withoutBenefit[i]];
      }
      let ordered = [...withBenefit, ...withoutBenefit];

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
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[18px] font-black text-white flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🥂</span>
          오늘 어디갈래?
        </h2>
        <Link
          href="/clubs?view=list"
          className="text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-center gap-0.5"
        >
          더보기
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

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
            {/* 혜택 띠 (이미지 위 별도 영역) */}
            {item.benefit_text && (
              <div className="bg-amber-500 px-2.5 pt-1.5 pb-1 rounded-t-2xl border-b border-black/20">
                <span
                  className="block whitespace-pre-line text-black text-[13px] tracking-tight text-center leading-[1.1] line-clamp-2"
                  style={{ fontFamily: "var(--font-display-kr)" }}
                >
                  {item.benefit_text}
                </span>
              </div>
            )}

            {/* 이미지 */}
            <div
              className={`relative w-full aspect-[4/3] overflow-hidden bg-neutral-900 ${
                item.benefit_text ? "rounded-b-2xl" : "rounded-2xl"
              }`}
            >
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
                <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-white/30">
                  {item.club_name.charAt(0)}
                </div>
              )}
            </div>

            {/* 텍스트 */}
            <div className="mt-2 px-0.5 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-white font-bold text-[13px] truncate leading-tight min-w-0">
                  {item.club_name}
                </p>
                {item.fav_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500 flex-shrink-0">
                    <Heart className="w-3 h-3 fill-red-500 stroke-none" />
                    {item.fav_count}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-500">
                {item.club_area ?? "기타"}
              </p>
              {item.benefit_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.benefit_tags.slice(0, 3).map((tag) => {
                    const { label, emoji } = benefitLabel(tag);
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-black leading-none"
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
