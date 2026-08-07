"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Flag, Heart, Trash2 } from "lucide-react";
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
  /** 관리자 여부 (단어 삭제 UI 노출) */
  isAdmin?: boolean;
  /** 관리자 삭제. authorId=null 이면 클럽 전체에서 이 단어 제거 */
  onAdminDelete?: (authorId: string | null) => Promise<void>;
  /** 신고 (비로그인이면 상위에서 로그인 유도) */
  onReport?: () => void;
  /** 내가 남긴 단어인지 — 본인 단어는 신고 버튼 숨김 */
  isMine?: boolean;
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
  isAdmin = false,
  onAdminDelete,
  onReport,
  isMine = false,
}: Props) {
  const router = useRouter();
  const [voters, setVoters] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        .from("public_user_profiles")
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

  // 관리자 삭제 — authorId=null 이면 클럽 전체에서 이 단어 제거
  async function handleAdminDelete(authorId: string | null, who?: string) {
    if (!onAdminDelete || deleting) return;
    const msg =
      authorId === null
        ? `"${label}" 단어를 이 클럽에서 완전히 삭제할까요?\n(${authorIds.length}명의 리뷰 + 좋아요에서 제거)`
        : `${who ?? "이 유저"}의 "${label}" 리뷰를 삭제할까요?`;
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      await onAdminDelete(authorId);
      if (authorId === null || voters.length <= 1) onOpenChange(false);
      else setVoters((prev) => prev.filter((v) => v.id !== authorId));
    } catch {
      // 에러 토스트는 상위(onAdminDelete)에서 처리
    } finally {
      setDeleting(false);
    }
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
          {(onToggleLike || (onReport && !isMine)) && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {onToggleLike && (
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
              )}
              {onReport && !isMine && (
                <button
                  onClick={onReport}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-[14px] font-bold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                >
                  <Flag className="h-4 w-4" strokeWidth={2.5} />
                  신고
                </button>
              )}
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
                  <li key={v.id} className="flex items-center gap-1">
                    <button
                      onClick={() => goProfile(v.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted/70 active:bg-muted"
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
                    {isAdmin && onAdminDelete && (
                      <button
                        onClick={() => handleAdminDelete(v.id, name)}
                        disabled={deleting}
                        aria-label={`${name}의 리뷰 삭제`}
                        title="이 유저의 리뷰만 삭제 (admin)"
                        className="shrink-0 rounded-full p-2 text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isAdmin && onAdminDelete && authorIds.length > 0 && (
            <button
              onClick={() => handleAdminDelete(null)}
              disabled={deleting}
              className="mt-3 w-full rounded-2xl border border-red-500/30 bg-red-500/10 py-3 text-[14px] font-bold text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
            >
              {deleting ? "삭제 중..." : "🗑 이 단어 전체 삭제 (admin)"}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
