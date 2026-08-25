"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, MapPin, Music, BadgeCheck, Camera, ChevronRight, Instagram, MessageCircle, Star, Ticket } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { MUSIC_GENRE_MAP } from "@/lib/users/musicGenres";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/upload";
import { formatNumber } from "@/lib/utils/format";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ProfileEditSheet, type ProfileEditSection } from "./ProfileEditSheet";
import { BlockUserButton } from "@/components/users/BlockUserButton";



interface ProfileData {
  id: string;
  display_name: string;
  profile_image: string | null;
  bio: string | null;
  created_at: string;
  role: string;
  md_unique_slug: string | null;
  md_status: string | null;
  instagram: string | null;
  preferred_music_genres: string[] | null;
  preferred_areas: string[] | null;
  kakao_open_chat_url: string | null;
  contact_public?: boolean | null;
  md_avg_rating?: number | null;
  md_review_count?: number | null;
}

interface PartnerReview {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  created_at: string;
  club_name: string | null;
  reviewer_id: string | null;
  reviewer_display_name: string | null;
  reviewer_profile_image: string | null;
  delete_requested_at?: string | null;
  /** puzzle_offers.proposed_price 조인(Migration 498). 오퍼 삭제/미존재면 null */
  amount?: number | null;
}

interface PinnedClub {
  id: string;
  club_id: string;
  sort_order: number;
  club: {
    id: string;
    name: string;
    area: string;
    thumbnail_url: string | null;
  } | null;
}

interface PartnerClub {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
}

interface PartyReputationRow {
  like_count: number;
  tag: string | null;
  tag_count: number;
}

interface Props {
  profile: ProfileData;
  reviewCount: number;
  pinnedClubs: PinnedClub[];
  partnerClubs: PartnerClub[];
  /** 파트너가 받은 리뷰 (승인된 것만) — /md 통합으로 여기에 표시 */
  partnerReviews?: PartnerReview[];
  /** 파티 평판 (받은 👍 수 + 태그 집계) — 조각 참가자 상호리뷰 */
  partyReputation?: PartyReputationRow[];
  isMe: boolean;
  /** MY 탭 안에 끼워 넣을 때 — 뒤로가기·페이지 높이 제거 (내용은 동일) */
  embedded?: boolean;
}

