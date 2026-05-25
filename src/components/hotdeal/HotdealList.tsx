"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Flame, ChevronDown, Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { DailyHotdeal } from "@/types/database";

type SortMode = "ends_at" | "price";
type PriceFilter = "all" | "5" | "10" | "20" | "50";

const AREA_FILTERS = ["전체", "강남", "홍대", "이태원"];
const PRICE_OPTIONS: { value: PriceFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "5", label: "5만원 이하" },
  { value: "10", label: "10만원 이하" },
  { value: "20", label: "20만원 이하" },
  { value: "50", label: "50만원 이하" },
];

interface Props {
  hotdeals: DailyHotdeal[];
}

function formatCountdown(endsAtISO: string, now: number): string {
  const end = new Date(endsAtISO).getTime();
  const diff = end - now;
  if (diff <= 0) return "종료됨";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}일 ${h % 24}시간 남음`;
  }
  return `${h}시간 ${m}분 남음`;
}

export function HotdealList({ hotdeals }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [sortMode, setSortMode] = useState<SortMode>("ends_at");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [areaFilter, setAreaFilter] = useState<string>("전체");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    let list = hotdeals.slice();
    if (areaFilter !== "전체") {
      list = list.filter((h) => h.club?.area === areaFilter);
    }
    if (priceFilter !== "all") {
      const max = Number(priceFilter) * 10000;
      list = list.filter((h) => h.price !== null && h.price <= max);
    }
    if (sortMode === "price") {
      list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else {
      list.sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime());
    }
    return list;
  }, [hotdeals, areaFilter, priceFilter, sortMode]);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-900 -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-1.5">
          <Flame className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
            Hot Deal Now
          </h1>
        </div>
        {(user?.role === "md" || user?.role === "admin") && (
          <Link
            href="/md/hotdeal-now"
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500 text-black text-[12px] font-black active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            핫딜 등록
          </Link>
        )}
      </header>

      {/* 지역 필터 칩 */}
      <div data-no-pull-refresh className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 touch-pan-x">
        {AREA_FILTERS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAreaFilter(a)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              areaFilter === a
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* 정렬 + 가격 필터 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSortMode(sortMode === "ends_at" ? "price" : "ends_at")}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-neutral-900 text-neutral-300 text-[12px] font-bold"
        >
          {sortMode === "ends_at" ? "마감 임박순" : "가격 낮은순"}
          <ChevronDown className="w-3 h-3" />
        </button>
        <div className="relative">
          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
            className="appearance-none bg-neutral-900 text-neutral-300 text-[12px] font-bold px-3 py-1.5 pr-7 rounded-full"
          >
            {PRICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
        </div>
      </div>

      {/* 카드 리스트 */}
      {filtered.length === 0 ? (
        (user?.role === "md" || user?.role === "admin") ? (
          <div className="text-center py-16 space-y-4">
            <div className="space-y-1">
              <p className="text-[15px] text-white font-black">🔥 핫딜이 비어있어요</p>
              <p className="text-[12px] text-neutral-500">지금 등록하면 홈에 단독 노출</p>
            </div>
            <Link
              href="/md/hotdeal-now?new=1"
              className="inline-flex items-center gap-1 px-5 py-2.5 rounded-full bg-amber-500 text-black text-[13px] font-black active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              핫딜 등록
            </Link>
          </div>
        ) : (
          <div className="text-center py-16 space-y-2">
            <p className="text-[14px] text-neutral-400">진행 중인 핫딜이 없어요</p>
            <p className="text-[11px] text-neutral-600">조건을 바꿔보거나 잠시 후 다시 확인해주세요</p>
          </div>
        )
      ) : (
        <div className="divide-y divide-neutral-800/60 -mx-0">
          {filtered.map((h) => (
            <HotdealCard key={h.id} hotdeal={h} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function HotdealCard({ hotdeal: h, now }: { hotdeal: DailyHotdeal; now: number }) {
  const thumb = h.thumbnail_url || h.club?.thumbnail_url || null;
  const countdown = formatCountdown(h.ends_at, now);
  const discountPct =
    h.original_price && h.price && h.original_price > h.price
      ? Math.round((1 - h.price / h.original_price) * 100)
      : null;

  return (
    <Link
      href={`/hotdeal/${h.id}`}
      className="flex gap-3 py-4 border-b border-neutral-800/60 active:opacity-70 transition-opacity"
    >
      {/* 썸네일 */}
      <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-neutral-800 shrink-0">
        {thumb ? (
          <Image src={thumb} alt={h.title} fill sizes="112px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-white/30">
            {h.club?.name?.charAt(0) ?? "?"}
          </div>
        )}
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div className="space-y-1">
          <p className="text-white font-black text-[15px] leading-snug line-clamp-2">
            {h.title}
          </p>
          <p className="text-neutral-500 text-[12px]">
            {h.club?.area ?? ""}
            {h.nearest_station && <>{h.club?.area ? " · " : ""}{h.nearest_station}역</>}
            {h.walk_minutes && <> 도보 {h.walk_minutes}분</>}
          </p>
        </div>

        {/* 주류 + 테이블 구성 태그 */}
        {((h.liquor_includes?.length ?? 0) > 0 || (h.table_features?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {[...(h.liquor_includes ?? []), ...(h.table_features ?? [])].slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded text-[10px] font-bold">
                {tag}
              </span>
            ))}
            {((h.liquor_includes?.length ?? 0) + (h.table_features?.length ?? 0)) > 3 && (
              <span className="px-1.5 py-0.5 text-neutral-600 text-[10px]">
                +{((h.liquor_includes?.length ?? 0) + (h.table_features?.length ?? 0)) - 3}
              </span>
            )}
          </div>
        )}

        <div className="space-y-0.5 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 text-[11px] font-black inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {countdown}
            </span>
          </div>
          {h.price !== null && (
            <div className="text-right">
              {discountPct && h.original_price && (
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-[11px] font-black text-red-400">{discountPct}%</span>
                  <span className="text-[11px] text-neutral-500 line-through">
                    {h.original_price.toLocaleString()}원
                  </span>
                </div>
              )}
              <span className="text-[17px] font-black text-white">
                {h.price.toLocaleString()}원
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
