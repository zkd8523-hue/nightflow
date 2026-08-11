"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, ChevronLeft, ChevronDown, Info, Check } from "lucide-react";
import { ForeignClubDetailPanel, displayClubName } from "@/components/clubs/ForeignClubDetailPanel";
import { FILTER_GROUPS, makeTag } from "@/lib/clubs/tags";
import { pinFeatured } from "@/lib/clubs/foreignSort";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { type Lang, makeT, areaLabel as areaI18n } from "@/lib/i18n";
import { isFlagAreaOpen } from "@/lib/constants/areas";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { trackForeignEvent } from "@/lib/analytics/events";

type Club = {
  id: string;
  name: string;
  name_en?: string | null;
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
  dresscode: string | null;
  tags: string[] | null;
  google_reviews: GoogleReview[] | null;
  /** club_partners에 담당 MD가 있는지 — "Recommend" 정렬용 */
  has_md?: boolean;
  /** 상위노출 랭크 — 높을수록 모든 정렬에서 최상단 (Promoted Listings) */
  featured_rank?: number | null;
};

type GoogleReview = {
  author_name: string | null;
  rating: number | null;
  relative_time: string | null;
  text: string | null;
};

// 로그인 후 깃발 폼으로 복귀하는 링크. 미로그인이면 폼 서버 컴포넌트가 자동으로 /login?redirect= 로 튕김.
// clubId를 실으면 폼이 그 클럽을 미리 선택하고 여행확정 게이트도 건너뜀(page.tsx의 presetClubId).
// "Book at BADASS"를 눌렀는데 클럽 얘기가 없는 질문 화면이 뜨면 선택이 증발한 것처럼 보여 되돌아가던 이탈이 있었음.
function buildFlagHref(lang: Lang, area?: string, clubId?: string) {
  const params = new URLSearchParams();
  params.set("lang", lang);
  if (area) params.set("area", area);
  if (clubId) params.set("club", clubId);
  return `/flags/new?${params.toString()}`;
}


// recommend: 담당 MD 있는 클럽 우선 + 그 안에서 리뷰 많은 순 (컨시어지 폼 Browse 팝업과 동일 기준)
type SortKey = "recommend" | "reviews" | "rating";

