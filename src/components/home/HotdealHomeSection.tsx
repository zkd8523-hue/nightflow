"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface HotdealItem {
  club_id: string;
  benefit_text: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
}

export function HotdealHomeSection() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HotdealItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // KST 기준 오늘 날짜
      const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayKstISO = kstNow.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("weekly_hotdeal_slots")
        .select("club_id, benefit_text, expires_at, clubs(name, area, thumbnail_url)")
        .eq("slot_date", todayKstISO)
        .not("benefit_text", "is", null);
      if (error || cancelled) return;

      const now = new Date();
      type SlotRow = {
        club_id: string;
        benefit_text: string | null;
        expires_at: string;
        clubs: { name: string; area: string | null; thumbnail_url: string | null } | null;
      };
      const rows = (data ?? []) as unknown as SlotRow[];
      const out: HotdealItem[] = [];
      for (const r of rows) {
        if (!r.benefit_text || !r.clubs) continue;
        if (new Date(r.expires_at) <= now) continue;
        out.push({
          club_id: r.club_id,
          benefit_text: r.benefit_text,
          club_name: r.clubs.name,
          club_area: r.clubs.area,
          club_thumbnail: r.clubs.thumbnail_url,
        });
      }
      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // 로딩 중엔 자리만 차지 (skeleton 생략 — 비어있을 때와 구분 X)
  if (items === null) return null;

  // 비어있으면 섹션 자체 숨김 (홈에서 자리 안 차지)
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[16px] font-black text-white flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-amber-400" />
          오늘의 HOT DEAL
        </h2>
        <Link
          href="/clubs"
          className="text-[11px] text-neutral-500 hover:text-white font-bold inline-flex items-center gap-0.5"
        >
          전체
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x pb-1 -mx-4 px-4"
      >
        {items.map((item) => (
          <Link
            key={item.club_id}
            href={`/clubs/${item.club_id}`}
            className="flex-shrink-0 w-[78%] max-w-[320px] snap-start snap-always bg-[#1C1C1E] rounded-2xl overflow-hidden border border-amber-500/30 active:scale-[0.98] transition-transform"
          >
            <div className="relative h-24 bg-neutral-900">
              {item.club_thumbnail ? (
                <Image
                  src={item.club_thumbnail}
                  alt={item.club_name}
                  fill
                  sizes="320px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-white/30">
                  {item.club_name.charAt(0)}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute left-2 bottom-1.5 right-2">
                <p className="text-white font-black text-[14px] truncate">
                  {item.club_name}
                </p>
                <p className="text-neutral-300 text-[10px]">{item.club_area ?? "기타"}</p>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-1.5">
                <span className="text-[12px] leading-tight">🔥</span>
                <p className="text-amber-300 text-[12px] font-bold leading-snug line-clamp-2">
                  {item.benefit_text}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
