"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, X, Camera } from "lucide-react";
import { normalizeProfileImage } from "@/lib/utils/image";
import { compressImage } from "@/lib/utils/upload";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import {
  MUSIC_GENRES,
  MAX_MUSIC_GENRES,
  MAX_PREFERRED_AREAS,
  MAX_FAVORITE_CLUBS,
} from "@/lib/users/musicGenres";
import { AREA_OPTIONS } from "@/lib/clubs/tags";
import { findClubIdsByAlias } from "@/lib/clubs/aliases";

const MAX_BIO_LENGTH = 160;

interface PinnedClubLite {
  id: string;
  name: string;
  area: string;
  thumbnail_url: string | null;
}

export type ProfileEditSection =
  | "all"
  | "bio"
  | "music"
  | "area"
  | "club";

const SECTION_TITLES: Record<ProfileEditSection, string> = {
  all: "프로필 편집",
  bio: "자기소개 편집",
  music: "좋아하는 음악",
  area: "주로 가는 지역",
  club: "선호 클럽",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 어떤 섹션을 노출할지. "all"이면 전체 폼 표시. 기본값 "all". */
  section?: ProfileEditSection;
  initial: {
    displayName: string;
    profileImage: string | null;
    bio: string;
    genres: string[];
    areas: string[];
    pinnedClubs: PinnedClubLite[];
  };
  onSaved: (next: {
    displayName: string;
    profileImage: string | null;
    bio: string | null;
    genres: string[];
    areas: string[];
  }) => void;
}