export function ClubsClient({ clubs, lang = "en" }: { clubs: Club[]; lang?: Lang }) {
  // 클럽 상세 시트 — 어느 지역 캐러셀에서 열었는지(detailList)를 같이 기억해서
  // 상세 안에서 ←/→ 로 같은 캐러셀의 옆 클럽으로 바로 넘어갈 수 있게 함.
  const [detailList, setDetailList] = useState<Club[]>([]);
  const [detailIndex, setDetailIndex] = useState(0);
  const selectedClub = detailList[detailIndex] ?? null;
  const openDetail = (list: Club[], club: Club) => {
    const idx = list.findIndex((c) => c.id === club.id);
    setDetailList(list);
    setDetailIndex(idx >= 0 ? idx : 0);
  };
  const closeDetail = () => setDetailList([]);
  const hasNextDetail = detailIndex < detailList.length - 1;
  const hasPrevDetail = detailIndex > 0;
  const goPrevDetail = () => setDetailIndex((i) => Math.max(i - 1, 0));
  const goNextDetail = () => setDetailIndex((i) => Math.min(i + 1, detailList.length - 1));
  const detailTouchStartXRef = useRef<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recommend");
  const [venueType, setVenueType] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
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

  // 정렬: 추천순(MD 있는 클럽 우선+리뷰순) 기본 / 리뷰 많은순 / 평점순
  const sorted = useMemo(() => {
    const arr = [...clubs];
    arr.sort((a, b) => {
      if (sortKey === "rating") return (b.google_rating ?? 0) - (a.google_rating ?? 0);
      if (sortKey === "recommend") {
        const md = (b.has_md ? 1 : 0) - (a.has_md ? 1 : 0);
        if (md !== 0) return md;
      }
      return (b.google_review_count ?? 0) - (a.google_review_count ?? 0);
    });
    return arr;
  }, [clubs, sortKey]);
  // 세부 필터(타입·장르) — 한국 가이드(ClubFilterChips)와 동일한 단일선택 토글 방식
  const filtered = useMemo(() => {
    return sorted.filter((c) => {
      if (venueType && !c.tags?.includes(makeTag("venue_type", venueType))) return false;
      if (genre && !c.tags?.includes(makeTag("genre", genre))) return false;
      return true;
    });
  }, [sorted, venueType, genre]);
  const activeFilterCount = (venueType ? 1 : 0) + (genre ? 1 : 0);

  // 강남/홍대/이태원 가로 스크롤 (한국 가이드처럼). 해당 지역 클럽 없으면 섹션 생략.
  // featured_rank(고정 노출 위치)는 Recommend에서만 적용 — 리뷰순/평점순 등 명시적 정렬엔 미적용(공평).
  const groups = ["이태원", "강남", "홍대"]
    .map((ko) => {
      const items = filtered.filter((c) => c.area === ko);
      return { ko, items: sortKey === "recommend" ? pinFeatured(items) : items };
    })
    .filter((g) => g.items.length > 0);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  const totalCount = clubs.length;

  // 홈(EnHomeClient) 클럽 카드 클릭 시 ?club={id}로 넘어오면 해당 클럽 상세시트 자동 오픈.
  // (예전엔 #club-{id} 앵커 스크롤을 썼는데, 카드 클릭=Sheet 오픈 방식으로 바뀌며 앵커 대상이
  //  사라져 그냥 목록만 보이고 끝나던 버그 — useSearchParams 대신 window.location으로 읽어
  //  Suspense 경계 없이도 동작하게 함(이 컴포넌트의 기존 이벤트 트래킹과 동일 패턴).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clubId = new URLSearchParams(window.location.search).get("club");
    if (!clubId) return;
    const match = clubs.find((c) => c.id === clubId);
    if (!match) return;
    const ownerGroup = groups.find((g) => g.items.some((c) => c.id === clubId));
    openDetail(ownerGroup ? ownerGroup.items : [match], match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs]);

  const homeHref = lang === "ko" ? "/" : `/${lang}`;
  const bottomCtaHref = buildFlagHref(lang);
  // 검색으로 처음 들어온 외국인이 대부분인데(클럽 목록 도달 후 카드 클릭 14.5%),
  // 설명이 sr-only에만 있어 사람 눈엔 안 보였음 → 헤더 아래 짧은 안내 노출.
  const introHeadline = t(
    "클럽을 고르면 저희가 대신 예약해드려요",
    "Pick a club — we book it for you",
    "クラブを選べば、私たちが予約します",
    "选好夜店,我们帮你预订"
  );
  const introSub = t(
    "실제 가격 그대로, 중개 수수료 없음. 한국어 못해도 괜찮아요.",
    "Real prices, no broker fee. No Korean needed.",
    "実際の価格そのまま、仲介手数料なし。韓国語不要。",
    "真实价格,无中介费。不会韩语也没关系。"
  );
  const noClubs = t("등록된 클럽이 없습니다.", "No clubs found.", "登録されたクラブがありません。", "暂无登记的夜店。");
  const noImage = t("이미지 없음", "No image", "画像なし", "无图片");
  const notSureCopy = t("어디로 갈지 모르겠나요?", "Not sure where to go?", "どこに行くか迷っていますか？", "不知道去哪家?");
  const ctaLabel = t(
    "🍾 예약하기 — 클럽에 직접 연결해드려요",
    "🍾 Book with NightFlow",
    "🍾 NightFlowで予約する",
    "🍾 通过 NightFlow 预订",
  );
  const ctaSubLine1 = t(
    "날짜·인원·예산만 알려주세요.",
    "Tell us your date, budget, and group size.",
    "日付・人数・予算を教えてください。",
    "告诉我们日期、预算和人数。",
  );
  const ctaSubLine2 = t(
    "원하는 클럽을 골라주시면 저희가 직접 연결해드려요.",
    "Pick your clubs — we contact them and lock in your table.",
    "希望のクラブを選んでください。私たちが直接連絡してテーブルを確保します。",
    "选好想去的夜店，我们会直接联系并为你锁定桌位。",
  );
  // 클럽명 대신 지역명 사용. 이유: 예약 클릭 시 area 프리셀렉트한 깃발 폼으로 이동하고,
  // 외국인=컨시어지 모델: 유저가 찍은 클럽에 운영자가 직접 연결 → 클럽명 CTA가 정확.
  // (역경매 시절엔 area 오퍼라 클럽명이 오해였으나, 컨시어지 전환으로 지정 클럽이 실제 이행됨.
  //  클럽은 book_intent(sessionStorage)로 폼에 프리셀렉트됨.)
  const bookAtClubLabel = (name: string) =>
    t(
      `🍾 ${name} 예약하기`,
      `🍾 Book ${name}`,
      `🍾 ${name}を予約`,
      `🍾 预订 ${name}`,
    );
  const sortRecommendLabel = t("추천순", "Recommend", "おすすめ順", "推荐");
  const sortPopularLabel = t("리뷰 많은순", "Most reviewed", "レビュー数順", "评价最多");
  const sortRatingLabel = t("평점순", "Top rated", "評価順", "评分");
  const resetFiltersLabel = t("초기화", "Reset", "リセット", "重置");
  const noMatchLabel = t(
    "조건에 맞는 클럽이 없습니다",
    "No clubs match your filters.",
    "条件に合うクラブがありません。",
    "没有符合条件的夜店。",
  );
  const venueTypeGroup = FILTER_GROUPS.find((g) => g.group === "venue_type");
  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");
  const stickyCtaLabel = t(
    "🍾 예약하기",
    "🍾 Book with NightFlow",
    "🍾 NightFlowで予約",
    "🍾 立即预订",
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* pb-24: Sticky CTA 높이만큼 하단 여백 */}
      <div className="max-w-lg mx-auto px-4 py-12 pb-24 space-y-6">

        {/* Header */}
        <header className="space-y-3">
          <Link href={homeHref} className="inline-block text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            ← NightFlow
          </Link>
          {/* 제목 자리에 가치 제안을 바로 노출 — "Seoul Club Guide"는 라벨일 뿐 정보가 없어서
              처음 온 사람이 여기가 뭐 하는 곳인지 모른 채 목록만 보고 이탈했음.
              클럽 개수는 아래 줄로 내려 맥락(몇 곳 중에 고르는지)만 유지. */}
          <div className="space-y-1.5">
            <h1 className="text-[26px] font-black tracking-tight leading-tight break-keep">{introHeadline}</h1>
            <p className="text-[13.5px] text-muted-foreground leading-snug break-keep">{introSub}</p>
          </div>

          {/* How it works — /en 홈과 동일한 3단계 안내. 검색으로 처음 들어온 사람이
              목록만 보고 이탈하지 않도록, 접힌 상태로 두되 원하면 펼쳐볼 수 있게. */}
          <details className="group rounded-2xl bg-card border border-border overflow-hidden">
            <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
              <span className="flex items-center gap-2 font-bold text-[14px]">
                <Info className="w-4 h-4 text-muted-foreground" />
                {t("이용 방법", "How it works?", "ご利用方法", "使用方法")}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pb-3 border-b border-border">
                {[
                  t("웃돈 없음", "No markup", "上乗せなし", "无加价"),
                  t("실제 가격", "Real price", "実際の価格", "真实价格"),
                  t("수수료 0원", "Zero fee", "手数料ゼロ", "零手续费"),
                  t("예약금 없음", "No deposit", "デポジット不要", "无押金"),
                ].map((b) => (
                  <div key={b} className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-money shrink-0" strokeWidth={3} />
                    <span className="text-[13px] font-bold text-foreground">{b}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {[
                  {
                    n: "1",
                    title: t("클럽 고르기", "Pick your club", "クラブを選ぶ", "选择夜店"),
                    body: t(
                      "원하는 클럽을 고르거나 분위기만 알려주세요 — 날짜·예산·인원.",
                      "Choose the clubs you want (or just tell us your vibe) — date, budget, group size.",
                      "行きたいクラブを選ぶか、雰囲気だけ教えてください — 日付・予算・人数。",
                      "选好想去的夜店,或只告诉我们你想要的氛围 — 日期·预算·人数。"
                    ),
                  },
                  {
                    n: "2",
                    title: t("대신 예약해드려요", "We book it for you", "私たちが予約します", "我们帮你预订"),
                    body: t(
                      "저희가 클럽에 직접 연락해 예산에 맞는 최적의 테이블을 잡아드려요 — 실제 가격, 중개 수수료 없음.",
                      "We contact the club directly and lock in the best table for your budget — real price, no broker markup.",
                      "私たちがクラブに直接連絡し、予算に合う最適なテーブルを確保します — 実際の価格、仲介手数料なし。",
                      "我们直接联系夜店,按你的预算锁定最佳卡座 — 真实价格,无中介加价。"
                    ),
                  },
                  {
                    n: "3",
                    title: t("VIP처럼 입장", "Walk in like a VIP", "VIPのように入場", "像VIP一样入场"),
                    body: t(
                      "최고의 자리 예약 완료, 줄 설 필요 없음. 입구에서 여권만 보여주세요 (만 19세 이상).",
                      "Best table booked, no line, no broker. Show your passport at the door (19+).",
                      "最高の席を予約済み、列に並ぶ必要なし。入口でパスポートをご提示ください（19歳以上）。",
                      "已订好最佳卡座,无需排队。在门口出示护照即可（19岁以上）。"
                    ),
                  },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-inverse text-inverse-foreground font-black text-[12px] flex items-center justify-center">
                      {s.n}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-bold text-[14px]">{s.title}</p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-border">
                <p className="flex items-center gap-2 text-[13px] font-black text-money">
                  {t("🛡️ 바가지 제로 보장", "🛡️ Zero rip-off, guaranteed", "🛡️ ぼったくりゼロ保証", "🛡️ 零宰客保证")}
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-1 break-keep">
                  {t("정가보다 더 내셨나요?", "Pay more than the standard price?", "標準価格より多く払いましたか？", "付了高于标准价的钱?")}{" "}
                  <span className="font-bold text-foreground">
                    {t("200% 환불해드립니다.", "We refund you 200%.", "200%返金します。", "我们退你200%。")}
                  </span>
                </p>
              </div>
            </div>
          </details>

          {/* 정렬 버튼 (추천순 default = MD 있는 클럽 우선 / 리뷰 많은순 / 평점순) */}
          {totalCount > 0 && (
            <div className="flex items-center gap-2 pt-1">
              {(["recommend", "reviews", "rating"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setSortKey(k);
                    if (lang !== "ko") {
                      trackForeignEvent("foreign_clubs_view", { sort_change: k, source: "sort" });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                    sortKey === k
                      ? "bg-inverse text-inverse-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k === "recommend" ? sortRecommendLabel : k === "reviews" ? sortPopularLabel : sortRatingLabel}
                </button>
              ))}
            </div>
          )}

          {/* 세부 필터(타입·장르) — 항상 노출, 단일선택 */}
          {totalCount > 0 && (venueTypeGroup || genreGroup) && (
            <div className="space-y-1.5 pt-1">
              {venueTypeGroup && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {venueTypeGroup.options.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVenueType((v) => (v === opt.key ? null : opt.key))}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${
                        venueType === opt.key
                          ? "bg-inverse text-inverse-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {TAG_LABEL_I18N[opt.key]?.[lang] ?? opt.label}
                    </button>
                  ))}
                </div>
              )}
              {genreGroup && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {genreGroup.options.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGenre((v) => (v === opt.key ? null : opt.key))}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${
                        genre === opt.key
                          ? "bg-inverse text-inverse-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {TAG_LABEL_I18N[opt.key]?.[lang] ?? opt.label}
                    </button>
                  ))}
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => { setVenueType(null); setGenre(null); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 ml-auto pl-2 underline underline-offset-2"
                    >
                      {resetFiltersLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        {/* 지역별 가로 스크롤 (한국 가이드처럼 강남/홍대 두 줄) */}
        {totalCount === 0 && (
          <p className="text-center text-muted-foreground py-12">{noClubs}</p>
        )}
        {totalCount > 0 && shownCount === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-muted-foreground">{noMatchLabel}</p>
            <button
              type="button"
              onClick={() => { setVenueType(null); setGenre(null); }}
              className="text-[12px] font-bold text-foreground bg-muted hover:bg-muted px-4 py-2 rounded-full"
            >
              {resetFiltersLabel}
            </button>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.ko} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[18px] font-black">{areaI18n(g.ko, lang)}</h2>
              <span className="text-[13px] text-muted-foreground">{g.items.length}</span>
            </div>
            {/* key: 정렬/필터 바뀌면 DOM 리마운트 → scrollLeft 리셋 (안 그러면 가로 스크롤 위치가 남아서
                리스트만 바뀌고 앞쪽 클럽들이 화면 밖으로 밀려남) */}
            <div
              key={`${sortKey}-${venueType}-${genre}`}
              className="flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-4 px-4"
            >
              {g.items.map((club) => (
                <button
                  key={club.id}
                  onClick={() => {
                    openDetail(g.items, club);
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
                  <div className="relative w-[140px] h-[140px] rounded-2xl overflow-hidden bg-muted border border-border">
                    {club.thumbnail_url ? (
                      <Image src={club.thumbnail_url} alt={displayClubName(club)} fill className="object-cover" sizes="140px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[11px] font-bold">{noImage}</div>
                    )}
                  </div>
                  <p className="text-[13px] font-bold text-foreground mt-2 truncate">{displayClubName(club)}</p>
                  {club.google_rating != null && (
                    <p className="text-[12px] text-brand-amber mt-0.5">⭐ {club.google_rating.toFixed(1)}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}

        {/* Bottom CTA — 한국어 트랙에서만 노출. 외국인 트랙은 Sticky CTA(하단 fixed)로 대체됨. */}
        {lang === "ko" && (
          <div className="space-y-4 pt-4 pb-8">
            <p className="text-center text-[14px] text-muted-foreground">{notSureCopy}</p>
            <Link
              href={bottomCtaHref}
              className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors"
            >
              {ctaLabel}
            </Link>
            <p className="text-center text-[12px] text-muted-foreground leading-relaxed">
              {ctaSubLine1}<br />
              {ctaSubLine2}
            </p>
            <div className="flex justify-center pt-2">
              <LangSwitcher />
            </div>
          </div>
        )}

        {/* 외국인 트랙: Sticky CTA와 겹치지 않게 서브카피 + Language 스위처를 페이지 하단에 배치 (텍스트 링크만). */}
        {lang !== "ko" && shownCount > 0 && (
          <div className="pt-4 pb-8 space-y-3">
            <p className="text-center text-[12px] text-muted-foreground leading-relaxed">
              {ctaSubLine1}<br />
              {ctaSubLine2}
            </p>
            <div className="flex justify-center">
              <LangSwitcher />
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA — 유저가 스크롤 안 해도 항상 보이도록 fixed. 외국인 트랙만. */}
      {lang !== "ko" && shownCount > 0 && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 px-4 pb-4 pt-6 pointer-events-none
                     bg-gradient-to-t from-background via-background via-[60%] to-transparent"
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

      {/* 클럽 상세 바텀시트 (카드 클릭 시) — 가격표·영업시간·평점 + 구글 리뷰 + 예약 CTA.
          같은 캐러셀(detailList) 안에서 하단 Next 버튼 또는 좌우 스와이프로 옆 클럽으로 바로 이동 가능. */}
      <Sheet open={!!selectedClub} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0"
          onTouchStart={(e) => {
            detailTouchStartXRef.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const startX = detailTouchStartXRef.current;
            detailTouchStartXRef.current = null;
            if (startX == null) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            const SWIPE_THRESHOLD = 60;
            if (deltaX > SWIPE_THRESHOLD) goPrevDetail();
            else if (deltaX < -SWIPE_THRESHOLD) goNextDetail();
          }}
        >
          {selectedClub && (() => {
            const club = selectedClub;
            // 좌우 이동은 홈 시트(EnHomeClient)와 동일하게 이미지 위 화살표로 통일.
            // 하단 "Next" 텍스트 버튼은 예약 버튼과 자리를 다퉈서(Book 47% / Next 21%)
            // 결정보다 "계속 둘러보기"를 부추겼다.
            const navArrows = (
              <>
                {hasPrevDetail && (
                  <button
                    type="button"
                    onClick={goPrevDetail}
                    aria-label={t("이전 클럽", "Previous club", "前のクラブ", "上一家")}
                    className="absolute left-3 top-24 z-10 w-9 h-9 rounded-full bg-black/45 border border-white/30 text-white flex items-center justify-center hover:bg-black/65"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                {hasNextDetail && (
                  <button
                    type="button"
                    onClick={goNextDetail}
                    aria-label={t("다음 클럽", "Next club", "次のクラブ", "下一家")}
                    className="absolute right-3 top-24 z-10 w-9 h-9 rounded-full bg-black/45 border border-white/30 text-white flex items-center justify-center hover:bg-black/65"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </>
            );
            const clubFlagHref = buildFlagHref(lang, club.area, club.id);
            return (
              <>
                <SheetTitle className="sr-only">{displayClubName(club)}</SheetTitle>
                {navArrows}
                <ForeignClubDetailPanel
                  club={club}
                  lang={lang}
                  cta={
                    // 예약 CTA — 카드 클릭 유저를 구글로 내보내지 않고 깃발 폼으로 유도.
                    // 닫힌 지역(OPEN_FLAG_AREAS 미포함)은 폼에서 area 선택 불가 → 예약 CTA 대신 "Coming soon" 안내.
                    !isFlagAreaOpen(club.area) ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-center gap-1.5 w-full py-3.5 rounded-xl bg-card border border-amber-500/30 text-brand-amber font-black text-[15px]">
                          🚀 {t(
                            "이태원은 준비중이에요",
                            "Coming soon to NightFlow",
                            "NightFlowで近日開始",
                            "即将上线 NightFlow",
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/en/clubs/hongdae?lang=${lang}`}
                            onClick={closeDetail}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-500 text-black text-[14px] font-black hover:bg-amber-400 transition-colors"
                          >
                            {t(
                              "→ 홍대·강남 클럽 예약하기",
                              "→ Book Gangnam or Hongdae instead",
                              "→ 江南・弘大クラブを予約",
                              "→ 预订江南或弘大夜店",
                            )}
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <Link
                          href={clubFlagHref}
                          onClick={() => {
                            // 회원가입 완료 후 깃발 폼에서 원래 클릭한 클럽을 프리셀렉트하기 위해
                            // sessionStorage에 저장. 24시간 안에 소비 시 유효, PuzzleForm이 읽고 자동 삭제.
                            if (typeof window !== "undefined") {
                              try {
                                sessionStorage.setItem(
                                  "nightflow_book_intent",
                                  JSON.stringify({
                                    club_id: club.id,
                                    club_name: club.name,
                                    area: club.area,
                                    lang,
                                    savedAt: Date.now(),
                                  })
                                );
                              } catch { /* noop */ }
                            }
                            if (lang !== "ko") {
                              trackForeignEvent("foreign_book_at_club_click", {
                                area: club.area,
                                club_id: club.id,
                                club_name: club.name,
                              });
                            }
                            closeDetail();
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors"
                        >
                          {bookAtClubLabel(displayClubName(club))}
                        </Link>
                      </div>
                    )
                  }
                />
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
