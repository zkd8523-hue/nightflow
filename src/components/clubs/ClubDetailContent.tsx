"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getLang, makeT } from "@/lib/i18n";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Instagram,
  Camera,
  Loader2,
  Clock,
  Ticket,
  Shirt,
  Heart,
  MessageCircle,
  Copy,
  Check,
  Pencil,
  Globe,
} from "lucide-react";
import { uploadImage } from "@/lib/utils/upload";
import { toast } from "sonner";
import { AuctionList } from "@/components/auctions/AuctionList";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { KoreanBookingForm } from "./KoreanBookingForm";
import { isBookable } from "@/lib/clubs/bookable";
import { ClubShareButton } from "./ClubShareButton";
import { DrinkMenuViewer } from "./DrinkMenuViewer";
import { ClubLocationModal } from "./ClubLocationModal";
import { ClubProfileEditor } from "./ClubProfileEditor";
import { ClubInfoReportSheet } from "./ClubInfoReportSheet";
import { WordCloudSection } from "./WordCloudSection";
import { FlagExplainerSheet } from "./FlagExplainerSheet";
import { ClubSharePuzzles } from "./ClubSharePuzzles";
import { trackEvent } from "@/lib/analytics/events";
import { useIsClubPartner } from "@/hooks/useIsClubPartner";
import { getTagsByGroup, type ClubTagGroup } from "@/lib/clubs/tags";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction, HotdealDow, HotdealTimeSlot, Puzzle } from "@/types/database";
import { GUEST_SIGN_BENEFIT_PRESETS, benefitLabel } from "@/lib/utils/hotdeal";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";
import { ClubCouponBar } from "@/components/coupon/ClubCouponBar";
import { type TodayLineup } from "./ClubLineupSection";
import { UpcomingLineupSheet, type UpcomingLineup } from "./UpcomingLineupSheet";
import { ClubUpcomingEvents, type ClubUpcomingEvent } from "./ClubUpcomingEvents";

function trackGuestSignClick(
  slotId: string | undefined,
  clickType: "instagram" | "openchat" | "copy_message"
) {
  if (!slotId) return;
  // fire-and-forget — 실패해도 사용자 흐름을 막지 않음
  fetch("/api/hotdeal-slots/track-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId, clickType }),
    keepalive: true,
  }).catch(() => {});
}

interface GuestSignSlotInfo {
  slot_id?: string;
  today_dow?: HotdealDow;
  today_slots?: HotdealTimeSlot[];
  md: {
    id: string;
    display_name: string | null;
    profile_image: string | null;
    instagram: string | null;
    kakao_open_chat_url: string | null;
  };
  today_benefit: string | null;
  today_tags?: string[];
}

interface ClubDetailContentProps {
  club: Club;
  activeAuctions: Auction[];
  guestSignSlot?: GuestSignSlotInfo | null;
  /** 핫딜 상세에서 진입 시 조각/깃발 동선을 숨겨 이탈 방지 */
  hideShareList?: boolean;
  /** Migration 505: 이 클럽의 파트너 직통 조각(host_is_md, 오늘 이후). 클럽당 파트너 1명 전제 */
  sharePuzzles?: Puzzle[];
  /** 오늘 영업일 DJ 타임테이블. 없으면 섹션 자체가 렌더되지 않는다 */
  /** @deprecated 오늘 라인업 섹션 제거 — 전광판(UpcomingLineupSheet)이 NOW를 표시한다.
   *  page.tsx가 아직 넘기고 있어 시그니처만 남겨 둔다. */
  todayLineup?: TodayLineup | null;
  /** 오늘부터 앞으로 예정된 라인업 전체. "어떤 DJ들이 올까?" 시트 진입점용 */
  upcomingLineups?: UpcomingLineup[];
  upcomingEvents?: ClubUpcomingEvent[];
  /** 한국인 예약 스티키바 게이팅 — 담당 MD(club_partners)가 있는가. */
  hasMd?: boolean;
  /** 한국인 예약 스티키바 게이팅 — 주대 데이터(club_menu_items)가 있는가. */
  hasMenu?: boolean;
}

