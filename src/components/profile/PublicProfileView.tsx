"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, MapPin, Music, BadgeCheck } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { MUSIC_GENRE_MAP } from "@/lib/users/musicGenres";
import { ProfileEditSheet } from "./ProfileEditSheet";



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
  const [bio, setBio] = useState(profile.bio);
  const [genres, setGenres] = useState<string[]>(
    profile.preferred_music_genres ?? []
  );
  const [areas, setAreas] = useState<string[]>(profile.preferred_areas ?? []);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [profileImage, setProfileImage] = useState<string | null>(
    profile.profile_image
  );
  const [editing, setEditing] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const verifyRef = useRef<HTMLDivElement | null>(null);

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
          {/* 원형 프로필 */}
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
                {partnerClubs.map((c) => c.name).join(" · ")}
              </p>
            )}
            {profile.md_unique_slug && (
              profile.instagram ? (
                <a
                  href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[13px] text-neutral-500 mt-0.5 truncate hover:text-neutral-300 active:opacity-70 transition-colors"
                >
                  @{profile.md_unique_slug}
                </a>
              ) : (
                <p className="text-[13px] text-neutral-500 mt-0.5 truncate">
                  @{profile.md_unique_slug}
                </p>
              )
            )}

            {/* 자기소개 (사진 옆 영역, 3행 제한) */}
            {bio ? (
              <p className="mt-1.5 text-[13px] font-semibold leading-[1.45] whitespace-pre-wrap break-words line-clamp-3 text-white">
                {bio}
              </p>
            ) : isMe ? (
              <button
                onClick={() => setEditing(true)}
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
            onClick={() => setEditing(true)}
            className="mt-4 w-full h-9 rounded-lg bg-neutral-900 border border-neutral-800 text-[14px] font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            프로필 편집
          </button>
        )}

        {/* 음악 + 지역 (인스타 통계 자리 — 가로 2열) */}
        {(hasMusic || hasAreas || isMe) && (
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
                  onClick={() => setEditing(true)}
                  className="text-[12px] text-neutral-500 hover:text-neutral-300"
                >
                  추가하기
                </button>
              ) : (
                <span className="text-[12px] text-neutral-600">-</span>
              )}
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
                  onClick={() => setEditing(true)}
                  className="text-[12px] text-neutral-500 hover:text-neutral-300"
                >
                  추가하기
                </button>
              ) : (
                <span className="text-[12px] text-neutral-600">-</span>
              )}
            </div>
          </div>
        )}


        {/* 좋아하는 클럽 */}
        {(hasPinnedClubs || isMe) && (
          <div className="mt-5">
            <div className="text-[13px] font-bold text-neutral-400 mb-2">
              좋아하는 클럽
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
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-[13px] text-neutral-500 hover:text-neutral-300"
              >
                좋아하는 클럽을 추가해보세요
              </button>
            )}
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div className="mt-8 border-t border-neutral-900" />

      {/* 편집 시트 */}
      {isMe && (
        <ProfileEditSheet
          open={editing}
          onOpenChange={setEditing}
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
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
