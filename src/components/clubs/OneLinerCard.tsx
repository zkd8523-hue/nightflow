"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, MoreVertical, Pencil, Trash2, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OneLinerReportSheet } from "./OneLinerReportSheet";
import { ONE_LINER_TAG_MAP } from "@/lib/clubs/oneLinerTags";
import type { ClubOneLiner } from "@/types/database";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

interface Props {
  oneLiner: ClubOneLiner;
  currentUserId?: string;
  isLoggedIn: boolean;
  isAdmin?: boolean;
  onEdit?: (ol: ClubOneLiner) => void;
  onChange?: () => void;
  onRequireLogin?: () => void;
}

export function OneLinerCard({
  oneLiner,
  currentUserId,
  isLoggedIn,
  isAdmin = false,
  onEdit,
  onChange,
  onRequireLogin,
}: Props) {
  const isMine = currentUserId && oneLiner.author_id === currentUserId;
  const [liked, setLiked] = useState(oneLiner.liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState(oneLiner.like_count);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  async function handleToggleLike() {
    if (!isLoggedIn) {
      onRequireLogin?.();
      return;
    }
    if (isMine) {
      toast.error("본인 글에는 좋아요를 누를 수 없습니다");
      return;
    }
    if (busy) return;
    setBusy(true);

    const supabase = createClient();
    const next = !liked;

    // 옵티미스틱
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : Math.max(c - 1, 0)));

    try {
      if (next) {
        const { error } = await supabase
          .from("one_liner_likes")
          .insert({ one_liner_id: oneLiner.id, user_id: currentUserId! });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("one_liner_likes")
          .delete()
          .eq("one_liner_id", oneLiner.id)
          .eq("user_id", currentUserId!);
        if (error) throw error;
      }
    } catch (e) {
      // 롤백
      setLiked(!next);
      setLikeCount((c) => (next ? Math.max(c - 1, 0) : c + 1));
      console.error(e);
      toast.error("좋아요 처리에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(asAdmin = false) {
    const message = asAdmin
      ? "관리자 권한으로 이 한 줄 리뷰를 삭제할까요?"
      : "이 한 줄 리뷰를 삭제할까요?";
    if (!confirm(message)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("club_one_liners")
      .delete()
      .eq("id", oneLiner.id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
    onChange?.();
  }

  const author = oneLiner.author;
  const displayName = author?.display_name ?? "익명";
  const authorId = oneLiner.author_id;
  const profileHref = authorId ? `/u/${authorId}` : null;

  return (
    <div className="py-4 border-b border-neutral-900 last:border-b-0">
      <div className="flex items-start gap-3">
        {profileHref ? (
          <Link
            href={profileHref}
            aria-label={`${displayName} 프로필 보기`}
            className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 active:opacity-70 transition-opacity"
          >
            {author?.profile_image ? (
              <Image
                src={author.profile_image}
                alt={displayName}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-[12px] font-black">
                {displayName.charAt(0)}
              </div>
            )}
          </Link>
        ) : (
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
            {author?.profile_image ? (
              <Image
                src={author.profile_image}
                alt={displayName}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-[12px] font-black">
                {displayName.charAt(0)}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {profileHref ? (
                <Link
                  href={profileHref}
                  className="text-[13px] font-bold text-white truncate hover:underline active:opacity-70"
                >
                  {displayName}
                  {isMine && (
                    <span className="ml-1 text-[11px] text-amber-400 font-bold">
                      나
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-[13px] font-bold text-white truncate">
                  {displayName}
                  {isMine && (
                    <span className="ml-1 text-[11px] text-amber-400 font-bold">
                      나
                    </span>
                  )}
                </span>
              )}
              <span className="text-[11px] text-neutral-500">·</span>
              <span className="text-[11px] text-neutral-500 shrink-0">
                {timeAgo(oneLiner.created_at)}
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="더보기"
                  className="p-1 -m-1 text-neutral-500 hover:text-white"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1C1C1E] border-neutral-800 text-white"
              >
                {isMine ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => onEdit?.(oneLiner)}
                      className="cursor-pointer focus:bg-neutral-800 focus:text-white"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      수정
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(false)}
                      className="cursor-pointer text-red-400 focus:bg-neutral-800 focus:text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      삭제
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        if (!isLoggedIn) {
                          onRequireLogin?.();
                          return;
                        }
                        setReportOpen(true);
                      }}
                      className="cursor-pointer text-amber-400 focus:bg-neutral-800 focus:text-amber-400"
                    >
                      <Flag className="w-4 h-4 mr-2" />
                      신고
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem
                        onClick={() => handleDelete(true)}
                        className="cursor-pointer text-red-400 focus:bg-neutral-800 focus:text-red-400"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        삭제 (관리자)
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="mt-1 text-[15px] text-white leading-relaxed whitespace-pre-wrap break-words">
            {oneLiner.content}
          </p>

          {oneLiner.tags && oneLiner.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {oneLiner.tags.map((code) => {
                const tag = ONE_LINER_TAG_MAP[code];
                if (!tag) return null;
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-900 text-neutral-300"
                  >
                    <span>{tag.emoji}</span>
                    <span>{tag.label}</span>
                  </span>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center">
            <button
              onClick={handleToggleLike}
              disabled={isMine}
              className={`flex items-center gap-1.5 text-[12px] transition-colors ${
                liked
                  ? "text-red-500"
                  : isMine
                    ? "text-neutral-700 cursor-not-allowed"
                    : "text-neutral-500 hover:text-red-400"
              }`}
              aria-label={liked ? "좋아요 취소" : "좋아요"}
            >
              <Heart
                className={`w-4 h-4 ${liked ? "fill-current" : ""}`}
              />
              <span className="font-bold">{likeCount}</span>
            </button>
          </div>
        </div>
      </div>

      {!isMine && (
        <OneLinerReportSheet
          oneLinerId={oneLiner.id}
          clubId={oneLiner.club_id}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}
    </div>
  );
}
