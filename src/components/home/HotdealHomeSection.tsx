"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tableZoneLabel, normalizeDowSlots, summarizeSlots, getActiveWeekStartISO, getBusinessDowKey } from "@/lib/utils/hotdeal";
import type { HotdealTableZone, HotdealBenefitsByDow, HotdealDow } from "@/types/database";

interface HotPlaceItem {
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
  md_count: number;
  hotdeal_text?: string;
  hotdeal_id?: string;
  hotdeal_price?: number | null;
  hotdeal_original_price?: number | null;
  hotdeal_ends_at?: string;
  hotdeal_table_zone?: HotdealTableZone | null;
}

function formatCountdownShort(endsAtISO: string, now: number): string {
  const diff = new Date(endsAtISO).getTime() - now;
  if (diff <= 0) return "종료됨";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}일 ${h % 24}시간`;
  }
  if (h >= 1) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const MAX_CARDS = 12;
const HIDDEN_PATTERN = /운영자/;
// 비프로덕션(dev/preview)에선 테스트 클럽도 노출 (admin 슬롯 디버깅용)
const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";


export function HotdealHomeSection() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HotPlaceItem[] | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 활성 핫딜 먼저 조회 (미만료)
      const { data: deals } = await supabase
        .from("daily_hotdeals")
        .select("id, club_id, title, thumbnail_url, ends_at, price, original_price, table_zone")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString());

      type DealRow = {
        id: string;
        club_id: string;
        title: string;
        thumbnail_url: string | null;
        ends_at: string;
        price: number | null;
        original_price: number | null;
        table_zone: HotdealTableZone | null;
      };
      const dealList = ((deals ?? []) as unknown as DealRow[]);

      // 2) 클럽 + partners 카운트
      const { data: clubs, error: clubsErr } = await supabase
        .from("clubs")
        .select("id, name, area, thumbnail_url, club_partners(md_id)")
        .is("deleted_at", null);
      if (clubsErr || cancelled) return;

      type ClubRow = {
        id: string;
        name: string;
        area: string | null;
        thumbnail_url: string | null;
        club_partners: { md_id: string }[] | null;
      };
      const rows = (clubs ?? []) as unknown as ClubRow[];

      // 테스트/숨김 클럽 제외 (프로덕션에서만 적용)
      const filteredAll = SHOW_TEST_CLUBS ? rows : rows.filter((c) => !HIDDEN_PATTERN.test(c.name));
      const clubsById = new Map(filteredAll.map((c) => [c.id, c]));

      // 노출 가능한 클럽에 속한 핫딜만 (테스트 클럽 핫딜은 프로덕션에서 제외)
      const visibleDeals = dealList.filter((d) => clubsById.has(d.club_id));

      // 클럽당 1개만 노출: 같은 클럽이면 가장 임박한 핫딜 1개로 추림
      const dealByClub = new Map<string, DealRow>();
      for (const d of visibleDeals) {
        const prev = dealByClub.get(d.club_id);
        if (!prev || new Date(d.ends_at) < new Date(prev.ends_at)) {
          dealByClub.set(d.club_id, d);
        }
      }
      const dedupedDeals = [...dealByClub.values()];

      // 핫딜 있을 때: 클럽당 1개, 새로고침마다 셔플 (게시자 동등)
      // 핫딜 0개일 때: 클럽 단위 폴백
      let out: HotPlaceItem[] = [];
      if (dedupedDeals.length > 0) {
        // Fisher-Yates shuffle
        for (let i = dedupedDeals.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [dedupedDeals[i], dedupedDeals[j]] = [dedupedDeals[j], dedupedDeals[i]];
        }
        out = dedupedDeals.slice(0, MAX_CARDS).map((d) => {
          const c = clubsById.get(d.club_id)!;
          return {
            club_id: c.id,
            club_name: c.name,
            club_area: c.area,
            club_thumbnail: d.thumbnail_url || c.thumbnail_url,
            md_count: c.club_partners?.length ?? 0,
            hotdeal_text: d.title,
            hotdeal_id: d.id,
            hotdeal_price: d.price,
            hotdeal_original_price: d.original_price,
            hotdeal_ends_at: d.ends_at,
            hotdeal_table_zone: d.table_zone ?? null,
          };
        });
      } else {
        // 핫딜 0개 → 폴백. 게스트 간판(오늘 혜택) 클럽은 "오늘 어디갈래?" 전용이므로
        // 여기서는 후순위로 밀어 둔다 (제외가 아니라 정렬 우선순위만 뒤로 → 채울 클럽이
        // 부족하면 간판 클럽이 뒤에서 채워져 섹션이 비지 않음).
        const thisWeekISO = getActiveWeekStartISO();
        const todayDowKey = getBusinessDowKey();
        const { data: slots } = await supabase
          .from("weekly_hotdeal_slots")
          .select("club_id, benefits_by_dow, expires_at")
          .eq("week_start", thisWeekISO);
        if (cancelled) return;
        const benefitClubIds = new Set<string>();
        for (const s of (slots ?? []) as Array<{
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
          const hasBenefit =
            !!summarizeSlots(todaySlots) ||
            todaySlots.some((slot) => (slot.benefits ?? []).length > 0);
          if (hasBenefit) benefitClubIds.add(s.club_id);
        }

        // 테스트 클럽(개발) → 간판 없는 클럽 → MD 카운트 desc → 이름 asc, 간판 클럽은 후순위
        const fallback = [...filteredAll].sort((a, b) => {
          const at = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(a.name) ? 1 : 0;
          const bt = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(b.name) ? 1 : 0;
          if (at !== bt) return bt - at;
          const ab = benefitClubIds.has(a.id) ? 1 : 0; // 게스트 간판 클럽은 후순위
          const bb = benefitClubIds.has(b.id) ? 1 : 0;
          if (ab !== bb) return ab - bb;
          const ma = a.club_partners?.length ?? 0;
          const mb = b.club_partners?.length ?? 0;
          if (mb !== ma) return mb - ma;
          return a.name.localeCompare(b.name);
        });
        out = fallback.slice(0, MAX_CARDS).map((c) => ({
          club_id: c.id,
          club_name: c.name,
          club_area: c.area,
          club_thumbnail: c.thumbnail_url,
          md_count: c.club_partners?.length ?? 0,
        }));
      }

      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[20px] font-black text-foreground flex items-center gap-0.5 tracking-tight">
          <span className="text-[20px]">🔥</span>
          Hot Deal Tonight
        </h2>
        <Link
          href="/hotdeal"
          className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5"
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
        {items.map((item) => {
          const hasHotdeal = !!item.hotdeal_text;
          const zoneLabel = tableZoneLabel(item.hotdeal_table_zone);
          return (
            <Link
              key={item.hotdeal_id ?? item.club_id}
              href={item.hotdeal_id ? `/hotdeal/${item.hotdeal_id}` : `/clubs/${item.club_id}`}
              className="flex-shrink-0 w-[44%] max-w-[180px] snap-start snap-always active:scale-[0.98] transition-transform"
            >
              {/* 이미지 */}
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-card border border-border">
                {item.club_thumbnail ? (
                  <Image
                    src={item.club_thumbnail}
                    alt={`${item.club_area ? `${item.club_area} ` : ""}${item.club_name} 핫딜·게스트 간판`}
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
                {hasHotdeal && (
                  <>
                    {/* 상단 검정 띠: FOMO 카피 */}
                    <div className="absolute top-0 inset-x-0 bg-black/70 backdrop-blur-sm px-2 py-1 flex items-center justify-center">
                      <span className="text-foreground text-[10px] font-black tracking-tight">선착순 마감</span>
                    </div>
                    {/* 하단 그라데이션 + 남은 시간 */}
                    {item.hotdeal_ends_at && (
                      <>
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/80 to-transparent" />
                        <div className="absolute bottom-1.5 left-2 inline-flex items-center gap-1 text-brand-amber text-[11px] font-black drop-shadow">
                          <Clock className="w-3 h-3" />
                          {formatCountdownShort(item.hotdeal_ends_at, now)} 남음
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* 텍스트 */}
              <div className="mt-2 px-0.5 space-y-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-foreground font-bold text-[13px] truncate leading-tight">
                    {item.club_name}
                  </p>
                  {zoneLabel && (
                    <span className="shrink-0 bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-md leading-none">
                      {zoneLabel}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-[11px]">
                  {item.club_area ?? "기타"}
                </p>
                {item.hotdeal_price != null && (
                  <div className="pt-0.5">
                    {item.hotdeal_original_price && item.hotdeal_original_price > item.hotdeal_price && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-black text-red-400">
                          {Math.round((1 - item.hotdeal_price / item.hotdeal_original_price) * 100)}%
                        </span>
                        <span className="text-[11px] text-muted-foreground line-through">
                          {item.hotdeal_original_price.toLocaleString()}원
                        </span>
                      </div>
                    )}
                    <span className="text-[15px] font-black text-foreground">
                      {item.hotdeal_price.toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
