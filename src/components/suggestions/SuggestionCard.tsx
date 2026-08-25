"use client";

import Link from "next/link";
import { Heart, Lock, MessageCircle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Suggestion } from "@/types/database";

interface Props {
  suggestion: Suggestion;
  currentUserId?: string;
  onLike: (id: string) => void;
  onRequireLogin: () => void;
}

export function SuggestionCard({
  suggestion: s,
  currentUserId,
  onLike,
  onRequireLogin,
}: Props) {
  const isMine = !!currentUserId && s.author_id === currentUserId;
  // 목록에서는 작성자 본인이 보든 남이 보든 항상 마스킹한다 — "존재는 보이되 내용은
  // 상세 페이지에서만" 원칙. 서버는 작성자/admin에게 원문을 내려주지만(뷰 CASE),
  // 피드 카드에서는 그걸 렌더링하지 않는다. 좋아요도 못 누르므로 하단은 답변 여부만.
  const isMasked = s.is_private;

  function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUserId) {
      onRequireLogin();
      return;
    }
    if (isMine) return; // 본인 글 공감 불가 (RLS에서도 차단)
    onLike(s.id);
  }

  return (
    <div className="relative bg-card border border-border rounded-2xl p-4">
      {/* 카드 전체 링크 — 좋아요/닉네임 버튼만 위로 띄운다 */}
      <Link
        href={`/suggestions/${s.id}`}
        className="absolute inset-0 rounded-2xl"
        aria-label={isMasked ? "비밀글이에요" : s.title}
      />

      {isMasked ? (
        <>
          <h2 className="flex items-center gap-1.5 text-[15px] font-black text-foreground leading-snug">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            비밀글이에요
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            작성자와 관리자만 볼 수 있어요
          </p>
        </>
      ) : (
        <>
          {/* is_private=false 인 공개글만 이 분기를 탄다 (isMasked = s.is_private) */}
          <h2 className="text-[15px] font-black text-foreground leading-snug line-clamp-2">
            {s.title}
          </h2>

          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-wrap break-words">
            {s.content}
          </p>
        </>
      )}

      <div className="mt-3 flex items-center gap-1 min-w-0">
        {!isMasked && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleLike}
              disabled={isMine}
              className={`relative z-10 flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-bold transition-colors ${
                s.liked_by_me
                  ? "text-red-400"
                  : "text-muted-foreground hover:text-foreground/80"
              } ${isMine ? "cursor-default" : ""}`}
              aria-label="공감"
            >
              <Heart className={`w-4 h-4 ${s.liked_by_me ? "fill-current" : ""}`} />
              {s.like_count}
            </button>

            <span className="flex items-center gap-1 px-2 py-1 text-[12px] font-bold text-muted-foreground">
              <MessageCircle className="w-4 h-4" />
              {s.comment_count}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 min-w-0">
          {/* 비공개글은 작성자도 익명 처리 — 닉네임 노출 없이 시간만 */}
          {!isMasked && (
            <Link
              href={`/u/${s.author_id}`}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 text-[11px] font-bold text-muted-foreground hover:text-foreground truncate transition-colors"
            >
              {s.author?.display_name ?? "익명"}
            </Link>
          )}
          <span className="text-[11px] text-muted-foreground shrink-0">
            {!isMasked && "· "}
            {formatRelativeTime(s.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
