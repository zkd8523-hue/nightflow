"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronRight, MapPin, MessageCircle, Music } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_GENRE_MAP } from "@/lib/users/musicGenres";

interface PeekProfile {
  id: string;
  display_name: string;
  profile_image: string | null;
  bio: string | null;
  role: string | null;
  preferred_music_genres: string[] | null;
  preferred_areas: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  /** 이미 아는 값 — 로딩 중에도 바로 보여주기 위한 폴백 */
  fallbackName?: string | null;
  fallbackImage?: string | null;
  currentUserId?: string;
  onRequireLogin?: () => void;
}

/**
 * 유저 프로필 미리보기 팝업 — 채팅에서 프사/이름을 누르면 열린다.
 * 카카오 프로필 팝업 형태: 프사를 배경으로 깐 카드 + 하단 액션 2분할.
 * 바로 /u/{id}로 튕기지 않고, 정보를 먼저 보여준 뒤 고르게 한다(대화 맥락 유지).
 */
export function UserPeekSheet({
  open,
  onOpenChange,
  userId,
  fallbackName,
  fallbackImage,
  currentUserId,
  onRequireLogin,
}: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  /** 수락 게이트 없이 바로 1:1 채팅방으로 (Migration 470) */
  async function openDm() {
    if (!currentUserId) {
      onOpenChange(false);
      onRequireLogin?.();
      return;
    }
    setOpening(true);
    const { data, error } = await createClient().rpc("open_dm", {
      p_recipient_id: userId,
      p_shot_id: null,
    });
    setOpening(false);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("blocked")) toast.error("차단된 상대예요");
      else if (msg.includes("cannot_dm_self")) toast.error("본인에게는 보낼 수 없어요");
      else if (msg.includes("does not exist")) toast.error("DM 마이그레이션 미적용 (470)");
      else toast.error("채팅방을 열지 못했어요");
      return;
    }
    onOpenChange(false);
    router.push(`/dm/${data}`);
  }

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    createClient()
      .from("public_user_profiles")
      .select(
        "id, display_name, profile_image, bio, role, preferred_music_genres, preferred_areas"
      )
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile((data as PeekProfile) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const name = profile?.display_name ?? fallbackName ?? "익명";
  const image = profile?.profile_image ?? fallbackImage ?? null;
  const isMe = !!currentUserId && currentUserId === userId;
  const genres = (profile?.preferred_music_genres ?? [])
    .map((g) => {
      const def = MUSIC_GENRE_MAP[g];
      return def ? `${def.emoji} ${def.label}` : g;
    })
    .slice(0, 3);
  const areas = (profile?.preferred_areas ?? []).slice(0, 3);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="p-0 border-0 bg-transparent shadow-none max-w-[320px] sm:max-w-[320px]"
        >
          <DialogTitle className="sr-only">{name} 프로필</DialogTitle>

          <div className="w-full rounded-3xl overflow-hidden bg-card border border-border">
            <div className="p-5 flex flex-col items-center gap-2 text-center">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted ring-1 ring-white/10">
                {image ? (
                  <Image src={image} alt={name} fill sizes="80px" className="object-cover" priority />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/50 text-[26px] font-black">
                    {name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
                <span className="text-foreground text-[19px] font-black truncate">{name}</span>
                {profile?.role === "md" && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black leading-none shrink-0">
                    <BadgeCheck className="w-3 h-3" />
                    파트너
                  </span>
                )}
              </div>

              {profile?.bio ? (
                <p className="text-[13px] text-muted-foreground line-clamp-3 leading-relaxed">
                  {profile.bio}
                </p>
              ) : loading ? (
                <p className="text-[13px] text-muted-foreground">불러오는 중...</p>
              ) : null}

              {(areas.length > 0 || genres.length > 0) && (
                <div className="flex flex-wrap items-center justify-center gap-1 mt-0.5">
                  {areas.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-card text-foreground/80 text-[11px] font-bold"
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      {a}
                    </span>
                  ))}
                  {genres.map((g) => (
                    <span
                      key={g}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-card text-foreground/80 text-[11px] font-bold"
                    >
                      <Music className="w-2.5 h-2.5" />
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 액션 — 하단 2분할 */}
            <div className="flex items-stretch border-t border-border">
              {!isMe && (
                <>
                  <button
                    type="button"
                    onClick={openDm}
                    disabled={opening}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-foreground text-[14px] font-black active:bg-white/5 disabled:text-muted-foreground"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {opening ? "여는 중..." : "1:1 채팅"}
                  </button>
                  <div className="w-px bg-muted" />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/u/${userId}`);
                }}
                className="flex-1 flex items-center justify-center gap-0.5 py-3.5 text-foreground/80 text-[14px] font-black active:bg-white/5"
              >
                프로필
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
