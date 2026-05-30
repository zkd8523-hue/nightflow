"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Pencil, MapPin, Music, BadgeCheck } from "lucide-react";
import dayjs from "dayjs";
import { useState } from "react";
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

interface Props {
  profile: ProfileData;
  reviewCount: number;
  pinnedClubs: PinnedClub[];
  isMe: boolean;
}

export function PublicProfileView({
  profile,
  reviewCount,
  pinnedClubs,
  isMe,
}: Props) {
  const router = useRouter();
  const [bio, setBio] = useState(profile.bio);
  const [genres, setGenres] = useState<string[]>(
    profile.preferred_music_genres ?? []
  );
  const [areas, setAreas] = useState<string[]>(profile.preferred_areas ?? []);
  const [editing, setEditing] = useState(false);

  const joinedAt = dayjs(profile.created_at).format("YYYY년 M월");

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

      {/* 프로필 사진 + 액션 */}
      <div className="px-4 mt-2">
        <div className="flex items-end justify-between">
          {/* 큰 원형 프로필 */}
          <div className="relative w-28 h-28 rounded-full overflow-hidden bg-neutral-800">
            {profile.profile_image ? (
              <Image
                src={profile.profile_image}
                alt={profile.display_name}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60 text-4xl font-black">
                {profile.display_name.charAt(0)}
              </div>
            )}
          </div>

          {/* 본인이면 편집 버튼 */}
          {isMe && (
            <button
              onClick={() => setEditing(true)}
              className="mb-2 px-4 py-1.5 rounded-full border border-neutral-700 text-[13px] font-bold hover:bg-neutral-900 transition-colors flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              프로필 편집
            </button>
          )}
        </div>

        {/* 닉네임 + 파트너 배지 */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-black leading-tight">
              {profile.display_name}
            </h1>
            {profile.md_status === "approved" && (
              <span
                title="NightFlow 공식 파트너"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-black"
              >
                <BadgeCheck className="w-3 h-3" />
                <span>파트너</span>
              </span>
            )}
          </div>
          {profile.md_unique_slug && (
            <p className="text-[13px] text-neutral-500 mt-0.5">
              @{profile.md_unique_slug}
            </p>
          )}
        </div>

        {/* 자기소개 */}
        {bio ? (
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {bio}
          </p>
        ) : isMe ? (
          <button
            onClick={() => setEditing(true)}
            className="mt-3 text-[14px] text-neutral-500 hover:text-neutral-300"
          >
            자기소개를 추가해보세요
          </button>
        ) : null}

        {/* 가입일 */}
        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-neutral-500">
          <Calendar className="w-4 h-4" />
          <span>{joinedAt} 가입</span>
        </div>

        {/* 활동 지표 */}
        <div className="mt-3 flex items-center gap-4 text-[14px]">
          <div>
            <span className="font-black text-white">{reviewCount}</span>
            <span className="text-neutral-500 ml-1">리뷰</span>
          </div>
        </div>

        {/* 음악 장르 */}
        {(hasMusic || isMe) && (
          <div className="mt-5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-neutral-400 mb-2">
              <Music className="w-4 h-4" />
              <span>좋아하는 음악</span>
            </div>
            {hasMusic ? (
              <div className="flex flex-wrap gap-1.5">
                {genres.map((code) => {
                  const g = MUSIC_GENRE_MAP[code];
                  if (!g) return null;
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold bg-neutral-900 text-neutral-200"
                    >
                      <span>{g.emoji}</span>
                      <span>{g.label}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-[13px] text-neutral-500 hover:text-neutral-300"
              >
                좋아하는 음악 장르를 추가해보세요
              </button>
            )}
          </div>
        )}

        {/* 주로 가는 지역 */}
        {(hasAreas || isMe) && (
          <div className="mt-5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-neutral-400 mb-2">
              <MapPin className="w-4 h-4" />
              <span>주로 가는 지역</span>
            </div>
            {hasAreas ? (
              <div className="flex flex-wrap gap-1.5">
                {areas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-neutral-900 text-neutral-200"
                  >
                    {area}
                  </span>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-[13px] text-neutral-500 hover:text-neutral-300"
              >
                주로 가는 지역을 추가해보세요
              </button>
            )}
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
            bio: bio ?? "",
            genres,
            areas,
            pinnedClubs: pinnedClubs
              .map((fc) => fc.club)
              .filter((c): c is NonNullable<typeof c> => c !== null),
          }}
          onSaved={(next) => {
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