export function ProfileEditSheet({
  open,
  onOpenChange,
  section = "all",
  initial,
  onSaved,
}: Props) {
  // 어떤 섹션을 보여줄지 결정 (all이면 전부 노출)
  const showAll = section === "all";
  const showName = showAll;
  const showBio = showAll || section === "bio";
  const showMusic = showAll || section === "music";
  const showArea = showAll || section === "area";
  const showClub = showAll || section === "club";
  const { user } = useCurrentUser();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [profileImage, setProfileImage] = useState<string | null>(
    initial.profileImage
  );
  const [bio, setBio] = useState(initial.bio);
  const [genres, setGenres] = useState<string[]>(initial.genres);
  const [areas, setAreas] = useState<string[]>(initial.areas);
  const [favClubs, setFavClubs] = useState<PinnedClubLite[]>(
    initial.pinnedClubs
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 클럽 검색
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<PinnedClubLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(initial.displayName);
      setProfileImage(initial.profileImage);
      setBio(initial.bio);
      setGenres(initial.genres);
      setAreas(initial.areas);
      setFavClubs(initial.pinnedClubs);
      setClubQuery("");
      setClubResults([]);
    }
  }, [open, initial]);

  // 프로필 사진 업로드
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

      // 압축 후에도 과도하게 크면(비정상 케이스) 차단
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

      setProfileImage(publicUrl);
      toast.success("프로필 사진이 변경되었습니다");
    } catch {
      toast.error("업로드에 실패했습니다");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImageDelete() {
    if (!user) return;
    if (!confirm("프로필 사진을 삭제하고 기본 이미지로 변경할까요?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ profile_image: null })
      .eq("id", user.id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    setProfileImage(null);
    toast.success("기본 이미지로 변경되었습니다");
  }

  // 클럽 검색 (디바운스)
  // 등록명 부분일치(ilike) + 정적 별칭(aliases.ts) 매칭을 합쳐서 노출.
  // "에이스"/"버뮤다"/"디엠" 같은 한글 별칭 검색도 가능.
  useEffect(() => {
    if (!clubQuery.trim()) {
      setClubResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const q = clubQuery.trim();
      const supabase = createClient();

      const aliasMatchIds = findClubIdsByAlias(q);
      const baseSelect = "id, name, area, thumbnail_url";

      const [nameRes, aliasRes] = await Promise.all([
        supabase
          .from("clubs")
          .select(baseSelect)
          .ilike("name", `%${q}%`)
          .is("deleted_at", null)
          .limit(8),
        aliasMatchIds.length > 0
          ? supabase
              .from("clubs")
              .select(baseSelect)
              .in("id", aliasMatchIds)
              .is("deleted_at", null)
          : Promise.resolve({ data: [] as PinnedClubLite[] }),
      ]);

      // 중복 제거 + 최대 8개
      const seen = new Set<string>();
      const merged: PinnedClubLite[] = [];
      for (const c of [
        ...((nameRes.data ?? []) as PinnedClubLite[]),
        ...((aliasRes.data ?? []) as PinnedClubLite[]),
      ]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
        if (merged.length >= 8) break;
      }

      setSearching(false);
      setClubResults(merged);
    }, 250);
    return () => clearTimeout(handle);
  }, [clubQuery]);

  function toggleGenre(code: string) {
    setGenres((prev) => {
      if (prev.includes(code)) return prev.filter((g) => g !== code);
      if (prev.length >= MAX_MUSIC_GENRES) {
        toast.error(`음악 장르는 최대 ${MAX_MUSIC_GENRES}개까지 선택할 수 있습니다`);
        return prev;
      }
      return [...prev, code];
    });
  }

  function toggleArea(area: string) {
    setAreas((prev) => {
      if (prev.includes(area)) return prev.filter((a) => a !== area);
      if (prev.length >= MAX_PREFERRED_AREAS) {
        toast.error(`지역은 최대 ${MAX_PREFERRED_AREAS}개까지 선택할 수 있습니다`);
        return prev;
      }
      return [...prev, area];
    });
  }

  function addFavClub(club: PinnedClubLite) {
    setFavClubs((prev) => {
      if (prev.some((c) => c.id === club.id)) {
        toast.info("이미 추가된 클럽입니다");
        return prev;
      }
      if (prev.length >= MAX_FAVORITE_CLUBS) {
        toast.error(`선호 클럽은 최대 ${MAX_FAVORITE_CLUBS}개까지 등록할 수 있습니다`);
        return prev;
      }
      return [...prev, club];
    });
    setClubQuery("");
    setClubResults([]);
  }

  function removeFavClub(clubId: string) {
    setFavClubs((prev) => prev.filter((c) => c.id !== clubId));
  }

  async function handleSave() {
    if (!user) return;

    // 닉네임 검증 (서버에서도 한 번 더 검증함) — 닉네임 섹션이 보일 때만 검증
    const trimmedName = displayName.trim();
    if (showName && (trimmedName.length < 2 || trimmedName.length > 16)) {
      toast.error("닉네임은 2~16자로 입력해주세요");
      return;
    }
    if (showBio && bio.length > MAX_BIO_LENGTH) {
      toast.error(`자기소개는 ${MAX_BIO_LENGTH}자 이하로 작성해주세요`);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const newBio = bio.trim() === "" ? null : bio.trim();

    // 0. 닉네임 변경된 경우 서버 API로 처리 (제한/중복 체크 포함)
    //    닉네임 변경은 14일에 최대 2회 (인스타그램 "이름" 변경 정책과 동일)
    if (showName && trimmedName !== initial.displayName) {
      try {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: trimmedName }),
        });
        const result = await res.json();
        if (!res.ok) {
          // 변경 횟수 초과 시 다음 가능 일자 안내
          if (res.status === 429 && result.next_available_at) {
            const d = new Date(result.next_available_at);
            const when = `${d.getMonth() + 1}월 ${d.getDate()}일`;
            throw new Error(
              `${result.error ?? "닉네임 변경 횟수를 초과했어요."} (${when}부터 다시 변경 가능)`
            );
          }
          throw new Error(result.error || "닉네임 저장에 실패했습니다");
        }
      } catch (e) {
        setSaving(false);
        toast.error(e instanceof Error ? e.message : "닉네임 저장에 실패했습니다");
        return;
      }
    }

    // 1. users 테이블 (bio + 음악 + 지역 + 오픈채팅) — 보이는 섹션만 반영
    const userUpdate: {
      bio?: string | null;
      preferred_music_genres?: string[];
      preferred_areas?: string[];
    } = {};
    if (showBio) userUpdate.bio = newBio;
    if (showMusic) userUpdate.preferred_music_genres = genres;
    if (showArea) userUpdate.preferred_areas = areas;

    if (Object.keys(userUpdate).length > 0) {
      const { error: userErr } = await supabase
        .from("users")
        .update(userUpdate)
        .eq("id", user.id);

      if (userErr) {
        setSaving(false);
        toast.error("프로필 저장에 실패했습니다");
        console.error(userErr);
        return;
      }
    }

    // 2. user_pinned_clubs: 전체 삭제 후 재삽입 (간단/정확) — 클럽 섹션일 때만
    if (showClub) {
      const { error: delErr } = await supabase
        .from("user_pinned_clubs")
        .delete()
        .eq("user_id", user.id);

      if (delErr) {
        setSaving(false);
        toast.error("선호 클럽 저장에 실패했습니다");
        console.error(delErr);
        return;
      }

      if (favClubs.length > 0) {
        const rows = favClubs.map((c, idx) => ({
          user_id: user.id,
          club_id: c.id,
          sort_order: idx,
        }));
        const { error: insErr } = await supabase
          .from("user_pinned_clubs")
          .insert(rows);
        if (insErr) {
          setSaving(false);
          toast.error("선호 클럽 저장에 실패했습니다");
          console.error(insErr);
          return;
        }
      }
    }

    setSaving(false);
    toast.success("프로필이 저장되었습니다");
    onSaved({
      displayName: trimmedName,
      profileImage,
      bio: newBio,
      genres,
      areas,
    });
  }

  const remaining = MAX_BIO_LENGTH - bio.length;
  const isOverLimit = remaining < 0;

  // 변경사항 여부 (보이는 섹션 기준) — 사진은 즉시 저장되므로 dirty 계산에서 제외
  const sameStringArray = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const nameDirty = showName && displayName.trim() !== initial.displayName;
  const bioDirty = showBio && bio.trim() !== (initial.bio ?? "").trim();
  const musicDirty = showMusic && !sameStringArray(genres, initial.genres);
  const areaDirty = showArea && !sameStringArray(areas, initial.areas);
  const clubDirty =
    showClub &&
    !sameStringArray(
      favClubs.map((c) => c.id),
      initial.pinnedClubs.map((c) => c.id)
    );
  const isDirty =
    nameDirty || bioDirty || musicDirty || areaDirty || clubDirty;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-card border-border text-foreground rounded-t-3xl max-w-lg mx-auto p-0 max-h-[90vh] overflow-y-auto"
      >
        <SheetHeader className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <SheetTitle className="text-foreground text-[17px] font-bold text-left">
            {SECTION_TITLES[section]}
          </SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-6">
          {/* 프로필 사진 (닉네임 섹션에서만 노출) */}
          {showName && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="relative w-24 h-24 rounded-full overflow-hidden bg-muted ring-2 ring-border active:scale-95 transition-transform disabled:opacity-50"
              aria-label="프로필 사진 변경"
            >
              {profileImage ? (
                <Image
                  src={normalizeProfileImage(profileImage)!}
                  alt="프로필 사진"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground/40 text-3xl font-black">
                  {(displayName || "?").charAt(0)}
                </div>
              )}
              <span className="absolute right-0 bottom-0 w-7 h-7 rounded-full bg-inverse flex items-center justify-center text-inverse-foreground">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              // display:none 인풋은 일부 안드로이드 WebView에서 .click()이 무시됨 → sr-only(레이아웃 유지)
              className="sr-only"
            />
            {profileImage && (
              <button
                type="button"
                onClick={handleImageDelete}
                className="text-[12px] text-muted-foreground hover:text-foreground/80"
              >
                기본 이미지로 변경
              </button>
            )}
          </div>
          )}

          {/* 닉네임 */}
          {showName && (
          <div>
            <label className="block text-[13px] font-bold text-muted-foreground mb-2">
              닉네임
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="닉네임 (2~16자)"
                maxLength={16}
                className="w-full bg-background border border-border rounded-xl pl-3 pr-16 py-2.5 text-[15px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground tabular-nums">
                {displayName.length} / 16
              </span>
            </div>
          </div>
          )}

          {/* 자기소개 */}
          {showBio && (
          <div>
            <label className="block text-[13px] font-bold text-muted-foreground mb-2">
              자기소개
            </label>
            <div className="relative">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="자기소개를 입력해주세요"
                rows={3}
                className="w-full bg-background border border-border rounded-xl px-3 pt-2.5 pb-7 text-[15px] text-foreground placeholder-neutral-600 resize-none focus:outline-none focus:border-border"
                maxLength={MAX_BIO_LENGTH + 50}
              />
              <span
                className={`pointer-events-none absolute bottom-2.5 right-3 text-[12px] tabular-nums ${
                  isOverLimit ? "text-red-500" : "text-muted-foreground"
                }`}
              >
                {bio.length} / {MAX_BIO_LENGTH}
              </span>
            </div>
          </div>
          )}

          {/* 좋아하는 음악 */}
          {showMusic && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-bold text-muted-foreground">
                좋아하는 음악
              </label>
              <span className="text-[12px] text-muted-foreground">
                {genres.length} / {MAX_MUSIC_GENRES}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_GENRES.map((g) => {
                const active = genres.includes(g.code);
                return (
                  <button
                    key={g.code}
                    onClick={() => toggleGenre(g.code)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                      active
                        ? "bg-inverse text-inverse-foreground"
                        : "bg-card text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    <span>{g.emoji}</span>
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* 주로 가는 지역 */}
          {showArea && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-bold text-muted-foreground">
                주로 가는 지역
              </label>
              <span className="text-[12px] text-muted-foreground">
                {areas.length} / {MAX_PREFERRED_AREAS}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AREA_OPTIONS.map((area) => {
                const active = areas.includes(area);
                return (
                  <button
                    key={area}
                    onClick={() => toggleArea(area)}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                      active
                        ? "bg-inverse text-inverse-foreground"
                        : "bg-card text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* 좋아하는 클럽 */}
          {showClub && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-bold text-muted-foreground">
                선호 클럽
              </label>
              <span className="text-[12px] text-muted-foreground">
                {favClubs.length} / {MAX_FAVORITE_CLUBS}
              </span>
            </div>

            {/* 선택된 클럽 (가로 카드) */}
            {favClubs.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {favClubs.map((c) => (
                  <div key={c.id} className="relative">
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-card border border-border">
                      {c.thumbnail_url ? (
                        <Image
                          src={c.thumbnail_url}
                          alt={c.name}
                          fill
                          sizes="120px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-foreground/40 text-xl font-black">
                          {c.name.charAt(0)}
                        </div>
                      )}
                      <button
                        onClick={() => removeFavClub(c.id)}
                        aria-label="삭제"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 backdrop-blur flex items-center justify-center text-foreground hover:bg-background"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-foreground truncate">
                      {c.name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 검색 */}
            {favClubs.length < MAX_FAVORITE_CLUBS && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={clubQuery}
                    onChange={(e) => setClubQuery(e.target.value)}
                    placeholder="클럽 이름으로 검색"
                    className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border"
                  />
                </div>

                {searching && (
                  <p className="mt-2 text-[12px] text-muted-foreground">검색 중...</p>
                )}

                {!searching && clubResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                    {clubResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addFavClub(c)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-card text-left"
                      >
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-card shrink-0">
                          {c.thumbnail_url ? (
                            <Image
                              src={c.thumbnail_url}
                              alt={c.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-foreground/40 text-sm font-black">
                              {c.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold text-foreground truncate">
                            {c.name}
                          </div>
                          <div className="text-[12px] text-muted-foreground">
                            {c.area}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!searching && clubQuery.trim() && clubResults.length === 0 && (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    검색 결과가 없습니다
                  </p>
                )}
              </>
            )}
          </div>
          )}

          {/* 저장 버튼 */}
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-2">
            <button
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 h-12 rounded-full border border-border font-bold text-[15px] hover:bg-card disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || isOverLimit || !isDirty}
              className={`flex-1 h-12 rounded-full font-black text-[15px] transition-colors ${
                saving || isOverLimit || !isDirty
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-inverse text-inverse-foreground hover:opacity-90"
              }`}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
