"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Voter = {
  id: string;
  display_name: string | null;
  profile_image: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 표시용 단어 라벨 */
  label: string | null;
  /** 이 단어를 남긴 유저 id 목록 */
  authorIds: string[];
  /** 현재 로그인 유저 (본인 표시용) */
  myId?: string | null;
  /** 이 단어 좋아요 수 */
  likeCount?: number;
  /** 내가 좋아요 눌렀는지 */
  liked?: boolean;
  /** 좋아요 처리 중(연타 방지) */
  likeSaving?: boolean;
  /** 좋아요 토글 (비로그인이면 상위에서 로그인 유도) */
  onToggleLike?: () => void;
}

/**
 * 워드클라우드 단어 탭 시 뜨는 바텀시트.
 * "N명이 이 단어를 남겼어요" + 남긴 사람들 프로필 목록 → 클릭 시 공개 프로필로 이동.
 */
export function WordVotersSheet({
  open,
  onOpenChange,
  label,
  authorIds,
  myId,
  likeCount = 0,
  liked = false,
  likeSaving = false,
  onToggleLike,
}: Props) {
  const router = useRouter();
  const [voters, setVoters] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || authorIds.length === 0) {
      setVoters([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name, profile_image")
        .in("id", authorIds);
      if (cancelled) return;
      if (error) {
        console.error("[WordVotersSheet] fetch error", error);
        setVoters([]);
      } else {
        // authorIds 순서 유지, 본인은 맨 위로
        const byId = new Map((data ?? []).map((u) => [u.id, u as Voter]));
        const ordered = authorIds
          .map((id) => byId.get(id))
          .filter((v): v is Voter => Boolean(v));
        ordered.sort((a, b) => {
          if (a.id === myId) return -1;
          if (b.id === myId) return 1;
          return 0;
        });
        setVoters(ordered);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authorIds, myId]);

  function goProfile(id: string) {
    onOpenChange(false);
    router.push(`/u/${id}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-card border-border rounded-t-3xl max-w-lg mx-auto max-h-[75vh] p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
          <SheetTitle className="text-foreground text-[17px] font-black text-center">
            <span className="text-pink-400">{label}</span>
          </SheetTitle>
          <p className="text-[13px] text-muted-foreground text-center">
            {authorIds.length}명이 이 단어를 남겼어요
          </p>
          {onToggleLike && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={onToggleLike}
                disabled={likeSaving}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold transition-colors active:scale-95 disabled:opacity-60 ${
                  liked
                    ? "bg-pink-500/15 text-pink-400"
                    : "bg-muted text-foreground/80 hover:bg-muted"
                }`}
                aria-pressed={liked}
              >
                <Heart
                  className={`h-4 w-4 ${liked ? "fill-pink-400" : ""}`}
                  strokeWidth={2.5}
                />
                좋아요{likeCount > 0 ? ` ${likeCount}` : ""}
              </button>
            </div>
          )}
        </SheetHeader>

        <div className="overflow-y-auto px-3 pb-6 pt-1">
          {loading ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              불러오는 중...
            </p>
          ) : voters.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              표시할 프로필이 없어요
            </p>
          ) : (
            <ul className="flex flex-col">
              {voters.map((v) => {
                const isMe = v.id === myId;
                const name = v.display_name?.trim() || "익명";
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => goProfile(v.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted/70 active:bg-muted"
                    >
                      {v.profile_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.profile_image}
                          alt={name}
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-bold text-foreground/80">
                          {name.charAt(0)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-foreground">
                          {name}
                          {isMe && (
                            <span className="ml-1.5 text-[11px] font-bold text-pink-400">
                              나
                            </span>
                          )}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
