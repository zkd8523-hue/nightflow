"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { DrinkMenuViewer } from "@/components/clubs/DrinkMenuViewer";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";

const AREA_EN: Record<string, string> = {
  강남: "Gangnam",
  홍대: "Hongdae",
  이태원: "Itaewon",
  건대: "Konkuk",
  부산: "Busan",
  대구: "Daegu",
  인천: "Incheon",
  광주: "Gwangju",
  대전: "Daejeon",
  울산: "Ulsan",
  세종: "Sejong",
};

// 외국인에게 의미 있는 지역만 필터 칩으로 노출 (나머지는 "All"에 포함)
const FILTER_AREAS = ["강남", "홍대", "이태원"];

type Club = {
  id: string;
  name: string;
  area: string;
  address: string | null;
  thumbnail_url: string | null;
  drink_menu_url: string | null;
  drink_menu_updated_at: string | null;
  drink_menu_urls: string[] | null;
  floor_plan_url: string | null;
  floor_plan_urls: string[] | null;
  operating_hours: string | null;
  entry_fee_detail: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  instagram: string | null;
};

export function ClubsClient({ clubs }: { clubs: Club[] }) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"reviews" | "rating">("reviews");

  const filtered = useMemo(() => {
    const list = clubs.filter((c) => {
      const areaMatch = !selectedArea || c.area === selectedArea;
      const q = query.trim().toLowerCase();
      const nameMatch = !q || c.name.toLowerCase().includes(q) || (AREA_EN[c.area] ?? "").toLowerCase().includes(q);
      return areaMatch && nameMatch;
    });

    return [...list].sort((a, b) => {
      if (sort === "rating") {
        return (b.google_rating ?? 0) - (a.google_rating ?? 0);
      }
      return (b.google_review_count ?? 0) - (a.google_review_count ?? 0);
    });
  }, [clubs, selectedArea, query, sort]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-lg mx-auto px-4 py-12 space-y-6">

        {/* Header */}
        <header className="space-y-3">
          <Link href="/en" className="inline-block text-[13px] text-neutral-500 hover:text-white transition-colors">
            ← NightFlow
          </Link>
          <div className="space-y-1">
            <h1 className="text-[28px] font-black tracking-tight">Seoul clubs</h1>
            <p className="text-[13px] text-neutral-500">
              {sort === "rating" ? "Top rated" : "Most reviewed"} · {filtered.length} clubs
            </p>
          </div>
        </header>

        {/* Search */}
        <input
          type="search"
          placeholder="Search clubs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-11 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white placeholder-neutral-600 text-[14px] focus:outline-none focus:border-neutral-600 transition-colors"
        />

        {/* Area filter chips + sort */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedArea(null)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                !selectedArea ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              All
            </button>
            {FILTER_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(selectedArea === area ? null : area)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                  selectedArea === area ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {AREA_EN[area]}
              </button>
            ))}
          </div>
          <div className="flex items-center shrink-0 bg-neutral-800 rounded-full p-0.5">
            <button
              onClick={() => setSort("reviews")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                sort === "reviews" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              Reviews
            </button>
            <button
              onClick={() => setSort("rating")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                sort === "rating" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              Rating
            </button>
          </div>
        </div>

        {/* Club list */}
        <div className="space-y-4">
          {filtered.length === 0 && (
            <p className="text-center text-neutral-500 py-12">No clubs found.</p>
          )}
          {filtered.map((club) => {
            const areaLabel = AREA_EN[club.area] ?? club.area;
            const hasDrinkMenu = club.drink_menu_url || (club.drink_menu_urls && club.drink_menu_urls.length > 0);
            const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area });

            return (
              <div key={club.id} className="rounded-2xl bg-[#1C1C1E] border border-neutral-800 overflow-hidden">
                {club.thumbnail_url && (
                  <div className="relative w-full h-44">
                    <Image src={club.thumbnail_url} alt={club.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 512px" />
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-black text-[17px] leading-tight">{club.name}</h2>
                    <span className="shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                      {areaLabel}
                    </span>
                  </div>

                  {club.google_rating ? (
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] text-amber-400 hover:text-amber-300 transition-colors">
                      ⭐ {club.google_rating.toFixed(1)}
                      {club.google_review_count && (
                        <span className="text-neutral-500">· {club.google_review_count.toLocaleString()} Google reviews →</span>
                      )}
                    </a>
                  ) : (
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors">
                      See on Google Maps →
                    </a>
                  )}

                  {club.entry_fee_detail && (
                    <p className="text-[13px] text-neutral-400">🎟️ {club.entry_fee_detail}</p>
                  )}

                  {club.operating_hours && (
                    <p className="text-[13px] text-neutral-400">🕐 {club.operating_hours}</p>
                  )}

                  {club.instagram && (
                    <a href={`https://instagram.com/${club.instagram}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center text-[13px] text-blue-400 hover:text-blue-300 transition-colors">
                      @{club.instagram}
                    </a>
                  )}

                  {hasDrinkMenu && (
                    <DrinkMenuViewer
                      urls={club.drink_menu_urls ?? undefined}
                      url={club.drink_menu_url}
                      updatedAt={club.drink_menu_updated_at ?? null}
                      clubName={club.name}
                      floorPlanUrl={club.floor_plan_url}
                      floorPlanUrls={club.floor_plan_urls ?? undefined}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="space-y-4 pt-4 pb-8">
          <p className="text-center text-[14px] text-neutral-400">Not sure where to go?</p>
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            🚩 Plant a flag — clubs compete to host you
          </Link>
          <p className="text-center text-[12px] text-neutral-600 leading-relaxed">
            Tell us your date, budget, and group size.<br />
            Top Seoul clubs send you private VIP offers. You pick.
          </p>
        </div>
      </div>
    </div>
  );
}
