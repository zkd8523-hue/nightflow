"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, MapPin, Music, BadgeCheck, Camera, ChevronRight, Instagram } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { MUSIC_GENRE_MAP } from "@/lib/users/musicGenres";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ProfileEditSheet, type ProfileEditSection } from "./ProfileEditSheet";



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

interface Props {
  profile: ProfileData;
  reviewCount: number;
  pinnedClubs: PinnedClub[];
  partnerClubs: PartnerClub[];
  isMe: boolean;
}

export function PublicProfileView({
  profile,
  reviewCount,
  pinnedClubs,
  partnerClubs,
  isMe,
}: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
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
  const [verifyOpen, setVerifyOpen] = useState(false);
  const verifyRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // 상단 프로필 이미지를 눌러 바로 사진 변경
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("이미지는 2MB 이하만 업로드 가능합니다");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("users")
        .update({ profile_image: publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

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
    <div className="min-h-screen bg-[#0A0A0A] text-white max-w-lg mx-auto pb-12">
      {/* 상단: 뒤로가기 */}
      <div className="px-4 pt-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* 상단: 사진 + 이름 (인스타 스타일 가로 배치) */}
      <div className="px-4 mt-2">
        <div className="flex items-start gap-4 pt-1">
          {/* 원형 프로필 (본인이면 클릭해서 사진 변경) */}
          {isMe ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              aria-label="프로필 사진 변경"
              className="relative w-24 h-24 shrink-0 active:scale-95 transition-transform disabled:opacity-60"
            >
              {/* 원형 이미지 영역 (여기에만 overflow-hidden) */}
              <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-800 ring-2 ring-neutral-700">
                {profileImage ? (
                  <Image
                    src={profileImage}
                    alt={displayName}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/60 text-4xl font-black">
                    {displayName.charAt(0)}
                  </div>
                )}
                {/* 업로드 중 오버레이 */}
                {uploadingImage && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-bold text-white">
                    업로드 중...
                  </span>
                )}
              </div>
              {/* 카메라 배지 (원 밖에서 잘리지 않도록 버튼 기준 배치) */}
              <span className="absolute right-0.5 bottom-0.5 w-7 h-7 rounded-full bg-white flex items-center justify-center text-black ring-2 ring-[#0A0A0A]">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
          ) : (
            <div className="relative w-24 h-24 rounded-full overflow-hidden bg-neutral-800 shrink-0 ring-2 ring-neutral-700">
              {profileImage ? (
                <Image
                  src={profileImage}
                  alt={displayName}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-4xl font-black">
                  {displayName.charAt(0)}
                </div>
              )}
            </div>
          )}
          {isMe && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          )}

          {/* 이름 + 배지 + 핸들 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-black leading-tight truncate tracking-tight">
                {displayName}
              </h1>
              {profile.md_status === "approved" && (
                <div
                  ref={verifyRef}
                  className="relative shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => setVerifyOpen((v) => !v)}
                    onMouseEnter={() => setVerifyOpen(true)}
                    onMouseLeave={() => setVerifyOpen(false)}
                    className="block active:scale-95 transition-transform"
                    aria-label="NightFlow 공식 파트너 인증 정보 보기"
                    aria-expanded={verifyOpen}
                  >
                    <BadgeCheck className="w-5 h-5 text-amber-400" />
                  </button>
                  {verifyOpen && (
                    <div
                      role="tooltip"
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 shadow-lg whitespace-nowrap text-[12px] font-bold text-amber-400 z-50"
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
            {/* MD 소속 클럽 한 줄 라벨 */}
            {profile.md_status === "approved" && partnerClubs.length > 0 && (
              <p className="text-[13px] text-amber-400/80 mt-1 truncate font-bold">
                {partnerClubs.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && " · "}
                    <Link href={`/clubs/${c.id}`} className="hover:text-amber-300 hover:underline">
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
                    className="text-[13px] text-neutral-500 truncate hover:text-neutral-300 active:opacity-70 transition-colors"
                  >
                    @{profile.md_unique_slug}
                  </a>
                ) : (
                  <p className="text-[13px] text-neutral-500 truncate">
                    @{profile.md_unique_slug}
                  </p>
                )}
              </div>
            )}

            {/* 자기소개 (사진 옆 영역, 3행 제한) */}
            {bio ? (
              <p className="mt-1.5 text-[13px] font-semibold leading-[1.45] whitespace-pre-wrap break-words line-clamp-3 text-white">
                {bio}
              </p>
            ) : isMe ? (
              <button
                onClick={() => setEditSection("bio")}
                className="mt-1.5 text-[12px] text-neutral-500 hover:text-neutral-300"
              >
                자기소개를 추가해보세요
              </button>
            ) : null}
          </div>
        </div>

        {/* 본인이면 편집 버튼 */}
        {isMe && (
          <button
            onClick={() => setEditSection("all")}
            className="mt-4 w-full h-9 rounded-lg bg-neutral-900 border border-neutral-800 text-[14px] font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            프로필 편집
          </button>
        )}

        {/* 음악 + 지역 (인스타 통계 자리 — 가로 2열, 값 없어도 뼈대는 항상 노출) */}
        <div className="mt-5 grid grid-cols-2 gap-4">
            {/* 좋아하는 음악 */}
            <div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-neutral-400 mb-1.5">
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
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-900 text-neutral-200"
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
                  className="text-[12px] text-neutral-500 hover:text-neutral-300"
                >
                  추가하기
                </button>
              ) : null}
            </div>

            {/* 자주 가는 곳 */}
            <div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-neutral-400 mb-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>자주 가는 곳</span>
              </div>
              {hasAreas ? (
                <div className="flex flex-wrap gap-1">
                  {areas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-900 text-neutral-200"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              ) : isMe ? (
                <button
                  onClick={() => setEditSection("area")}
                  className="text-[12px] text-neutral-500 hover:text-neutral-300"
                >
                  추가하기
                </button>
              ) : null}
            </div>
        </div>

        {/* 연락처 (유저 opt-in 공개 — contact_public). MD는 상단 핸들로 노출됨 */}
        {!profile.md_unique_slug && profile.contact_public && (profile.instagram || profile.kakao_open_chat_url) && (
          <div className="mt-5">
            <div className="text-[13px] font-bold text-neutral-400 mb-2">연락처</div>
            <div className="flex flex-wrap gap-2">
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[13px] font-bold text-neutral-200 hover:bg-neutral-800"
                >
                  <Instagram className="w-3.5 h-3.5 text-pink-400" />@{profile.instagram.replace(/^@/, "")}
                </a>
              )}
              {profile.kakao_open_chat_url && (
                <a
                  href={profile.kakao_open_chat_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[13px] font-bold text-neutral-200 hover:bg-neutral-800"
                >
                  💬 카카오 오픈채팅
                </a>
              )}
            </div>
          </div>
        )}

        {/* 좋아하는 클럽 (값 없어도 뼈대는 항상 노출) */}
        <div className="mt-5">
            <div className="text-[13px] font-bold text-neutral-400 mb-2">
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
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900">
                        {fc.club.thumbnail_url ? (
                          <Image
                            src={fc.club.thumbnail_url}
                            alt={fc.club.name}
                            fill
                            sizes="120px"
                            className="object-cover group-active:opacity-70 transition-opacity"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40 text-xl font-black">
                            {fc.club.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 text-[12px] font-bold text-white truncate">
                        {fc.club.name}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {fc.club.area}
                      </div>
                    </Link>
                  ) : null
                )}
              </div>
            ) : isMe ? (
              <button
                onClick={() => setEditSection("club")}
                className="text-[13px] text-neutral-500 hover:text-neutral-300"
              >
                선호 클럽을 추가해보세요
              </button>
            ) : null}
        </div>
      </div>

      {/* 구분선 */}
      <div className="mt-8 border-t border-neutral-900" />

      {/* 남의 프로필 → 내 프로필 꾸미기 유도 CTA (상대 프로필과 분리) */}
      {!isMe && (
        <div className="mt-10 flex flex-col items-center">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 h-9 pl-4 pr-3 rounded-full bg-white hover:bg-neutral-200 transition-colors"
          >
            <span className="text-[13px] font-black text-black">내 프로필 관리하기</span>
            <ChevronRight className="w-4 h-4 text-black" />
          </Link>
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