export function ClubDetailContent({
  club,
  activeAuctions: rawActiveAuctions,
  guestSignSlot = null,
  hideShareList = false,
  sharePuzzles = [],
  todayLineup = null,
  upcomingLineups = [],
  upcomingEvents = [],
  hasMd = false,
  hasMenu = false,
}: ClubDetailContentProps) {
  const activeAuctions = useMemo(() => {
    return rawActiveAuctions.map(adjustMockAuctionDates);
  }, [rawActiveAuctions]);

  const router = useRouter();
  const { user } = useCurrentUser();
  const supabase = createClient();

  // iframe 임베드 모드 (지도 모달 안에서 열린 경우). 뒤로가기 버튼 숨김 → 모달 X 버튼 사용.
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsEmbedded(new URLSearchParams(window.location.search).get("embedded") === "1");
  }, []);

  // 클럽 상세 페이지 노출 이벤트 (전환퍼널 CTA 노출 총량 분모)
  useEffect(() => {
    trackEvent("club_detail_view", {
      club_id: club.id,
      club_name: club.name,
      area: club.area,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.id]);

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isFlagExplainerOpen, setIsFlagExplainerOpen] = useState(false);
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(club.thumbnail_url);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [guestSignCopied, setGuestSignCopied] = useState<"guest" | null>(null);
  const [clubTags, setClubTags] = useState<string[]>(club.tags ?? []);
  const [clubName, setClubName] = useState<string>(club.name);
  const [clubNameEn, setClubNameEn] = useState<string>(club.name_en ?? "");
  const [clubAddress, setClubAddress] = useState<string>(club.address ?? "");
  const [clubOperatingHours, setClubOperatingHours] = useState<string>(club.operating_hours ?? "");
  const [clubEntryFeeDetail, setClubEntryFeeDetail] = useState<string>(club.entry_fee_detail ?? "");
  const [clubInstagram, setClubInstagram] = useState<string>(club.instagram ?? "");
  const [clubAliases, setClubAliases] = useState<string[]>(club.aliases ?? []);
  const [clubDresscode, setClubDresscode] = useState<string>(club.dresscode ?? "");
  const [clubDrinkMenuUrl, setClubDrinkMenuUrl] = useState<string | null>(club.drink_menu_url ?? null);
  const [clubDrinkMenuUpdatedAt, setClubDrinkMenuUpdatedAt] = useState<string | null>(club.drink_menu_updated_at ?? null);
  const [clubDrinkMenuUrls, setClubDrinkMenuUrls] = useState<string[]>(
    () => (club.drink_menu_urls && club.drink_menu_urls.length > 0)
      ? club.drink_menu_urls
      : (club.drink_menu_url ? [club.drink_menu_url] : [])
  );
  const [clubFloorPlanUrl, setClubFloorPlanUrl] = useState<string | null>(club.floor_plan_url ?? null);
  const [clubFloorPlanUrls, setClubFloorPlanUrls] = useState<string[]>(
    () => (club.floor_plan_urls && club.floor_plan_urls.length > 0)
      ? club.floor_plan_urls
      : (club.floor_plan_url ? [club.floor_plan_url] : [])
  );
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null);
  const isAdmin = user?.role === "admin";
  const { isPartner: isPartnerOrAdmin } = useIsClubPartner(club.id);
  // admin도 파트너 UI 노출 (테스트/일관성 — B 옵션)
  const canPartnerEdit = isPartnerOrAdmin;
  const [partnerEditorOpen, setPartnerEditorOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);

  // 클럽 찜 카운트 (실제 row + seed_favorite_count — /clubs 목록과 동일 집계)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("user_favorite_clubs")
        .select("id", { count: "exact", head: true })
        .eq("club_id", club.id);
      if (!cancelled) {
        const seed = club.seed_favorite_count ?? 0;
        setFavoriteCount((count ?? 0) + seed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [club.id, club.seed_favorite_count, supabase]);

  const handleAdminThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumbnail(true);
    try {
      const publicUrl = await uploadImage(file, `club-thumbnails/admin/${club.id}`, {
        maxWidth: 1200,
      });
      if (!publicUrl) {
        // uploadImage already toasts on failure
        return;
      }
      const res = await fetch("/api/admin/clubs/update-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id, thumbnailUrl: publicUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "이미지 업데이트 실패");
        return;
      }
      setThumbnailUrl(publicUrl);
      toast.success(
        `대표 이미지 변경됨 (게시글 ${json.cascadedAuctions ?? 0}건 반영)`
      );
    } catch (err) {
      console.error("[admin thumbnail upload]", err);
      toast.error("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingThumbnail(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    if (!user) {
      setUserBidMap(new Map());
      setBlockedUserIds(new Set());
      return;
    }
    const fetchAll = async () => {
      const auctionIds = activeAuctions.map((a) => a.id);
      const [bidsResult, blocksResult] = await Promise.all([
        auctionIds.length > 0
          ? supabase
              .from("bids")
              .select("auction_id, bid_amount")
              .eq("bidder_id", user.id)
              .in("auction_id", auctionIds)
              .order("bid_amount", { ascending: false })
          : Promise.resolve({ data: [] as { auction_id: string; bid_amount: number }[] }),
        supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);
      if (bidsResult.data) {
        const map = new Map<string, number>();
        for (const bid of bidsResult.data) {
          if (!map.has(bid.auction_id)) map.set(bid.auction_id, bid.bid_amount);
        }
        setUserBidMap(map);
      }
      if (blocksResult.data) {
        setBlockedUserIds(
          new Set(blocksResult.data.map((d: { blocked_id: string }) => d.blocked_id))
        );
      }
    };
    fetchAll();
  }, [user, activeAuctions, supabase]);

  // 차단한 MD의 매물 숨김 (Apple Guideline 1.2 일관성)
  const visibleAuctions = useMemo(() => {
    if (blockedUserIds.size === 0) return activeAuctions;
    return activeAuctions.filter(
      (a) => !a.md_id || !blockedUserIds.has(a.md_id)
    );
  }, [activeAuctions, blockedUserIds]);

  // 외국인 트랙(en/ja/zh) 진입 시 lang을 flag 등록·로그인까지 일관 전달
  const searchParams = useSearchParams();
  const lang = getLang(searchParams?.get("lang"));
  const isForeigner = lang !== "ko";
  const flagAreaParam = club.area ? `area=${encodeURIComponent(club.area)}` : "";
  const flagLangParam = isForeigner ? `lang=${lang}` : "";
  const flagQuery = [flagAreaParam, flagLangParam].filter(Boolean).join("&");
  const flagHref = flagQuery ? `/flags/new?${flagQuery}` : "/flags/new";
  // 로그인 페이지는 ?redirect= 파라미터를 읽음 (next는 미인식). lang도 유지.
  const loginQuery = [isForeigner ? `lang=${lang}` : "", `redirect=${encodeURIComponent(flagHref)}`]
    .filter(Boolean)
    .join("&");
  const ctaHref = user ? flagHref : `/login?${loginQuery}`;
  // 게스트 간판 MD가 있으면 본문에 이미 클럽 맥락 1순위 CTA(연락)가 있으므로
  // 지역 깃발 CTA는 숨겨 전환 충돌을 막는다. 없을 때만 노출.
  // 한국어 트랙은 깃발 신규 진입점 숨김 — 외국어 트랙(isForeigner)은 깃발이 유일한 전환 수단이라 유지.
  const showFlagCta = isForeigner && !guestSignSlot && !hideShareList;

  // 한국인 예약 스티키바 — 외국인 트랙(isBookable, lib/clubs/bookable.ts)과 동일 게이팅을
  // 한국 트랙에도 적용. MD+주대가 모두 있어야 실제로 예약을 중개할 수 있다.
  // 게스트 간판(무료입장 혜택)과는 목적이 달라 공존한다 — 간판이 있어도 테이블 예약은 별개로 노출.
  const bookable = !isForeigner && isBookable({ has_md: hasMd, has_menu: hasMenu });
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-40">
      {/* 클럽 정보 카드 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6">
        <div
          className="relative w-full aspect-[4/3] bg-card border border-border"
          onDragOver={(e) => { if (!isAdmin) return; e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            if (!isAdmin) return;
            e.preventDefault();
            setIsDraggingOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith("image/")) {
              handleAdminThumbnailUpload({ target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>);
            }
          }}
        >
          {isDraggingOver && isAdmin && (
            <div className="absolute inset-0 z-20 bg-amber-500/40 border-2 border-dashed border-amber-400 flex items-center justify-center pointer-events-none">
              <p className="text-foreground font-black text-[15px]">여기에 놓으세요</p>
            </div>
          )}
            {/* 이미지 위 플로팅: 뒤로가기 + 찜. 임베드 모드(지도 모달)에선 뒤로가기 숨김. */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3 pointer-events-none">
              {!isEmbedded ? (
                <button
                  onClick={() => router.back()}
                  className="pointer-events-auto w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  <ArrowLeft className="w-7 h-7 text-foreground" />
                </button>
              ) : (
                <div />
              )}
              <div className="pointer-events-auto flex items-center gap-2">
                <ClubShareButton clubId={club.id} clubName={club.name} area={club.area} />
                <FavoriteButton clubId={club.id} variant="overlay" />
              </div>
            </div>

            {thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={`${club.area ? `${club.area} ` : ""}${club.name} 클럽 사진`}
                fill
                // 컨테이너는 max-w-lg(512px) 안의 w-full — sizes 없으면 next/image가 3840px(4K)를 받아 LCP 저하.
                // 모바일은 화면 전체, 그 이상은 512px 상한으로 제한.
                sizes="(max-width: 512px) 100vw, 512px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[12px]">
                대표 이미지 없음
              </div>
            )}
            {isAdmin && (
              <label className="absolute bottom-2 right-2 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumbnail}
                  onChange={handleAdminThumbnailUpload}
                />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm text-foreground text-[11px] font-bold rounded-full hover:bg-black/90 transition-colors">
                  {uploadingThumbnail ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <Camera className="w-3 h-3" />
                      {thumbnailUrl ? "이미지 변경" : "이미지 추가"}
                    </>
                  )}
                </span>
              </label>
            )}
          </div>

        <div className={`px-4 ${upcomingLineups.length > 0 ? "pt-2 pb-1" : "pt-4"}`}>
          <UpcomingLineupSheet clubId={club.id} lineups={upcomingLineups} />
        </div>

        {/* 공연 전광판. DJ 라인업 전광판과 같은 생김새로 바로 아래 붙인다 —
            간격을 벌리면 관련 없는 블록처럼 읽힌다. */}
        {upcomingEvents.length > 0 && (
          <div className="px-4 pt-1.5 pb-1">
            <ClubUpcomingEvents events={upcomingEvents} />
          </div>
        )}

        {isAdmin && (
          <div className="px-4 pt-3">
            <ClubProfileEditor
              clubId={club.id}
              initialTags={clubTags}
              initialName={clubName}
              initialNameEn={clubNameEn}
              initialAddress={clubAddress}
              initialOperatingHours={clubOperatingHours}
              initialEntryFeeDetail={clubEntryFeeDetail}
              initialInstagram={clubInstagram}
              initialAliases={clubAliases}
              initialDresscode={clubDresscode}
              initialDrinkMenuUrl={clubDrinkMenuUrl}
              initialDrinkMenuUrls={clubDrinkMenuUrls}
              initialFloorPlanUrl={clubFloorPlanUrl}
              initialFloorPlanUrls={clubFloorPlanUrls}
              onSaved={(next) => {
                setClubTags(next.tags);
                setClubName(next.name);
                setClubNameEn(next.nameEn);
                setClubAddress(next.address);
                setClubOperatingHours(next.operatingHours);
                setClubEntryFeeDetail(next.entryFeeDetail);
                setClubInstagram(next.instagram);
                setClubAliases(next.aliases);
                setClubDresscode(next.dresscode);
                const urls = next.drinkMenuUrls ?? (next.drinkMenuUrl ? [next.drinkMenuUrl] : []);
                const head = urls[0] ?? null;
                setClubDrinkMenuUrls(urls);
                setClubDrinkMenuUrl(head);
                if (head !== clubDrinkMenuUrl) {
                  setClubDrinkMenuUpdatedAt(head ? new Date().toISOString() : null);
                }
                const floorUrls = next.floorPlanUrls ?? (next.floorPlanUrl ? [next.floorPlanUrl] : []);
                setClubFloorPlanUrls(floorUrls);
                setClubFloorPlanUrl(floorUrls[0] ?? null);
              }}
            />
          </div>
        )}

        <div className="px-4 pt-2 pb-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
            {/* H2로 강등 — 실제 H1은 page.tsx의 sr-only로 풍부한 SEO 본문이 됨.
                네이버 검색최적화 가이드: H1은 페이지당 1개만. */}
            <h2 className="text-2xl font-black text-foreground tracking-tight">
              {clubName}
            </h2>
            {club.area && (
              <span className="text-[13px] text-muted-foreground">
                {club.area}
              </span>
            )}
            {favoriteCount !== null && favoriteCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[12px] text-red-500 font-medium">
                <Heart className="w-3 h-3 fill-red-500 stroke-none" />
                {favoriteCount}
              </span>
            )}
            </div>
          </div>

          {/* 게스트 간판 — 이번 주 차지 MD 정보 (각진 '간판' 스타일 + 밝은 내부 배경으로 배경과 분리) */}
          {guestSignSlot && (() => {
            // MD가 문구를 안 쓰고 칩만 고른 경우도 있으므로, 텍스트가 없으면
            // 칩 라벨을 이어붙여 띠를 만든다("무료입장 · 프리드링크"). 목록/홈 배너 폴백과 동일 규칙.
            const bannerText =
              guestSignSlot.today_benefit?.trim() ||
              (guestSignSlot.today_tags ?? []).slice(0, 2).map((t) => benefitLabel(t).label).join(" · ");
            return (
            <div className="bg-muted border border-amber-500/50 rounded-md overflow-hidden mt-1 shadow-[0_6px_24px_-8px_rgba(245,158,11,0.35)]">
              {/* 헤더: 혜택 앰버 '간판' */}
              {bannerText && (
                <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2 border-b-2 border-amber-600/40">
                  <span
                    className="block whitespace-pre-line text-black text-[14px] tracking-tight text-center leading-[1.15] line-clamp-2"
                    style={{ fontFamily: "var(--font-display-kr)" }}
                  >
                    {bannerText}
                  </span>
                </div>
              )}

              <div className="px-3 pt-2 pb-0 space-y-1.5">
                {isAdmin && guestSignSlot.slot_id && guestSignSlot.today_dow && (
                  <AdminGuestSignEditor
                    slotId={guestSignSlot.slot_id}
                    dow={guestSignSlot.today_dow}
                    initialSlots={guestSignSlot.today_slots ?? []}
                  />
                )}
                <Link
                  href={`/u/${guestSignSlot.md.id}`}
                  className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <div className="relative w-11 h-11 rounded-md overflow-hidden bg-muted shrink-0 ring-1 ring-amber-500/40">
                    {guestSignSlot.md.profile_image ? (
                      <Image
                        src={guestSignSlot.md.profile_image}
                        alt={guestSignSlot.md.display_name ?? "파트너"}
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/40 font-black text-lg">
                        {(guestSignSlot.md.display_name ?? "M").charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-black text-[15px] truncate leading-tight">
                      {guestSignSlot.md.display_name ?? "담당 파트너"}
                    </p>
                  </div>
                </Link>
              </div>
              <div className="mt-1.5">
                <div className={`grid divide-x divide-border border-t border-border overflow-hidden ${guestSignSlot.md.kakao_open_chat_url ? "grid-cols-2" : "grid-cols-1"}`}>
                  {guestSignSlot.md.instagram && (
                    <a
                      href={`https://instagram.com/${guestSignSlot.md.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackGuestSignClick(guestSignSlot.slot_id, "instagram")}
                      className="bg-card hover:bg-muted px-3 py-2.5 flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <Instagram className="w-4 h-4 text-pink-400 flex-shrink-0" />
                      <span className="text-foreground text-[12px] font-bold truncate">@{guestSignSlot.md.instagram}</span>
                    </a>
                  )}
                  {guestSignSlot.md.kakao_open_chat_url && (
                    <a
                      href={guestSignSlot.md.kakao_open_chat_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackGuestSignClick(guestSignSlot.slot_id, "openchat")}
                      className="bg-card hover:bg-muted px-3 py-2.5 flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <MessageCircle className="w-4 h-4 text-[#FEE500] flex-shrink-0" fill="currentColor" />
                      <span className="text-foreground text-[12px] font-bold truncate">오픈채팅</span>
                    </a>
                  )}
                </div>
                {(guestSignSlot.md.instagram || guestSignSlot.md.kakao_open_chat_url) && (
                  <div className="border-t-2 border-border bg-background/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={async () => {
                        const benefit = bannerText?.trim();
                        const message = [
                          "[나플 게스트 문의] 안녕하세요!",
                          `${clubName}${benefit ? ` "${benefit}"` : ""} 게스트 가능할까요?`,
                        ].join("\n");
                        try {
                          await navigator.clipboard.writeText(message);
                          setGuestSignCopied("guest");
                          toast.success("메시지가 복사됐어요");
                          trackGuestSignClick(guestSignSlot.slot_id, "copy_message");
                          setTimeout(() => setGuestSignCopied(null), 2000);
                        } catch {
                          toast.error("복사에 실패했어요. 메시지를 길게 눌러 복사해주세요");
                        }
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 hover:bg-muted text-[12px] font-bold text-foreground/70 hover:text-foreground active:scale-[0.98] transition"
                    >
                      {guestSignCopied === "guest" ? <Check className="w-3.5 h-3.5 text-money" /> : <Copy className="w-3.5 h-3.5" />}
                      {guestSignCopied === "guest" ? "복사됐어요" : "게스트 문의 복사"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* 파트너 MD용 편집 Sheet (트리거 없이 외부 제어) */}
          {canPartnerEdit && (
            <ClubProfileEditor
              clubId={club.id}
              initialTags={clubTags}
              initialName={clubName}
              initialNameEn={clubNameEn}
              initialAddress={clubAddress}
              initialOperatingHours={clubOperatingHours}
              initialEntryFeeDetail={clubEntryFeeDetail}
              initialInstagram={clubInstagram}
              initialAliases={clubAliases}
              initialDresscode={clubDresscode}
              initialDrinkMenuUrl={clubDrinkMenuUrl}
              initialDrinkMenuUrls={clubDrinkMenuUrls}
              initialFloorPlanUrl={clubFloorPlanUrl}
              initialFloorPlanUrls={clubFloorPlanUrls}
              mode="partner"
              hideTrigger
              externalOpen={partnerEditorOpen}
              onExternalOpenChange={setPartnerEditorOpen}
              onSaved={(next) => {
                setClubTags(next.tags);
                setClubOperatingHours(next.operatingHours);
                setClubDresscode(next.dresscode);
                const urls = next.drinkMenuUrls ?? (next.drinkMenuUrl ? [next.drinkMenuUrl] : []);
                const head = urls[0] ?? null;
                setClubDrinkMenuUrls(urls);
                setClubDrinkMenuUrl(head);
                if (head !== clubDrinkMenuUrl) {
                  setClubDrinkMenuUpdatedAt(head ? new Date().toISOString() : null);
                }
                const floorUrls = next.floorPlanUrls ?? (next.floorPlanUrl ? [next.floorPlanUrl] : []);
                setClubFloorPlanUrls(floorUrls);
                setClubFloorPlanUrl(floorUrls[0] ?? null);
              }}
            />
          )}

          {/* 쿠폰 띠 — 배민식 띠+시트. 활성 쿠폰 없으면 자체적으로 렌더 안 함 (Migration 539) */}
          <ClubCouponBar clubId={club.id} />

          {/* 타입/음악/흡연 태그를 해시태그로 — 정보 리스트 맨 위. LED 전광판이 원래
              이 정보(FeatureIconRow)가 있던 자리를 대신하면서, 태그는 여기로 옮겨왔다. */}
          <HashtagRow tags={clubTags} />

          {clubAddress && (
            <button
              onClick={() => setIsMapOpen(true)}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors group w-full text-left"
            >
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 주소: </span>
              <span className="truncate">{clubAddress}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </button>
          )}

          {clubOperatingHours && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 영업시간: </span>
              <span>{clubOperatingHours}</span>
            </div>
          )}

          {clubEntryFeeDetail && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Ticket className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 입장료: </span>
              <span>{clubEntryFeeDetail}</span>
            </div>
          )}

          {clubDresscode && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Shirt className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 드레스코드: </span>
              <span>{clubDresscode}</span>
            </div>
          )}

          {clubInstagram && (
            <a
              href={`https://instagram.com/${clubInstagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-pink-400 transition-colors mt-1"
            >
              <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">{club.name} 인스타그램: </span>
              @{clubInstagram}
            </a>
          )}

          {club.website_url && (
            <a
              href={club.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-blue-400 transition-colors mt-1"
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">{club.name} 공식 홈페이지: </span>
              공식 홈페이지
            </a>
          )}

          {(clubDrinkMenuUrls.length > 0 || clubDrinkMenuUrl || club.drink_menu_url || clubFloorPlanUrl || clubFloorPlanUrls.length > 0) && (
            <DrinkMenuViewer
              urls={clubDrinkMenuUrls}
              url={clubDrinkMenuUrl ?? club.drink_menu_url}
              updatedAt={clubDrinkMenuUpdatedAt ?? club.drink_menu_updated_at}
              clubName={clubName}
              floorPlanUrl={clubFloorPlanUrl}
              floorPlanUrls={clubFloorPlanUrls}
            />
          )}

          {/* 파트너 MD/admin: 눈에 띄는 편집 버튼 */}
          {user && canPartnerEdit && (
            <button
              type="button"
              onClick={() => setPartnerEditorOpen(true)}
              className="mt-3 inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-lg bg-amber-500/10 border border-amber-500/40 text-brand-amber hover:bg-amber-500/20 active:scale-95 transition text-[13px] font-bold"
            >
              <Pencil className="w-3.5 h-3.5" />
              클럽 정보 수정하기 (해당 클럽 파트너 전용)
            </button>
          )}

          {/* 카드 안: 잘못된 정보 신고 (비로그인 시 로그인 페이지로 유도) */}
          {!canPartnerEdit && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    router.push(`/login?redirect=/clubs/${club.id}`);
                    return;
                  }
                  setReportSheetOpen(true);
                }}
                className="text-[11px] text-muted-foreground hover:text-brand-amber transition-colors underline decoration-dotted underline-offset-2"
              >
                정보 수정 요청
              </button>
            </div>
          )}

        </div>
      </div>

      {/* 정보 오류 신고 Sheet */}
      {user && (
        <ClubInfoReportSheet
          clubId={club.id}
          clubName={clubName}
          open={reportSheetOpen}
          onOpenChange={setReportSheetOpen}
        />
      )}

      {/* 파트너 직통 파티 — 정보 수정 요청과 리뷰 사이. Migration 505 */}
      {!hideShareList && sharePuzzles.length > 0 && (
        <ClubSharePuzzles puzzles={sharePuzzles} />
      )}

      {/* 5자 리뷰 워드클라우드 */}
      <WordCloudSection clubId={club.id} clubName={clubName} />

      {/* 경매 목록 — 핫딜 상세에서 진입 시 파티글 숨김 (이탈 방지) */}
      {!hideShareList && (
        <AuctionList
          activeAuctions={visibleAuctions}
          userBidMap={userBidMap}
          hideTabs
          hideAreaFilter
          hideShareEmptyState
          initialTab="share"
        />
      )}

      {/* Admin 전용: 클럽 DB 삭제 — 리뷰/파티보다 아래(제일 하단) */}
      {isAdmin && (
        <div className="px-4 pt-2 pb-4">
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`"${clubName}" 클럽을 삭제할까요?\n(목록/지도에서 사라지며, /admin/clubs에서 복구 가능)`)) return;
              const { error } = await supabase
                .from("clubs")
                .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
                .eq("id", club.id);
              if (error) {
                toast.error("삭제 실패: " + error.message);
                return;
              }
              toast.success("클럽을 삭제했어요");
              router.push("/clubs");
            }}
            className="w-full h-10 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-[13px] font-bold hover:bg-red-500/20 active:scale-95 transition"
          >
            🗑 클럽 삭제 (admin)
          </button>
        </div>
      )}

      {/* 풀스크린 지도 모달 — 네이버 패턴 */}
      <ClubLocationModal
        open={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        clubName={clubName}
        address={clubAddress || club.address}
        latitude={club.latitude}
        longitude={club.longitude}
      />

      {/* 플로팅 CTA - 깃발 꽂기 (게스트 간판 MD가 없는 클럽에서만 노출) */}
      {showFlagCta && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 px-4 pt-8 bg-gradient-to-t from-background via-background via-[70%] to-transparent pointer-events-none"
          style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 12px)" }}
        >
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                trackEvent("club_detail_cta_click", {
                  club_id: club.id,
                  club_name: club.name,
                  area: club.area,
                });
                setIsFlagExplainerOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-full shadow-lg shadow-black/40 transition-colors active:scale-[0.98]"
            >
              {(() => {
                const bookT = makeT(lang);
                // "예약" 강조 → 나플의 혜택 궁금증 유발형으로 변경.
                // 이유: club_detail_view 이탈률 64.9% (한국어), CTA 클릭률 1.9%.
                // "예약해라" 대신 유저 내면 질문 대신 물어주는 프레임.
                return bookT(
                  `지금 나플에서 예약하면? 🎉`,
                  `Book now on NightFlow? 🎉`,
                  `今、NightFlowで予約すると? 🎉`,
                  `现在在 NightFlow 预订? 🎉`,
                  `現在在 NightFlow 預訂? 🎉`,
                );
              })()}
            </button>
          </div>
        </div>
      )}

      {showFlagCta && (
        <FlagExplainerSheet
          open={isFlagExplainerOpen}
          onOpenChange={setIsFlagExplainerOpen}
          area={club.area}
          clubName={clubName}
          ctaHref={ctaHref}
          lang={lang}
        />
      )}

      {/* 한국인 예약 스티키바 — MD+주대가 있는 클럽만 활성. 없으면 회색 "준비중"으로
          카탈로그는 유지하되(SEO) 예약은 못 누르게 한다 (외국인 트랙과 동일 규칙).
          게스트 간판(무료입장 혜택)이 있어도 함께 노출 — 목적이 다른 별개 CTA. */}
      {!isForeigner && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 px-4 pt-8 bg-gradient-to-t from-background via-background via-[70%] to-transparent pointer-events-none"
          style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 12px)" }}
        >
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              type="button"
              disabled={!bookable}
              onClick={() => {
                if (!bookable) return;
                if (!user) {
                  router.push(`/login?redirect=${encodeURIComponent(`/clubs/${club.id}`)}`);
                  return;
                }
                trackEvent("club_detail_book_click", { club_id: club.id, club_name: club.name, area: club.area });
                setIsBookingOpen(true);
              }}
              className={`w-full h-12 rounded-full font-black text-[15px] shadow-lg shadow-black/40 transition-colors active:scale-[0.98] ${
                bookable
                  ? "bg-amber-500 hover:bg-amber-400 text-black"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {bookable ? "예약하기" : "예약 준비중"}
            </button>
          </div>
        </div>
      )}

      {bookable && user && (
        <KoreanBookingForm
          open={isBookingOpen}
          onOpenChange={setIsBookingOpen}
          clubId={club.id}
          clubName={clubName}
          clubThumbnailUrl={thumbnailUrl}
          userId={user.id}
        />
      )}
    </div>
  );
}

/**
 * 타입/음악/흡연 태그를 #해시태그로 표시. FeatureIconRow와 같은 태그 그룹(venue_type/
 * genre/smoking)을 쓰지만, 자리가 정보 리스트(주소·영업시간 등)로 옮겨오면서
 * 아이콘 3칸 대신 한 줄짜리 해시태그 나열로 형태를 바꿨다 — 아이콘 없이도 정보
 * 리스트의 다른 항목들(아이콘+텍스트)과 톤이 맞도록 볼드 처리.
 */
function HashtagRow({ tags }: { tags: string[] }) {
  const ORDER: { key: ClubTagGroup }[] = [
    { key: "venue_type" },
    { key: "genre" },
    { key: "smoking" },
  ];

  const labels: string[] = [];
  for (const item of ORDER) {
    const groupTags = getTagsByGroup(tags, item.key);
    for (const t of groupTags) {
      labels.push(t.shortLabel ?? t.label);
    }
  }

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-bold text-foreground">
      {labels.map((label, i) => (
        <span key={i}>#{label}</span>
      ))}
    </div>
  );
}

function AdminGuestSignEditor({
  slotId,
  dow,
  initialSlots,
}: {
  slotId: string;
  dow: HotdealDow;
  initialSlots: HotdealTimeSlot[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(
    initialSlots[0]?.text ?? ""
  );
  const [benefits, setBenefits] = useState<string[]>(
    initialSlots[0]?.benefits ?? []
  );
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleBenefit = (val: string) => {
    setBenefits((prev) =>
      prev.includes(val) ? prev.filter((b) => b !== val) : [...prev, val]
    );
  };

  const addCustom = () => {
    const t = customText.trim();
    if (!t || benefits.includes(t)) return;
    setBenefits([...benefits, t]);
    setCustomText("");
  };

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error("멘트를 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      const newSlot: HotdealTimeSlot = {
        until: null,
        text: text.trim(),
        benefits,
      };
      const { data, error } = await supabase.rpc("update_hotdeal_benefit", {
        p_slot_id: slotId,
        p_dow: dow,
        p_slots: [newSlot],
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error ?? "저장 실패");
        return;
      }
      toast.success("저장됐어요. 새로고침해주세요");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-8 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-black hover:bg-red-500/20"
      >
        ⚙ Admin 수정 (오늘 혜택)
      </button>
    );
  }

  const customs = benefits.filter(
    (b) => !GUEST_SIGN_BENEFIT_PRESETS.some((p) => p.value === b)
  );

  return (
    <div className="space-y-2 bg-card/60 border border-red-500/30 rounded-xl p-3">
      <p className="text-[10px] text-red-300 font-black">⚙ Admin 모드 — 오늘({dow}) 혜택</p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 입구에서 '나플' 무료입장"
        disabled={saving}
        className="w-full h-9 rounded-lg bg-card border border-border px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap gap-1">
        {GUEST_SIGN_BENEFIT_PRESETS.map((p) => {
          const active = benefits.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              disabled={saving}
              onClick={() => toggleBenefit(p.value)}
              className={`h-7 px-2.5 rounded-full text-[11px] font-bold border ${
                active
                  ? "bg-amber-500/20 text-brand-amber border-amber-500/50"
                  : "bg-card text-muted-foreground border-border"
              }`}
            >
              {p.emoji} {p.label}
            </button>
          );
        })}
        {customs.map((c) => (
          <button
            key={c}
            type="button"
            disabled={saving}
            onClick={() => toggleBenefit(c)}
            className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-brand-amber border border-amber-500/50 inline-flex items-center gap-1"
          >
            {benefitLabel(c).emoji && <span>{benefitLabel(c).emoji}</span>} {c}
            <span className="text-brand-amber dark:text-brand-amber/70">×</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter는 조합 확정용 — 중복/잘림 막기
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="혜택 직접입력"
          disabled={saving}
          maxLength={20}
          className="flex-1 h-8 rounded-lg bg-card border border-border px-2 text-[11px] text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={saving || !customText.trim()}
          className="h-8 px-3 rounded-lg bg-muted text-foreground text-[11px] font-bold disabled:opacity-50"
        >
          추가
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-muted text-foreground/80 text-[12px] font-bold"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-amber-500 text-black text-[12px] font-black disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
