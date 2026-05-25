"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface HotPlaceItem {
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
  md_count: number;
  hotdeal_text?: string;
}

const MAX_CARDS = 12;
const HIDDEN_PATTERN = /운영자/;

export function HotdealHomeSection() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HotPlaceItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // KST 기준 오늘 요일 + 이번 주 월요일
      const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const dowIdx = kstNow.getUTCDay();
      const DOW_KEYS_KST = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
      const todayDowKey = DOW_KEYS_KST[dowIdx];
      const daysFromMonday = dowIdx === 0 ? 6 : dowIdx - 1;
      const thisMonday = new Date(kstNow);
      thisMonday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
      const thisWeekISO = thisMonday.toISOString().slice(0, 10);

      // 1) 클럽 + partners 카운트 (MD 많은 순)
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
      const filtered = rows.filter((c) => !HIDDEN_PATTERN.test(c.name));

      // MD 카운트 desc, 같은 카운트면 이름 asc
      filtered.sort((a, b) => {
        const ma = a.club_partners?.length ?? 0;
        const mb = b.club_partners?.length ?? 0;
        if (mb !== ma) return mb - ma;
        return a.name.localeCompare(b.name);
      });

      const topClubs = filtered.slice(0, MAX_CARDS);
      const topIds = topClubs.map((c) => c.id);
      if (topIds.length === 0) {
        if (!cancelled) setItems([]);
        return;
      }

      // 2) 이번 주 슬롯 (오늘 요일 키 매칭)
      const { data: slots } = await supabase
        .from("weekly_hotdeal_slots")
        .select("club_id, benefits_by_dow, expires_at")
        .eq("week_start", thisWeekISO)
        .in("club_id", topIds);

      const now = new Date();
      type SlotRow = {
        club_id: string;
        benefits_by_dow: Record<string, string | undefined> | null;
        expires_at: string;
      };
      const slotMap = new Map<string, string>();
      for (const s of ((slots ?? []) as unknown as SlotRow[])) {
        if (new Date(s.expires_at) <= now) continue;
        const text = (s.benefits_by_dow ?? {})[todayDowKey];
        if (text && text.trim().length > 0) {
          slotMap.set(s.club_id, text);
        }
      }

      const out: HotPlaceItem[] = topClubs.map((c) => ({
        club_id: c.id,
        club_name: c.name,
        club_area: c.area,
        club_thumbnail: c.thumbnail_url,
        md_count: c.club_partners?.length ?? 0,
        hotdeal_text: slotMap.get(c.id),
      }));

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
        <h2 className="text-[16px] font-black text-white flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-amber-400" />
          오늘의 HOT PLACE
        </h2>
        <Link
          href="/clubs?view=list"
          className="text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-center gap-0.5"
        >
          핫딜 보기
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x pb-1 -mx-4 px-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {items.map((item) => {
          const hasHotdeal = !!item.hotdeal_text;
          return (
            <Link
              key={item.club_id}
              href={`/clubs/${item.club_id}`}
              className={`flex-shrink-0 w-[64%] max-w-[260px] snap-start snap-always bg-[#1C1C1E] rounded-2xl overflow-hidden active:scale-[0.98] transition-transform ${
                hasHotdeal ? "border border-amber-500/40" : "border border-neutral-800"
              }`}
            >
              <div className="relative h-36 bg-neutral-900">
                {item.club_thumbnail ? (
                  <Image
                    src={item.club_thumbnail}
                    alt={item.club_name}
                    fill
                    sizes="260px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-white/30">
                    {item.club_name.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
                {hasHotdeal && (
                  <div className="absolute top-2 left-2 bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                    🔥 HOT DEAL
                  </div>
                )}
                <div className="absolute left-2 bottom-1.5 right-2">
                  <p className="text-white font-black text-[14px] truncate">
                    {item.club_name}
                  </p>
                  <p className="text-neutral-300 text-[10px]">
                    {item.club_area ?? "기타"}
                  </p>
                </div>
              </div>
              {hasHotdeal && (
                <div className="px-3 py-2">
                  <p className="text-amber-300 text-[12px] font-bold leading-snug line-clamp-2">
                    {item.hotdeal_text}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
