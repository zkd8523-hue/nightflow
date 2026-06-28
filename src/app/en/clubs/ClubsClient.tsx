"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { DrinkMenuViewer } from "@/components/clubs/DrinkMenuViewer";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { type Lang, makeT, areaLabel as areaI18n } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LangSwitcher } from "@/components/layout/LangSwitcher";

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
  const [lang, setLang] = useState<Lang>("en");
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("lang");
    setLang(l === "ja" ? "ja" : l === "zh" ? "zh" : "en");
  }, []);
  const t = makeT(lang);
  const tr = (en: string) => t("", en);
  const langQ = `?lang=${lang}`;

  // 리뷰 많은 순 정렬 (필터 없음 — 한국 가이드처럼 지역 섹션으로 보여줌)
  const sorted = useMemo(
    () => [...clubs].sort((a, b) => (b.google_review_count ?? 0) - (a.google_review_count ?? 0)),
    [clubs],
  );
  // 강남/홍대 두 줄 가로 스크롤 (한국 가이드처럼). 해당 지역 클럽 없으면 섹션 생략.
  const groups = ["강남", "홍대"]
    .map((ko) => ({ ko, items: sorted.filter((c) => c.area === ko) }))
    .filter((g) => g.items.length > 0);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-lg mx-auto px-4 py-12 space-y-6">

        {/* Header */}
        <header className="space-y-3">
          <Link href={`/en${langQ}`} className="inline-block text-[13px] text-neutral-500 hover:text-white transition-colors">
            ← NightFlow
          </Link>
          <div className="space-y-1">
            <h1 className="text-[28px] font-black tracking-tight">{tr("Seoul Club Guide")}</h1>
            <p className="text-[13px] text-neutral-500">{shownCount} {tr("clubs")}</p>
          </div>
        </header>

        {/* 지역별 가로 스크롤 (한국 가이드처럼 강남/홍대 두 줄) */}
        {shownCount === 0 && (
          <p className="text-center text-neutral-500 py-12">{tr("No clubs found.")}</p>
        )}
        {groups.map((g) => (
          <section key={g.ko} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[18px] font-black">{areaI18n(g.ko, lang)}</h2>
              <span className="text-[13px] text-neutral-500">{g.items.length}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-4 px-4">
              {g.items.map((club) => (
                <button
                  key={club.id}
                  onClick={() => setSelectedClub(club)}
                  className="shrink-0 w-[140px] snap-start text-left active:opacity-70 transition-opacity"
                >
                  <div className="relative w-[140px] h-[140px] rounded-2xl overflow-hidden bg-neutral-800 border border-neutral-800">
                    {club.thumbnail_url ? (
                      <Image src={club.thumbnail_url} alt={club.name} fill className="object-cover" sizes="140px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[11px] font-bold">{tr("No image")}</div>
                    )}
                  </div>
                  <p className="text-[13px] font-bold text-white mt-2 truncate">{club.name}</p>
                  {club.google_rating != null && (
                    <p className="text-[12px] text-amber-400 mt-0.5">⭐ {club.google_rating.toFixed(1)}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}

        {/* Bottom CTA */}
        <div className="space-y-4 pt-4 pb-8">
          <p className="text-center text-[14px] text-neutral-400">{tr("Not sure where to go?")}</p>
          <Link
            href={`/login${langQ}`}
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            {tr("✨ Get VIP offers — clubs compete to host you")}
          </Link>
          <p className="text-center text-[12px] text-neutral-600 leading-relaxed">
            {tr("Tell us your date, budget, and group size.")}<br />
            {tr("Top Seoul clubs send you private VIP offers. You pick.")}
          </p>
          <div className="flex justify-center pt-2">
            <LangSwitcher />
          </div>
        </div>
      </div>

      {/* 클럽 상세 바텀시트 (카드 클릭 시) — 가격표·영업시간·평점 + 구글 리뷰 */}
      <Sheet open={!!selectedClub} onOpenChange={(o) => !o && setSelectedClub(null)}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          {selectedClub && (() => {
            const club = selectedClub;
            const hasDrinkMenu = club.drink_menu_url || (club.drink_menu_urls && club.drink_menu_urls.length > 0);
            const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, lang);
            return (
              <div className="pb-8">
                {club.thumbnail_url && (
                  <div className="relative w-full h-48">
                    <Image src={club.thumbnail_url} alt={club.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 512px" />
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <SheetTitle className="font-black text-[20px] text-white leading-tight">{club.name}</SheetTitle>
                    <span className="shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                      {areaI18n(club.area, lang)}
                    </span>
                  </div>

                  {club.google_rating != null && (
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] text-amber-400 hover:text-amber-300 transition-colors">
                      ⭐ {club.google_rating.toFixed(1)}
                      {club.google_review_count != null && (
                        <span className="text-neutral-500">· {club.google_review_count.toLocaleString()} {tr("Google reviews")} →</span>
                      )}
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

                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full mt-1 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-[14px] font-bold text-neutral-200 hover:bg-neutral-700/60 transition-colors"
                  >
                    🔍 {tr("Search reviews on Google")}
                  </a>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
