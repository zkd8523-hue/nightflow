"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  Music,
  Cigarette,
  CigaretteOff,
  Shirt,
  Heart,
  MessageCircle,
  Disc3,
  Copy,
  Check,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { uploadImage } from "@/lib/utils/upload";
import { toast } from "sonner";
import { AuctionList } from "@/components/auctions/AuctionList";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { DrinkMenuViewer } from "./DrinkMenuViewer";
import { ClubLocationModal } from "./ClubLocationModal";
import { ClubProfileEditor } from "./ClubProfileEditor";
import { ClubInfoReportSheet } from "./ClubInfoReportSheet";
import { OneLinerSection } from "./OneLinerSection";
import { useIsClubPartner } from "@/hooks/useIsClubPartner";
import { getTagsByGroup, type ClubTagGroup } from "@/lib/clubs/tags";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction, HotdealDow, HotdealTimeSlot } from "@/types/database";
import { GUEST_SIGN_BENEFIT_PRESETS, benefitLabel } from "@/lib/utils/hotdeal";
import { adjustMockAuctionDates } from "@/lib/utils/mockDates";

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
}

interface ClubDetailContentProps {
  club: Club;
  activeAuctions: Auction[];
  guestSignSlot?: GuestSignSlotInfo | null;
}

export function ClubDetailContent({
  club,
  activeAuctions: rawActiveAuctions,
  guestSignSlot = null,
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

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [userBidMap, setUserBidMap] = useState<Map<string, number>>(new Map());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(club.thumbnail_url);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [guestSignCopied, setGuestSignCopied] = useState(false);
  const [clubTags, setClubTags] = useState<string[]>(club.tags ?? []);
  const [clubName, setClubName] = useState<string>(club.name);
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

  const flagHref = club.area
    ? `/flags/new?area=${encodeURIComponent(club.area)}`
    : "/flags/new";
  // 로그인 리다이렉트 파라미터를 게스트 간판 링크(?next=)와 통일
  const ctaHref = user ? flagHref : `/login?next=${encodeURIComponent(flagHref)}`;
  // 게스트 간판 MD가 있으면 본문에 이미 클럽 맥락 1순위 CTA(연락)가 있으므로
  // 지역 깃발 CTA는 숨겨 전환 충돌을 막는다. 없을 때만 노출.
  const showFlagCta = !guestSignSlot;

  return (
    <div className="container mx-auto max-w-lg px-4 pt-4 pb-40">
      {/* 클럽 정보 카드 */}
      <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden mb-6">
        <div
          className="relative w-full aspect-[4/3] bg-neutral-900"
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
              <p className="text-white font-black text-[15px]">여기에 놓으세요</p>
            </div>
          )}
            {/* 이미지 위 플로팅: 뒤로가기 + 찜. 임베드 모드(지도 모달)에선 뒤로가기 숨김. */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3 pointer-events-none">
              {!isEmbedded ? (
                <button
                  onClick={() => router.back()}
                  className="pointer-events-auto w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  <ArrowLeft className="w-7 h-7 text-white" />
                </button>
              ) : (
                <div />
              )}
              <div className="pointer-events-auto">
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
              <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[12px]">
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-[11px] font-bold rounded-full hover:bg-black/90 transition-colors">
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

        <FeatureIconRow tags={clubTags} />

        {isAdmin && (
          <div className="px-4 pt-3">
            <ClubProfileEditor
              clubId={club.id}
              initialTags={clubTags}
              initialName={clubName}
              initialAddress={clubAddress}
              initialOperatingHours={clubOperatingHours}
              initialEntryFeeDetail={clubEntryFeeDetail}
              initialInstagram={clubInstagram}
              initialAliases={clubAliases}
              initialDresscode={clubDresscode}
              initialDrinkMenuUrl={clubDrinkMenuUrl}
              initialDrinkMenuUrls={clubDrinkMenuUrls}
              onSaved={(next) => {
                setClubTags(next.tags);
                setClubName(next.name);
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
              }}
            />
          </div>
        )}

        <div className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
            {/* H2로 강등 — 실제 H1은 page.tsx의 sr-only로 풍부한 SEO 본문이 됨.
                네이버 검색최적화 가이드: H1은 페이지당 1개만. */}
            <h2 className="text-2xl font-black text-white tracking-tight">
              {clubName}
            </h2>
            {club.area && (
              <span className="text-[13px] text-neutral-400">
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

          {/* 파트너 MD용 편집 Sheet (트리거 없이 외부 제어) */}
          {canPartnerEdit && (
            <ClubProfileEditor
              clubId={club.id}
              initialTags={clubTags}
              initialName={clubName}
              initialAddress={clubAddress}
              initialOperatingHours={clubOperatingHours}
              initialEntryFeeDetail={clubEntryFeeDetail}
              initialInstagram={clubInstagram}
              initialAliases={clubAliases}
              initialDresscode={clubDresscode}
              initialDrinkMenuUrl={clubDrinkMenuUrl}
              initialDrinkMenuUrls={clubDrinkMenuUrls}
              mode="partner"
              hideTrigger
              externalOpen={partnerEditorOpen}
              onExternalOpenChange={setPartnerEditorOpen}
              onSaved={(next) => {
                setClubTags(next.tags);
                setClubOperatingHours(next.operatingHours);
                setClubDresscode(next.dresscode);
              }}
            />
          )}

          {/* 게스트 간판 — 이번 주 차지 MD 정보 */}
          {guestSignSlot && (
            <div className="bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-3 space-y-2 mt-1">
              {guestSignSlot.today_benefit && (
                <div className="-mx-3 -mt-3 bg-amber-500 px-3 py-1.5 rounded-t-2xl">
                  <span className="text-black text-[12px] font-black tracking-tight">
                    {guestSignSlot.today_benefit}
                  </span>
                </div>
              )}
              {isAdmin && guestSignSlot.slot_id && guestSignSlot.today_dow && (
                <AdminGuestSignEditor
                  slotId={guestSignSlot.slot_id}
                  dow={guestSignSlot.today_dow}
                  initialSlots={guestSignSlot.today_slots ?? []}
                />
              )}
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                  {guestSignSlot.md.profile_image ? (
                    <Image
                      src={guestSignSlot.md.profile_image}
                      alt={guestSignSlot.md.display_name ?? "MD"}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40 font-black">
                      {(guestSignSlot.md.display_name ?? "M").charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-[13px] truncate">
                    {guestSignSlot.md.display_name ?? "담당 MD"}
                  </p>
                  <p className="text-neutral-500 text-[11px]">담당 MD</p>
                </div>
              </div>
              <div className={`grid gap-2 pt-1 ${guestSignSlot.md.kakao_open_chat_url ? "grid-cols-2" : "grid-cols-1"}`}>
                {guestSignSlot.md.instagram && (
                  <a
                    href={user ? `https://instagram.com/${guestSignSlot.md.instagram}` : `/login?next=/clubs/${club.id}`}
                    target={user ? "_blank" : undefined}
                    rel={user ? "noopener noreferrer" : undefined}
                    onClick={(e) => {
                      if (!user) {
                        e.preventDefault();
                        router.push(`/login?next=/clubs/${club.id}`);
                        return;
                      }
                      trackGuestSignClick(guestSignSlot.slot_id, "instagram");
                    }}
                    className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg px-2.5 py-2 flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <Instagram className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    <span className="text-white text-[11px] font-bold truncate">@{guestSignSlot.md.instagram}</span>
                  </a>
                )}
                {guestSignSlot.md.kakao_open_chat_url && (
                  <a
                    href={user ? guestSignSlot.md.kakao_open_chat_url : `/login?next=/clubs/${club.id}`}
                    target={user ? "_blank" : undefined}
                    rel={user ? "noopener noreferrer" : undefined}
                    onClick={(e) => {
                      if (!user) {
                        e.preventDefault();
                        router.push(`/login?next=/clubs/${club.id}`);
                        return;
                      }
                      trackGuestSignClick(guestSignSlot.slot_id, "openchat");
                    }}
                    className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg px-2.5 py-2 flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <span className="text-white text-[11px] font-bold truncate">오픈채팅</span>
                  </a>
                )}
              </div>
              {(guestSignSlot.md.instagram || guestSignSlot.md.kakao_open_chat_url) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!user) {
                      router.push(`/login?next=/clubs/${club.id}`);
                      return;
                    }
                    const benefit = guestSignSlot.today_benefit?.trim();
                    const message = [
                      "[나플 게스트 문의] 안녕하세요!",
                      `${clubName}${benefit ? ` "${benefit}"` : ""} 게스트 가능할까요?`,
                    ].join("\n");
                    try {
                      await navigator.clipboard.writeText(message);
                      setGuestSignCopied(true);
                      toast.success("메시지가 복사됐어요");
                      trackGuestSignClick(guestSignSlot.slot_id, "copy_message");
                      setTimeout(() => setGuestSignCopied(false), 2000);
                    } catch {
                      toast.error("복사에 실패했어요. 메시지를 길게 눌러 복사해주세요");
                    }
                  }}
                  className="w-full h-10 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 active:scale-95 transition-transform text-white font-bold text-[12px] inline-flex items-center justify-center gap-1.5"
                >
                  {guestSignCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {guestSignCopied ? "복사됐어요. 붙여넣어 보내세요" : "문의 메시지 복사하기"}
                </button>
              )}
            </div>
          )}

          {clubAddress && (
            <button
              onClick={() => setIsMapOpen(true)}
              className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-white transition-colors group w-full text-left"
            >
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 주소: </span>
              <span className="truncate">{clubAddress}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 text-neutral-500 group-hover:text-white" aria-hidden="true" />
            </button>
          )}

          {clubOperatingHours && (
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-400">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 영업시간: </span>
              <span>{clubOperatingHours}</span>
            </div>
          )}

          {clubEntryFeeDetail && (
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-400">
              <Ticket className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">{club.name} 입장료: </span>
              <span>{clubEntryFeeDetail}</span>
            </div>
          )}

          {clubDresscode && (
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-400">
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
              className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-pink-400 transition-colors mt-1"
            >
              <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">{club.name} 인스타그램: </span>
              @{clubInstagram}
            </a>
          )}

          {(clubDrinkMenuUrls.length > 0 || clubDrinkMenuUrl || club.drink_menu_url || club.floor_plan_url || (club.floor_plan_urls && club.floor_plan_urls.length > 0)) && (
            <DrinkMenuViewer
              urls={clubDrinkMenuUrls}
              url={clubDrinkMenuUrl ?? club.drink_menu_url}
              updatedAt={clubDrinkMenuUpdatedAt ?? club.drink_menu_updated_at}
              clubName={clubName}
              floorPlanUrl={club.floor_plan_url}
              floorPlanUrls={club.floor_plan_urls}
            />
          )}

          {/* 파트너 MD/admin: 눈에 띄는 편집 버튼 */}
          {user && canPartnerEdit && (
            <button
              type="button"
              onClick={() => setPartnerEditorOpen(true)}
              className="mt-3 inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition text-[13px] font-bold"
            >
              <Pencil className="w-3.5 h-3.5" />
              클럽 정보 수정하기 (해당 클럽 MD 전용)
            </button>
          )}

        </div>
      </div>

      {/* 카드 바깥: 잘못된 정보 신고 (비로그인 시 로그인 페이지로 유도) */}
      {!canPartnerEdit && (
        <div className="px-1 -mt-3 mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (!user) {
                router.push(`/login?next=/clubs/${club.id}`);
                return;
              }
              setReportSheetOpen(true);
            }}
            className="text-[11px] text-neutral-600 hover:text-amber-400 transition-colors underline decoration-dotted underline-offset-2"
          >
            정보 수정 요청
          </button>
        </div>
      )}

      {/* 정보 오류 신고 Sheet */}
      {user && (
        <ClubInfoReportSheet
          clubId={club.id}
          clubName={clubName}
          open={reportSheetOpen}
          onOpenChange={setReportSheetOpen}
        />
      )}

      {/* 경매 목록 */}
      <AuctionList
        activeAuctions={visibleAuctions}
        userBidMap={userBidMap}
        hideTabs
        hideAreaFilter
        hideShareEmptyState
        initialTab="share"
      />

      {/* 한 줄 리뷰 */}
      <OneLinerSection clubId={club.id} clubName={clubName} />

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
          className="fixed left-0 right-0 z-40 px-4 pt-4 pb-3 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent pointer-events-none"
          style={{ bottom: user ? "60px" : 0 }}
        >
          <div className="max-w-lg mx-auto pointer-events-auto">
            <Link
              href={ctaHref}
              className="flex items-center justify-center gap-2 w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-full shadow-lg shadow-black/40 transition-colors active:scale-[0.98]"
            >
              <span className="text-[18px]">⛳</span>
              {club.area
                ? `${club.area} 갈래? 깃발 꽂고 오퍼받기`
                : "깃발 꽂고 오퍼받기"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const FEATURE_ICONS: Record<string, LucideIcon> = {
  venue_type: Disc3,
  genre: Music,
  smoking: Cigarette,
};

function FeatureIconRow({
  tags,
  canPartnerEdit = false,
  onEdit,
}: {
  tags: string[];
  canPartnerEdit?: boolean;
  onEdit?: () => void;
}) {
  type Cell = { key: string; Icon: LucideIcon; value: string | null; groupLabel: string };
  const cells: Cell[] = [];

  // 표시 순서: 타입(venue_type) → 음악(genre) → 흡연(smoking)
  const ORDER: { key: ClubTagGroup; label: string }[] = [
    { key: "venue_type", label: "타입" },
    { key: "genre", label: "음악" },
    { key: "smoking", label: "흡연" },
  ];

  for (const item of ORDER) {
    const groupTags = getTagsByGroup(tags, item.key);
    if (groupTags.length === 0 && !canPartnerEdit) continue;
    // 다중 선택 그룹은 ' · ' 로 join, 단일은 첫 값만
    const value =
      groupTags.length === 0
        ? null
        : groupTags.map((t) => t.shortLabel ?? t.label).join(" · ");

    // smoking은 값에 따라 아이콘 분기 (흡연=Cigarette, 금연=CigaretteOff)
    let Icon = FEATURE_ICONS[item.key] ?? Music;
    if (item.key === "smoking" && groupTags.length > 0) {
      const isNotAllowed = groupTags.some((t) => t.key === "not_allowed");
      Icon = isNotAllowed ? CigaretteOff : Cigarette;
    }

    cells.push({
      key: item.key,
      Icon,
      value,
      groupLabel: item.label,
    });
  }

  if (cells.length === 0) return null;

  return (
    <div className="border-t border-b border-neutral-800 flex items-stretch divide-x divide-neutral-800">
      {cells.map(({ key, Icon, value, groupLabel }) => {
        const isEmpty = !value;
        const content = (
          <>
            <Icon
              className={`w-5 h-5 ${isEmpty ? "text-neutral-600" : "text-white"}`}
              strokeWidth={1.75}
            />
            <span
              className={`text-[11px] font-bold truncate max-w-full ${
                isEmpty
                  ? canPartnerEdit
                    ? "text-amber-300/80"
                    : "text-neutral-600"
                  : "text-white"
              }`}
            >
              {isEmpty ? (canPartnerEdit ? `+ ${groupLabel}` : groupLabel) : value}
            </span>
          </>
        );
        return isEmpty && canPartnerEdit && onEdit ? (
          <button
            key={key}
            type="button"
            onClick={onEdit}
            className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 py-3 px-2 hover:bg-neutral-900/50 transition-colors"
          >
            {content}
          </button>
        ) : (
          <div
            key={key}
            className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 py-3 px-2"
          >
            {content}
          </div>
        );
      })}
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
    <div className="space-y-2 bg-neutral-900/60 border border-red-500/30 rounded-xl p-3">
      <p className="text-[10px] text-red-300 font-black">⚙ Admin 모드 — 오늘({dow}) 혜택</p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 입구에서 '나플' 무료입장"
        disabled={saving}
        className="w-full h-9 rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 text-[12px] text-white placeholder:text-neutral-600"
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
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-neutral-900 text-neutral-500 border-neutral-700"
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
            className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 inline-flex items-center gap-1"
          >
            {benefitLabel(c).emoji} {c}
            <span className="text-amber-300/70">×</span>
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
          className="flex-1 h-8 rounded-lg bg-neutral-900 border border-neutral-700 px-2 text-[11px] text-white placeholder:text-neutral-600"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={saving || !customText.trim()}
          className="h-8 px-3 rounded-lg bg-neutral-800 text-white text-[11px] font-bold disabled:opacity-50"
        >
          추가
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-neutral-800 text-neutral-300 text-[12px] font-bold"
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
