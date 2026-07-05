"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { DrinkMenuViewer } from "@/components/clubs/DrinkMenuViewer";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { type Lang, makeT, areaLabel as areaI18n } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { trackForeignEvent } from "@/lib/analytics/events";

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

// 로그인 후 깃발 폼으로 복귀하는 링크. 미로그인이면 폼 서버 컴포넌트가 자동으로 /login?redirect= 로 튕김.
function buildFlagHref(lang: Lang, area?: string) {
  const params = new URLSearchParams();
  params.set("lang", lang);
  if (area) params.set("area", area);
  return `/flags/new?${params.toString()}`;
}

type SortKey = "popular" | "rating";

export function ClubsClient({ clubs, lang = "en" }: { clubs: Club[]; lang?: Lang }) {
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("popular");
  const t = makeT(lang);

  // 랜딩 노출 이벤트 — 이탈퍼널 1단계 (외국인 트랙 진입 총량)
  useEffect(() => {
    if (lang === "ko") return;
    // 현재 경로에서 area 세그먼트 추출 (/{lang}/clubs/{area} → {area})
    const seg = typeof window !== "undefined" ? window.location.pathname.split("/") : [];
    const areaSlug = seg[3] ?? null;
    trackForeignEvent("foreign_clubs_view", { area: areaSlug, source: "seo" });
  }, [lang]);

  // 스크롤 25%/50%/75% 도달 이벤트 — 이탈 지점 세분화 (외국인 트랙 UX 진단)
  // 세션당 각 지점 1회씩만 발동. sessionStorage로 중복 방지.
  useEffect(() => {
    if (lang === "ko" || typeof window === "undefined") return;
    const KEY_PREFIX = "nf_foreign_scroll_";
    const thresholds = [25, 50, 75];
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const totalScrollable = doc.scrollHeight - window.innerHeight;
        if (totalScrollable <= 0) { ticking = false; return; }
        const scrolled = window.scrollY / totalScrollable;
        for (const th of thresholds) {
          if (scrolled >= th / 100) {
            const key = KEY_PREFIX + th;
            try {
              if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, "1");
                trackForeignEvent("foreign_clubs_view", { scroll_depth: th, source: "scroll" });
              }
            } catch { /* private mode */ }
          }
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lang]);

  // 정렬: 인기순(리뷰 수) 기본 / 평점순
  const sorted = useMemo(() => {
    const arr = [...clubs];
    if (sortKey === "rating") {
      arr.sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0));
    } else {
      arr.sort((a, b) => (b.google_review_count ?? 0) - (a.google_review_count ?? 0));
    }
    return arr;
  }, [clubs, sortKey]);
  // 강남/홍대/이태원 가로 스크롤 (한국 가이드처럼). 해당 지역 클럽 없으면 섹션 생략.
  const groups = ["강남", "홍대", "이태원"]
    .map((ko) => ({ ko, items: sorted.filter((c) => c.area === ko) }))
    .filter((g) => g.items.length > 0);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  const homeHref = lang === "ko" ? "/" : `/${lang}`;
  const bottomCtaHref = buildFlagHref(lang);
  const guideTitle = t("서울 클럽 가이드", "Seoul Club Guide", "ソウル クラブガイド", "首尔夜店指南");
  const clubsSuffix = t("곳", "clubs", "軒", "家");
  const noClubs = t("등록된 클럽이 없습니다.", "No clubs found.", "登録されたクラブがありません。", "暂无登记的夜店。");
  const noImage = t("이미지 없음", "No image", "画像なし", "无图片");
  const notSureCopy = t("어디로 갈지 모르겠나요?", "Not sure where to go?", "どこに行くか迷っていますか？", "不知道去哪家?");
  const ctaLabel = t(
    "🚩 깃발 꽂기 — 클럽이 오퍼 보내요",
    "🚩 Plant your flag — clubs send you VIP offers",
    "🚩 旗を立てる — クラブがVIPオファーを送ります",
    "🚩 插旗 — 夜店主动发送 VIP 报价",
  );
  const ctaSubLine1 = t(
    "날짜·인원·예산만 알려주세요.",
    "Tell us your date, budget, and group size.",
    "日付・人数・予算を教えてください。",
    "告诉我们日期、预算和人数。",
  );
  const ctaSubLine2 = t(
    "서울 주요 클럽들이 시크릿오퍼를 보내요. 당신이 골라요.",
    "Top Seoul clubs send you private VIP offers. You pick.",
    "ソウルの人気クラブがプライベートVIPオファーを送ります。あなたが選ぶ。",
    "首尔顶级夜店发来专属 VIP 报价，任你挑选。",
  );
  const googleReviewsLabel = t("구글 리뷰", "Google reviews", "Googleレビュー", "谷歌评价");
  const searchReviewsLabel = t("구글에서 리뷰 검색", "Search reviews on Google", "Googleでレビュー検索", "在谷歌搜索评价");
  const bookAtClubLabel = (name: string) =>
    t(
      `🚩 ${name} 예약하기`,
      `🚩 Book ${name} on NightFlow`,
      `🚩 ${name}をNightFlowで予約`,
      `🚩 在 NightFlow 预订 ${name}`,
    );
  const sortPopularLabel = t("인기순", "Popular", "人気順", "热门");
  const sortRatingLabel = t("평점순", "Top rated", "評価順", "评分");
  const stickyCtaLabel = t(
    "🚩 시크릿오퍼 받기",
    "🚩 Get VIP offers",
    "🚩 VIPオファーを受け取る",
    "🚩 获取 VIP 报价",
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* pb-24: Sticky CTA 높이만큼 하단 여백 */}
      <div className="max-w-lg mx-auto px-4 py-12 pb-24 space-y-6">

        {/* Header */}
        <header className="space-y-3">
          <Link href={homeHref} className="inline-block text-[13px] text-neutral-500 hover:text-white transition-colors">
            ← NightFlow
          </Link>
          <div className="space-y-1">
            <h1 className="text-[28px] font-black tracking-tight">{guideTitle}</h1>
            <p className="text-[13px] text-neutral-500">{shownCount} {clubsSuffix}</p>
          </div>

          {/* 정렬 버튼 (인기순=구글 리뷰수 default / 평점순=구글 별점) */}
          {shownCount > 0 && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSortKey("popular");
                  if (lang !== "ko") {
                    trackForeignEvent("foreign_clubs_view", { sort_change: "popular", source: "sort" });
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                  sortKey === "popular"
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {sortPopularLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortKey("rating");
                  if (lang !== "ko") {
                    trackForeignEvent("foreign_clubs_view", { sort_change: "rating", source: "sort" });
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                  sortKey === "rating"
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {sortRatingLabel}
              </button>
            </div>
          )}
        </header>

        {/* 지역별 가로 스크롤 (한국 가이드처럼 강남/홍대 두 줄) */}
        {shownCount === 0 && (
          <p className="text-center text-neutral-500 py-12">{noClubs}</p>
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
                  onClick={() => {
                    setSelectedClub(club);
                    if (lang !== "ko") {
                      trackForeignEvent("foreign_club_card_click", {
                        area: club.area,
                        club_id: club.id,
                        club_name: club.name,
                      });
                    }
                  }}
                  className="shrink-0 w-[140px] snap-start text-left active:opacity-70 transition-opacity"
                >
                  <div className="relative w-[140px] h-[140px] rounded-2xl overflow-hidden bg-neutral-800 border border-neutral-800">
                    {club.thumbnail_url ? (
                      <Image src={club.thumbnail_url} alt={club.name} fill className="object-cover" sizes="140px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[11px] font-bold">{noImage}</div>
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

        {/* Bottom CTA — 로그인 벽 대신 폼 먼저. 미로그인이면 /flags/new 서버가 /login?redirect= 로 튕김 */}
        <div className="space-y-4 pt-4 pb-8">
          <p className="text-center text-[14px] text-neutral-400">{notSureCopy}</p>
          <Link
            href={bottomCtaHref}
            onClick={() => {
              if (lang !== "ko") {
                trackForeignEvent("foreign_plant_flag_click", { source: "bottom_cta" });
              }
            }}
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            {ctaLabel}
          </Link>
          <p className="text-center text-[12px] text-neutral-600 leading-relaxed">
            {ctaSubLine1}<br />
            {ctaSubLine2}
          </p>
          <div className="flex justify-center pt-2">
            <LangSwitcher />
          </div>
        </div>
      </div>

      {/* Sticky CTA — 유저가 스크롤 안 해도 항상 보이도록 fixed. 외국인 트랙만. */}
      {lang !== "ko" && shownCount > 0 && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 px-4 pb-4 pt-6 pointer-events-none
                     bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] via-[60%] to-transparent"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          <div className="max-w-lg mx-auto pointer-events-auto">
            <Link
              href={bottomCtaHref}
              onClick={() =>
                trackForeignEvent("foreign_plant_flag_click", { source: "sticky_cta" })
              }
              className="flex items-center justify-center gap-1.5 w-full h-12
                         bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px]
                         rounded-full shadow-lg shadow-black/40 transition-colors active:scale-[0.98]"
            >
              {stickyCtaLabel}
            </Link>
          </div>
        </div>
      )}

      {/* 클럽 상세 바텀시트 (카드 클릭 시) — 가격표·영업시간·평점 + 구글 리뷰 + 예약 CTA */}
      <Sheet open={!!selectedClub} onOpenChange={(o) => !o && setSelectedClub(null)}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          {selectedClub && (() => {
            const club = selectedClub;
            const hasDrinkMenu = club.drink_menu_url || (club.drink_menu_urls && club.drink_menu_urls.length > 0);
            const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, lang);
            const clubFlagHref = buildFlagHref(lang, club.area);
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
                        <span className="text-neutral-500">· {club.google_review_count.toLocaleString()} {googleReviewsLabel} →</span>
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

                  {/* 예약 CTA — 카드 클릭 유저를 구글로 내보내지 않고 깃발 폼으로 유도 */}
                  <Link
                    href={clubFlagHref}
                    onClick={() => {
                      if (lang !== "ko") {
                        trackForeignEvent("foreign_book_at_club_click", {
                          area: club.area,
                          club_id: club.id,
                          club_name: club.name,
                        });
                      }
                      setSelectedClub(null);
                    }}
                    className="flex items-center justify-center gap-1.5 w-full mt-2 py-3.5 rounded-xl bg-white text-black font-black text-[15px] hover:bg-neutral-200 transition-colors"
                  >
                    {bookAtClubLabel(club.name)}
                  </Link>

                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-[14px] font-bold text-neutral-200 hover:bg-neutral-700/60 transition-colors"
                  >
                    🔍 {searchReviewsLabel}
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
