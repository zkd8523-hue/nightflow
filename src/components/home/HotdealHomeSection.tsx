"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
        .select("id, club_id, title, thumbnail_url, ends_at, price, original_price")
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
      };
      const dealsByClub = new Map<string, DealRow>();
      for (const d of ((deals ?? []) as unknown as DealRow[])) {
        const prev = dealsByClub.get(d.club_id);
        if (!prev || new Date(d.ends_at) < new Date(prev.ends_at)) {
          dealsByClub.set(d.club_id, d);
        }
      }
      const hotdealClubIds = [...dealsByClub.keys()];

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

      // 테스트/숨김 클럽 제외
      const filteredAll = SHOW_TEST_CLUBS ? rows : rows.filter((c) => !HIDDEN_PATTERN.test(c.name));

      // 핫딜 있는 클럽 1개 이상 → 그 클럽들만 노출
      // 핫딜 0개 → 폴백으로 전체 클럽 노출 (오늘 어디갈래? 와 동일 패턴)
      let source = filteredAll;
      if (hotdealClubIds.length > 0) {
        source = filteredAll.filter((c) => hotdealClubIds.includes(c.id));
      }

      // 정렬: 핫딜 있을 때 → ends_at 임박순. 폴백일 때 → 테스트 클럽(개발) → MD 카운트 desc → 이름 asc
      if (hotdealClubIds.length > 0) {
        source.sort((a, b) => {
          const da = dealsByClub.get(a.id);
          const db = dealsByClub.get(b.id);
          if (!da || !db) return 0;
          return new Date(da.ends_at).getTime() - new Date(db.ends_at).getTime();
        });
      } else {
        source.sort((a, b) => {
          const at = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(a.name) ? 1 : 0;
          const bt = SHOW_TEST_CLUBS && HIDDEN_PATTERN.test(b.name) ? 1 : 0;
          if (at !== bt) return bt - at;
          const ma = a.club_partners?.length ?? 0;
          const mb = b.club_partners?.length ?? 0;
          if (mb !== ma) return mb - ma;
          return a.name.localeCompare(b.name);
        });
      }

      const topClubs = source.slice(0, MAX_CARDS);
      if (topClubs.length === 0) {
        if (!cancelled) setItems([]);
        return;
      }

      const out: HotPlaceItem[] = topClubs.map((c) => {
        const d = dealsByClub.get(c.id);
        return {
          club_id: c.id,
          club_name: c.name,
          club_area: c.area,
          club_thumbnail: d?.thumbnail_url || c.thumbnail_url,
          md_count: c.club_partners?.length ?? 0,
          hotdeal_text: d?.title,
          hotdeal_id: d?.id,
          hotdeal_price: d?.price,
          hotdeal_original_price: d?.original_price,
          hotdeal_ends_at: d?.ends_at,
        };
      });

      // 핫딜 있는 클럽 우선
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
        <h2 className="text-[20px] font-black text-white flex items-center gap-1.5 tracking-tight">
          <span className="text-[20px]">🔥</span>
          Hot Deal Now
        </h2>
        <Link
          href="/hotdeal"
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
        {items.map((item) => {
          const hasHotdeal = !!item.hotdeal_text;
          return (
            <Link
              key={item.club_id}
              href={item.hotdeal_id ? `/hotdeal/${item.hotdeal_id}` : `/clubs/${item.club_id}`}
              className="flex-shrink-0 w-[44%] max-w-[180px] snap-start snap-always active:scale-[0.98] transition-transform"
            >
              {/* 이미지 */}
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-900">
                {item.club_thumbnail ? (
                  <Image
                    src={item.club_thumbnail}
                    alt={item.club_name}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-white/30">
                    {item.club_name.charAt(0)}
                  </div>
                )}
                {hasHotdeal && (
                  <>
                    {/* 상단 검정 띠: FOMO 카피 */}
                    <div className="absolute top-0 inset-x-0 bg-black/70 backdrop-blur-sm px-2 py-1 flex items-center justify-center">
                      <span className="text-white text-[10px] font-black tracking-tight">선착순 마감</span>
                    </div>
                    {/* 하단 그라데이션 + 남은 시간 */}
                    {item.hotdeal_ends_at && (
                      <>
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
                        <div className="absolute bottom-1.5 left-2 inline-flex items-center gap-1 text-amber-300 text-[11px] font-black drop-shadow">
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
                <p className="text-white font-bold text-[13px] truncate leading-tight">
                  {item.club_name}
                </p>
                <p className="text-neutral-500 text-[11px]">
                  {item.club_area ?? "기타"}
                </p>
                {item.hotdeal_price != null && (
                  <div className="pt-0.5">
                    {item.hotdeal_original_price && item.hotdeal_original_price > item.hotdeal_price && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-black text-red-400">
                          {Math.round((1 - item.hotdeal_price / item.hotdeal_original_price) * 100)}%
                        </span>
                        <span className="text-[11px] text-neutral-500 line-through">
                          {item.hotdeal_original_price.toLocaleString()}원
                        </span>
                      </div>
                    )}
                    <span className="text-[15px] font-black text-white">
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