export function PublicProfileView({
  profile,
  reviewCount,
  pinnedClubs,
  partnerClubs,
  partnerReviews = [],
  partyReputation = [],
  isMe,
  embedded = false,
}: Props) {
  const router = useRouter();
  const { user, refetch } = useCurrentUser();
  const [bio, setBio] = useState(profile.bio);
  const [genres, setGenres] = useState<string[]>(
    profile.preferred_music_genres ?? []
  );
  const [areas, setAreas] = useState<string[]>(profile.preferred_areas ?? []);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [profileImage, setProfileImage] = useState<string | null>(
    profile.profile_image
  );
  // 어떤 섹션을 편집할지. null이면 시트 닫힘.
  const [editSection, setEditSection] = useState<ProfileEditSection | null>(
    null
  );
  const [openingDm, setOpeningDm] = useState(false);
  // 삭제 요청한 리뷰 id (요청 직후 UI에 "검토 중" 즉시 반영)
  const [deleteRequestedIds, setDeleteRequestedIds] = useState<Set<string>>(new Set());

  const handleRequestReviewDeletion = async (reviewId: string) => {
    const reason = window.prompt("이 리뷰를 삭제 요청하는 이유를 적어주세요 (관리자 검토용)");
    if (reason === null) return; // 취소
    const { data, error } = await createClient().rpc("request_review_deletion", {
      p_review_id: reviewId,
      p_reason: reason,
    });
    if (error || !(data as { success?: boolean })?.success) {
      toast.error(error?.message || (data as { error?: string })?.error || "요청 실패");
      return;
    }
    setDeleteRequestedIds((prev) => new Set(prev).add(reviewId));
    toast.success("삭제 요청됨 · 관리자 검토 후 처리돼요");
  };

  /** 수락 게이트 없이 바로 1:1 채팅방으로 (Migration 470) */
  async function handleOpenDm() {
    if (!user) {
      toast.message("로그인이 필요해요");
      return;
    }
    setOpeningDm(true);
    const { data, error } = await createClient().rpc("open_dm", {
      p_recipient_id: profile.id,
      p_shot_id: null,
    });
    setOpeningDm(false);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("blocked")) toast.error("차단된 상대예요");
      else if (msg.includes("does not exist")) toast.error("DM 마이그레이션 미적용 (470)");
      else toast.error("채팅방을 열지 못했어요");
      return;
    }
    router.push(`/dm/${data}`);
  }
  const [verifyOpen, setVerifyOpen] = useState(false);
  const verifyRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // 쿠폰함 배지 — 아직 안 쓴 + 기한이 남은 장수 (MyCouponList의 "사용 가능" 기준과 동일)
  const [usableCoupons, setUsableCoupons] = useState(0);

  useEffect(() => {
    if (!isMe) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { count } = await supabase
        .from("coupon_claims")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      if (!cancelled) setUsableCoupons(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [isMe]);

  // 상단 프로필 이미지를 눌러 바로 사진 변경
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingImage(true);
    try {
      // 폰카 원본 사진은 보통 수 MB라 그대로 막으면 대부분 업로드가 실패한다.
      // 다른 업로드 경로(경매/클럽)와 동일하게 먼저 압축한다.
      const uploadFile = file.type.startsWith("image/")
        ? await compressImage(file, 1024, 0.8)
        : file;

      if (uploadFile.size > 5 * 1024 * 1024) {
        toast.error("이미지는 5MB 이하만 업로드 가능합니다");
        return;
      }

      const ext = (uploadFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, uploadFile, {
          upsert: true,
          contentType: uploadFile.type || "image/jpeg",
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("users")
        .update({ profile_image: publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

      await refetch();
      setProfileImage(publicUrl);
      toast.success("프로필 사진이 변경되었습니다");
      router.refresh();
    } catch {
      toast.error("업로드에 실패했습니다");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    if (!verifyOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (verifyRef.current && !verifyRef.current.contains(e.target as Node)) {
        setVerifyOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setVerifyOpen(false);
    }
    // 다음 tick에 리스너 추가 (열게 만든 클릭에 의해 즉시 닫히지 않도록)
    const t = setTimeout(() => {
      document.addEventListener("click", onClickOutside);
      document.addEventListener("keydown", onEsc);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [verifyOpen]);

  const hasMusic = genres.length > 0;
  const hasAreas = areas.length > 0;
  const hasPinnedClubs = pinnedClubs.length > 0;

  return (
    <div
      className={
        embedded
          ? "bg-background text-foreground"
          : "min-h-screen bg-background text-foreground max-w-lg mx-auto pb-12"
      }
    >
      {/* 상단: 뒤로가기 — MY 탭에 끼워 넣을 땐 그 페이지 헤더가 대신한다 */}
      {!embedded && (
        <div className="px-4 pt-3">
          <button
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-foreground hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 상단: 사진 + 이름 (인스타 스타일 가로 배치) — 명함처럼 카드로 감싸 페이지 배경과 구분 */}
      <div className="px-4 mt-2">
        <div className="bg-card border border-border rounded-3xl p-4">
        <div className="flex items-start gap-4 pt-1">
          {/* 원형 프로필 + 파트너 배지 (사진 아래로) */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
          {isMe ? (
            <div className="relative w-24 h-24 shrink-0 active:scale-95 transition-transform">
              {/* 원형 이미지 영역 (여기에만 overflow-hidden) */}
              <div className="relative w-full h-full rounded-full overflow-hidden bg-muted ring-2 ring-border">
                {profileImage ? (
                  <Image
                    src={profileImage}
                    alt={displayName}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/60 text-4xl font-black">
                    {displayName.charAt(0)}
                  </div>
                )}
                {/* 업로드 중 오버레이 */}
                {uploadingImage && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-bold text-foreground">
                    업로드 중...
                  </span>
                )}
              </div>
              {/* 카메라 배지 (원 밖에서 잘리지 않도록 컨테이너 기준 배치) */}
              <span className="pointer-events-none absolute right-0.5 bottom-0.5 w-7 h-7 rounded-full bg-inverse flex items-center justify-center text-inverse-foreground ring-2 ring-background">
                <Camera className="w-3.5 h-3.5" />
              </span>
              {/* 투명 파일 인풋을 아바타 전체에 덮어 손가락 탭이 인풋에 '직접' 닿게 한다.
                  JS로 .click()을 대신 호출하면 일부 안드로이드 WebView가 무시해 picker가 안 뜬다. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                aria-label="프로필 사진 변경"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
              />
            </div>
          ) : (
            <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border">
              {profileImage ? (
                <Image
                  src={profileImage}
                  alt={displayName}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground/60 text-4xl font-black">
                  {displayName.charAt(0)}
                </div>
              )}
            </div>
          )}
          {profile.md_status === "approved" && (
            <div ref={verifyRef} className="relative">
              <button
                type="button"
                onClick={() => setVerifyOpen((v) => !v)}
                onMouseEnter={() => setVerifyOpen(true)}
                onMouseLeave={() => setVerifyOpen(false)}
                className="block active:scale-95 transition-transform"
                aria-label="NightFlow 공식 파트너 인증 정보 보기"
                aria-expanded={verifyOpen}
              >
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-black leading-none">
                  <BadgeCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                  파트너
                </span>
              </button>
              {verifyOpen && (
                <div
                  role="tooltip"
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-card border border-border shadow-lg whitespace-nowrap text-[12px] font-bold text-blue-400 z-50"
                >
                  <span className="flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    NightFlow 공식 파트너
                  </span>
                  <span
                    aria-hidden
                    className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-neutral-900"
                  />
                </div>
              )}
            </div>
          )}
          </div>

          {/* 이름 + 핸들 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="min-w-0 text-xl font-black leading-tight break-words tracking-tight">
                {displayName}
              </h1>
              {/* 편집은 자주 하는 행동이 아니다 — 카드 아래 큰 버튼으로 두면
                  쿠폰함 같은 실제 목적지와 무게가 같아 보인다. 고치는 대상(이름) 옆
                  아이콘으로 줄인다. */}
              {isMe && (
                <button
                  onClick={() => setEditSection("all")}
                  aria-label="프로필 편집"
                  className="shrink-0 w-7 h-7 rounded-full bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted grid place-items-center active:scale-95 transition-all"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* MD 소속 클럽 한 줄 라벨 */}
            {profile.md_status === "approved" && partnerClubs.length > 0 && (
              <p className="text-[13px] text-brand-amber dark:text-brand-amber/80 mt-1 truncate font-bold">
                {partnerClubs.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && " · "}
                    <Link href={`/clubs/${c.id}`} className="hover:text-brand-amber hover:underline">
                      {c.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {/* 핸들 (인스타 연결) */}
            {profile.md_unique_slug && (
              <div className="flex items-center gap-2 mt-0.5 min-w-0">
                {profile.instagram ? (
                  <a
                    href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-muted-foreground truncate hover:text-foreground/80 active:opacity-70 transition-colors"
                  >
                    @{profile.md_unique_slug}
                  </a>
                ) : (
                  <p className="text-[13px] text-muted-foreground truncate">
                    @{profile.md_unique_slug}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 자기소개 — 사진 옆 좁은 영역 대신 카드 전체 폭을 쓰는 별도 줄 (3행 제한) */}
        {bio ? (
          <p className="mt-3 text-[13px] font-semibold leading-[1.45] whitespace-pre-wrap break-words line-clamp-3 text-foreground">
            {bio}
          </p>
        ) : isMe ? (
          <button
            onClick={() => setEditSection("bio")}
            className="mt-3 text-[12px] text-muted-foreground hover:text-foreground/80"
          >
            자기소개를 추가해보세요
          </button>
        ) : null}

        {/* 음악 + 지역 (인스타 통계 자리 — 가로 2열, 값 없어도 뼈대는 항상 노출) */}
        <div className="mt-5 grid grid-cols-2 gap-4">
            {/* 좋아하는 음악 */}
            <div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground mb-1.5">
                <Music className="w-3.5 h-3.5" />
                <span>음악</span>
              </div>
              {hasMusic ? (
                <div className="flex flex-wrap gap-1">
                  {genres.map((code) => {
                    const g = MUSIC_GENRE_MAP[code];
                    if (!g) return null;
                    return (
                      <span
                        key={code}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted text-foreground"
                      >
                        <span>{g.emoji}</span>
                        <span>{g.label}</span>
                      </span>
                    );
                  })}
                </div>
              ) : isMe ? (
                <button
                  onClick={() => setEditSection("music")}
                  className="text-[12px] text-muted-foreground hover:text-foreground/80"
                >
                  추가하기
                </button>
              ) : null}
            </div>

            {/* 자주 가는 곳 */}
            <div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground mb-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>자주 가는 곳</span>
              </div>
              {hasAreas ? (
                <div className="flex flex-wrap gap-1">
                  {areas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted text-foreground"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              ) : isMe ? (
                <button
                  onClick={() => setEditSection("area")}
                  className="text-[12px] text-muted-foreground hover:text-foreground/80"
                >
                  추가하기
                </button>
              ) : null}
            </div>
        </div>

        {/* 좋아하는 클럽 (값 없어도 뼈대는 항상 노출) */}
        <div className="mt-5">
            <div className="text-[13px] font-bold text-muted-foreground mb-2">
              선호 클럽
            </div>
            {hasPinnedClubs ? (
              <div className="grid grid-cols-3 gap-2">
                {pinnedClubs.map((fc) =>
                  fc.club ? (
                    <Link
                      key={fc.id}
                      href={`/clubs/${fc.club.id}`}
                      className="block group"
                    >
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border border-border">
                        {fc.club.thumbnail_url ? (
                          <Image
                            src={fc.club.thumbnail_url}
                            alt={fc.club.name}
                            fill
                            sizes="120px"
                            className="object-cover group-active:opacity-70 transition-opacity"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-foreground/40 text-xl font-black">
                            {fc.club.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 text-[12px] font-bold text-foreground truncate">
                        {fc.club.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {fc.club.area}
                      </div>
                    </Link>
                  ) : null
                )}
              </div>
            ) : isMe ? (
              <button
                onClick={() => setEditSection("club")}
                className="text-[13px] text-muted-foreground hover:text-foreground/80"
              >
                선호 클럽을 추가해보세요
              </button>
            ) : null}
        </div>

        {/* 연락처 — MD는 상시 공개, 일반 유저는 opt-in(contact_public) (public_user_profiles 뷰와 동일 기준).
            프로필 박스(p-4, rounded-3xl)의 마지막 요소라 좌우/하단을 -1rem으로 밀어붙여
            카드 아래 모서리가 박스 테두리와 그대로 이어지게 한다. 위쪽은 각지게 둬 구분선처럼 보이게. */}
        {(profile.role === "md" || profile.contact_public) && (profile.instagram || profile.kakao_open_chat_url) && (
          <div className="mt-4 -mx-4 -mb-4">
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 bg-card px-4 py-2.5 active:bg-muted transition-colors rounded-bl-3xl ${!profile.kakao_open_chat_url ? "rounded-br-3xl" : ""}`}
                >
                  <div className="w-7 h-7 rounded-full bg-pink-500/15 flex items-center justify-center flex-shrink-0">
                    <Instagram className="w-4 h-4 text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">인스타그램</p>
                    <p className="text-[13px] font-bold text-foreground truncate">@{profile.instagram.replace(/^@/, "")}</p>
                  </div>
                </a>
              )}
              {profile.kakao_open_chat_url && (
                <a
                  href={profile.kakao_open_chat_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 bg-card px-4 py-2.5 active:bg-muted transition-colors rounded-br-3xl ${!profile.instagram ? "rounded-bl-3xl" : ""}`}
                >
                  <div className="w-7 h-7 rounded-full bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">카카오</p>
                    <p className="text-[13px] font-bold text-foreground truncate">오픈채팅</p>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}
        </div>

        {/* 쿠폰함 진입 — 그동안 헤더 메뉴 안에만 있어 받은 쿠폰을 잊어버리기 쉬웠다.
            남은 장수를 같이 보여줘야 "쓸 게 있나" 열어볼 이유가 생긴다. */}
        {isMe && (
          <Link
            href="/my-coupons"
            className="mt-4 w-full h-11 rounded-xl bg-muted text-[14px] font-bold hover:bg-muted/70 transition-colors flex items-center gap-2 px-3.5"
          >
            <Ticket className="w-4 h-4 text-brand-amber shrink-0" />
            <span>내 쿠폰함</span>
            {usableCoupons > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-brand-amber text-[11px] font-black leading-none">
                {usableCoupons}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
          </Link>
        )}
      </div>

      {/* 구분선 */}
      <div className="mt-8 border-t border-border" />

      {/* 파티 평판 (받은 👍 + 태그) — 파티 참가자 상호리뷰. 👍 1개 이상일 때만 */}
      {(partyReputation[0]?.like_count ?? 0) > 0 && (
        <div className="px-4 mt-6">
          <div className="flex items-center gap-1.5 mb-3">
            <h2 className="text-[15px] font-black text-foreground">파티 평판</h2>
            <span className="text-[13px] font-bold text-muted-foreground">
              👍 {partyReputation[0].like_count}
            </span>
          </div>
          {partyReputation.some((r) => r.tag) && (
            <div className="flex flex-wrap gap-1.5">
              {partyReputation
                .filter((r) => r.tag)
                .map((r) => (
                  <span
                    key={r.tag}
                    className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25"
                  >
                    {r.tag} <span className="text-muted-foreground tabular-nums">{r.tag_count}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 파트너 리뷰 (승인된 것만) — /md 프로필 통합 */}
      {profile.md_status === "approved" && (
        <div className="px-4 mt-6">
          <div className="flex items-center gap-1.5 mb-3">
            <Star className="w-4 h-4 text-brand-amber fill-amber-400" />
            <h2 className="text-[15px] font-black text-foreground">리뷰</h2>
            {(profile.md_review_count ?? 0) > 0 && (
              <span className="text-[13px] font-bold text-muted-foreground">
                {(profile.md_avg_rating ?? 0).toFixed(1)} · {profile.md_review_count}개
              </span>
            )}
          </div>
          {partnerReviews.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-8 text-center">
              <p className="text-[13px] text-muted-foreground font-medium">아직 리뷰가 없어요</p>
              <p className="text-[11px] text-muted-foreground mt-1">방문 확인 후 리뷰가 쌓이면 표시돼요</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {partnerReviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-end gap-1.5">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${n <= r.rating ? "fill-amber-400 text-brand-amber" : "fill-transparent text-muted-foreground"}`}
                            strokeWidth={1.5}
                          />
                        ))}
                      </div>
                      {!!r.amount && (
                        <span className="text-[11px] font-bold text-muted-foreground leading-none">
                          ₩{formatNumber(r.amount)}
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] text-muted-foreground font-medium">
                      {new Date(r.created_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" })}
                    </span>
                  </div>
                  {r.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.tags.map((t) => (
                        <span key={t} className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.comment && <p className="text-[13px] text-foreground/80 break-keep">&ldquo;{r.comment}&rdquo;</p>}
                  <div className="flex items-center justify-between gap-2">
                    {r.reviewer_id ? (
                      <Link href={`/u/${r.reviewer_id}`} className="inline-block min-w-0 text-[11px] text-muted-foreground hover:text-foreground font-medium hover:underline truncate">
                        {r.reviewer_display_name || "익명"}
                      </Link>
                    ) : (
                      <p className="min-w-0 text-[11px] text-muted-foreground truncate">{r.reviewer_display_name || "익명"}</p>
                    )}
                    {/* 본인(파트너)만: 부당 리뷰 삭제 요청 → 어드민 검토 */}
                    {isMe && (
                      r.delete_requested_at || deleteRequestedIds.has(r.id) ? (
                        <span className="text-[11px] text-muted-foreground font-medium shrink-0">삭제 요청됨 · 검토 중</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestReviewDeletion(r.id)}
                          className="text-[11px] text-muted-foreground hover:text-red-400 font-medium shrink-0 transition-colors"
                        >
                          삭제 요청
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 남의 프로필 → 채팅하기 / 차단 (채팅 프로필 팝업과 동일한 액션) */}
      {!isMe && (
        <div className="mt-6 flex items-stretch rounded-2xl overflow-hidden bg-card border border-border mx-4">
          <button
            type="button"
            onClick={handleOpenDm}
            disabled={openingDm}
            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-foreground text-[14px] font-black active:bg-white/5 disabled:text-muted-foreground"
          >
            <MessageCircle className="w-4 h-4" />
            {openingDm ? "여는 중..." : "1:1 채팅"}
          </button>
          <div className="w-px bg-muted" />
          <div className="flex-1 flex items-center justify-center [&_button]:py-3.5 [&_span]:text-[14px] [&_span]:font-black [&_span]:text-muted-foreground [&_svg]:w-4 [&_svg]:h-4">
            <BlockUserButton
              targetUserId={profile.id}
              targetDisplayName={displayName}
            />
          </div>
        </div>
      )}

      {/* 편집 시트 */}
      {isMe && (
        <ProfileEditSheet
          open={editSection !== null}
          onOpenChange={(open) => {
            if (!open) setEditSection(null);
          }}
          section={editSection ?? "all"}
          initial={{
            displayName,
            profileImage,
            bio: bio ?? "",
            genres,
            areas,
            pinnedClubs: pinnedClubs
              .map((fc) => fc.club)
              .filter((c): c is NonNullable<typeof c> => c !== null),
          }}
          onSaved={(next) => {
            setDisplayName(next.displayName);
            setProfileImage(next.profileImage);
            setBio(next.bio);
            setGenres(next.genres);
            setAreas(next.areas);
            setEditSection(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
