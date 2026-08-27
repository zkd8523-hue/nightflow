"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  Send,
  Trash2,
  ImagePlus,
  X,
  Heart,
  MessageCircle,
  Pencil,
  Siren,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEventComments } from "@/hooks/useEventComments";
import type { EventComment } from "@/types/database";
import {
  uploadChatMedia,
  CHAT_MEDIA_MAX_COUNT,
  type ChatMediaItem,
} from "@/lib/utils/uploadChatMedia";

const MAX_LEN = 300;

function timeShort(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

/**
 * 공연 댓글 — Migration 598, 602.
 *
 * 602에서 "같이 갈 사람" 채팅방을 걷어냈다. 공연 하나에 방이 여러 개 생기면
 * 어느 방에도 사람이 안 모여서, 대화를 댓글 한 줄기로 모으는 쪽을 택했다.
 * 대신 댓글에 답글(1-depth)과 좋아요가 붙는다.
 *
 * 지난 공연은 읽기 전용 — RLS에서도 막지만(INSERT 정책), 눌러보고 실패하는 것보다
 * 입력창을 아예 안 그리는 게 낫다.
 */
export function EventCommentSection({
  eventId,
  isPast,
}: {
  eventId: string;
  isPast: boolean;
}) {
  const { user } = useCurrentUser();
  const {
    tree,
    totalCount,
    likedIds,
    reload,
    removeLocal,
    toggleLike,
    editComment,
    reportComment,
  } = useEventComments(eventId);
  const isAdmin = user?.role === "admin";
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  /** 답글을 달 대상 — null이면 최상위 댓글 */
  const [replyTo, setReplyTo] = useState<EventComment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = input.trim();
    // 사진만 올리는 댓글도 허용한다 (DB의 event_comments_not_empty와 같은 기준)
    if (sending || uploading) return;
    if (!trimmed && media.length === 0) return;
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    setSending(true);
    const supabase = createClient();

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      author_id: user.id,
      content: trimmed,
      media,
      parent_id: replyTo?.id ?? null,
    });

    setSending(false);

    if (error) {
      // 도배 방지 트리거는 RAISE EXCEPTION 메시지를 그대로 돌려준다
      if (error.code === "42P01" || error.code === "42703") {
        toast.error("마이그레이션 미적용 (602)");
      } else {
        toast.error(error.message || "댓글을 남기지 못했습니다");
      }
      return;
    }

    // INSERT Realtime이 늦거나 끊겨도 내 글은 바로 보여야 한다
    reload();

    setInput("");
    setMedia([]);
    setReplyTo(null);
  }

  function startReply(c: EventComment) {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    setReplyTo(c);
    // 답글 대상을 고르면 바로 쓸 수 있어야 한다
    inputRef.current?.focus();
  }

  async function handleToggleLike(c: EventComment) {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const ok = await toggleLike(c.id, user.id);
    if (!ok) toast.error("잠시 후 다시 시도해주세요");
  }

  async function handlePickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    setUploading(true);
    const room = CHAT_MEDIA_MAX_COUNT - media.length;
    if (room <= 0) {
      toast.error(`최대 ${CHAT_MEDIA_MAX_COUNT}장까지 올릴 수 있어요`);
      setUploading(false);
      return;
    }
    const picked = Array.from(files);
    if (picked.length > room) {
      toast.error(`${room}장만 추가했어요 (최대 ${CHAT_MEDIA_MAX_COUNT}장)`);
    }
    const uploaded: ChatMediaItem[] = [];
    for (const f of picked.slice(0, room)) {
      const item = await uploadChatMedia(f, user.id);
      if (item) uploaded.push(item);
      else toast.error("사진을 올리지 못했어요");
    }
    if (uploaded.length > 0) setMedia((prev) => [...prev, ...uploaded]);
    setUploading(false);
  }

  async function handleEdit(id: string, content: string) {
    const res = await editComment(id, content);
    if (!res.ok) {
      toast.error(res.error ?? "수정하지 못했어요");
      return false;
    }
    toast.success("수정되었습니다");
    return true;
  }

  async function handleReport(c: EventComment) {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    if (c.author_id === user.id) {
      toast.error("본인 댓글은 신고할 수 없어요");
      return;
    }
    // 사유를 고르는 시트까지 두면 신고 문턱이 높아진다. 한 번 확인만 받는다.
    if (!confirm("이 댓글을 신고할까요?\n관리자가 확인 후 조치합니다.")) return;
    const res = await reportComment(c.id, user.id, "other");
    if (!res.ok) {
      toast.error(res.error ?? "신고하지 못했어요");
      return;
    }
    toast.success("신고되었습니다");
  }

  async function handleDelete(id: string) {
    const mine = tree.some(
      (c) =>
        (c.id === id && c.author_id === user?.id) ||
        c.replies?.some((r) => r.id === id && r.author_id === user?.id)
    );
    const msg = mine
      ? "이 댓글을 삭제할까요?"
      : "[관리자] 다른 사람의 댓글을 삭제할까요?";
    if (!confirm(msg)) return;
    const supabase = createClient();
    const { error } = await supabase.from("event_comments").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    // Realtime DELETE를 기다리지 않고 바로 지운다 (본인 화면 즉시 반영)
    removeLocal(id);
    // 지운 댓글에 답글을 쓰던 중이었다면 입력 상태도 풀어준다
    setReplyTo((prev) => (prev?.id === id ? null : prev));
    toast.success("삭제되었습니다");
  }

  // 지난 공연에 댓글도 없으면 섹션 자체를 그리지 않는다 — 입력창도 없어서
  // "댓글" 제목만 덩그러니 남는다.
  if (isPast && totalCount === 0) return null;

  return (
    <section>
      <h2 className="text-[17px] font-black mb-2">
        댓글
        {totalCount > 0 && (
          <span className="ml-1.5 text-muted-foreground">{totalCount}</span>
        )}
      </h2>

      {/* 댓글이 없으면 카드 자체를 안 그린다 — 빈 안내문이 자리만 먹고,
          바로 아래 입력창이 이미 무엇을 하는 곳인지 말해준다. */}
      {tree.length > 0 && (
        <div className="rounded-2xl bg-card border border-border">
          <ul>
            {tree.map((c) => (
              <li key={c.id} className="border-b border-border last:border-0">
                <CommentRow
                  comment={c}
                  isMine={!!user && c.author_id === user.id}
                  isAdmin={isAdmin}
                  isLoggedIn={!!user}
                  liked={likedIds.has(c.id)}
                  canReply={!isPast}
                  onDelete={() => handleDelete(c.id)}
                  onLike={() => handleToggleLike(c)}
                  onReply={() => startReply(c)}
                  onEdit={(text) => handleEdit(c.id, text)}
                  onReport={() => handleReport(c)}
                />

                {/* 답글은 한 단 들여서 부모에 매달린 것으로 보이게 한다 */}
                {c.replies && c.replies.length > 0 && (
                  <ul className="pl-9 border-t border-border/50">
                    {c.replies.map((r) => (
                      <CommentRow
                        key={r.id}
                        comment={r}
                        isMine={!!user && r.author_id === user.id}
                        isAdmin={isAdmin}
                        isLoggedIn={!!user}
                        liked={likedIds.has(r.id)}
                        canReply={false}
                        isReply
                        onDelete={() => handleDelete(r.id)}
                        onLike={() => handleToggleLike(r)}
                        onEdit={(text) => handleEdit(r.id, text)}
                        onReport={() => handleReport(r)}
                      />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 지난 공연은 읽기 전용 — 입력창을 아예 안 그린다 */}
      {!isPast && (
        <div className="mt-2 rounded-2xl bg-card border border-border p-3 space-y-2.5">
          {/* 답글 대상 표시 — 지금 어디에 쓰는지 모르면 엉뚱한 곳에 달린다 */}
          {replyTo && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
              <MessageCircle
                className="w-3.5 h-3.5 text-brand-amber shrink-0"
                aria-hidden="true"
              />
              <span className="text-[12px] text-muted-foreground min-w-0 flex-1 truncate">
                <span className="font-bold text-foreground">
                  {replyTo.author?.display_name ?? "알 수 없음"}
                </span>
                님에게 답글
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="답글 취소"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* 고른 사진 미리보기 — 올리기 전에 뺄 수 있어야 한다 */}
          {media.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {media.map((m, i) => (
                <span key={m.url} className="relative shrink-0">
                  {/* 업로드된 임의 도메인이라 next/image 대신 img를 쓴다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setMedia((prev) => prev.filter((_, k) => k !== i))}
                    aria-label="사진 빼기"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/85 ring-1 ring-white/25 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={
                replyTo ? "답글을 남겨보세요" : "이 공연에 대한 느낌을 알려주세요"
              }
              className="flex-1 resize-none bg-muted/40 rounded-xl px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-amber max-h-28"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && media.length === 0) || sending || uploading}
              aria-label={replyTo ? "답글 등록" : "댓글 등록"}
              className="shrink-0 w-10 h-10 rounded-xl bg-brand-amber text-black flex items-center justify-center disabled:opacity-40 transition-opacity"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handlePickFiles(e.target.files);
                // 같은 파일을 연속으로 고를 수 있게 초기화
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              {uploading ? "올리는 중..." : "사진"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  isMine,
  isAdmin,
  isLoggedIn,
  liked,
  canReply,
  isReply = false,
  onDelete,
  onLike,
  onReply,
  onEdit,
  onReport,
}: {
  comment: EventComment;
  isMine: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  liked: boolean;
  canReply: boolean;
  isReply?: boolean;
  onDelete: () => void;
  onLike: () => void;
  onReply?: () => void;
  onEdit: (content: string) => Promise<boolean>;
  onReport: () => void;
}) {
  const name = comment.author?.display_name ?? "알 수 없음";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  async function submitEdit() {
    if (saving) return;
    const trimmed = draft.trim();
    // 사진만 있는 댓글은 본문을 비울 수 있다(DB의 not_empty 제약과 같은 기준)
    if (!trimmed && comment.media.length === 0) return;
    if (trimmed === comment.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onEdit(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  }

  /**
   * 더블클릭(모바일에서는 더블탭) 좋아요 — 인스타 방식.
   * 이미 눌러둔 상태에서 또 더블클릭해도 취소되지 않게 한다. 두 번 두드리는 건
   * "좋아요"라는 뜻이지 "취소"가 아니라, 취소는 하트 버튼으로만 받는다.
   */
  function handleDoubleClick() {
    if (!isLoggedIn || liked) return;
    onLike();
  }

  return (
    <div
      className={`px-4 ${isReply ? "py-2.5" : "py-3"} select-none`}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-start gap-2.5">
        {comment.author?.profile_image ? (
          <Image
            src={comment.author.profile_image}
            alt=""
            width={isReply ? 22 : 28}
            height={isReply ? 22 : 28}
            className={`${isReply ? "w-[22px] h-[22px]" : "w-7 h-7"} rounded-full object-cover shrink-0`}
          />
        ) : (
          <span
            className={`${isReply ? "w-[22px] h-[22px]" : "w-7 h-7"} rounded-full bg-muted shrink-0`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`${isReply ? "text-[12.5px]" : "text-[13px]"} font-bold truncate`}>
              {name}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {timeShort(comment.created_at)}
            </span>
            {comment.edited_at && (
              <span className="text-[10.5px] text-muted-foreground shrink-0">수정됨</span>
            )}
          </div>

          {editing ? (
            <div className="mt-1 space-y-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") {
                    setDraft(comment.content);
                    setEditing(false);
                  }
                }}
                rows={2}
                autoFocus
                className="w-full resize-none bg-muted/40 rounded-xl px-3 py-2 text-[13.5px] outline-none focus:ring-1 focus:ring-brand-amber"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={saving || (!draft.trim() && comment.media.length === 0)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-amber text-black px-2.5 py-1 text-[12px] font-black disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {saving ? "저장 중..." : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(comment.content);
                    setEditing(false);
                  }}
                  className="text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            comment.content && (
              <p
                className={`${isReply ? "text-[13px]" : "text-[14px]"} mt-0.5 whitespace-pre-wrap break-words`}
              >
                {comment.content}
              </p>
            )
          )}

          {/* 올린 사진 — "jpg로 말하기". 본문 없이 사진만 있는 댓글도 있다. */}
          {comment.media.length > 0 && (
            <div
              className={`mt-1.5 grid gap-1.5 ${
                comment.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {comment.media.map((m) => (
                <a
                  key={m.url}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {/* 업로드된 임의 도메인이라 next/image 대신 img를 쓴다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className={`w-full rounded-xl object-cover ${
                      comment.media.length === 1 ? "max-h-64" : "h-32"
                    }`}
                  />
                </a>
              ))}
            </div>
          )}

          {/* 좋아요·답글·수정 — 숫자는 0일 때 감춘다(빈 0이 늘어서면 지저분하다) */}
          {!editing && (
            <div className="mt-1.5 flex items-center gap-3.5">
              <button
                type="button"
                onClick={onLike}
                aria-label={liked ? "좋아요 취소" : "좋아요"}
                aria-pressed={liked}
                className={`inline-flex items-center gap-1 text-[12px] font-bold transition-colors ${
                  liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart
                  className="w-3.5 h-3.5"
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                {comment.like_count > 0 && comment.like_count}
              </button>

              {canReply && onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  답글
                  {comment.reply_count > 0 && ` ${comment.reply_count}`}
                </button>
              )}

              {/* 신고는 남의 댓글에만 — 본인 글 신고는 DB에서도 막힌다 */}
              {!isMine && isLoggedIn && (
                <button
                  type="button"
                  onClick={onReport}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Siren className="w-3.5 h-3.5" aria-hidden="true" />
                  신고
                </button>
              )}
            </div>
          )}
        </div>

        {/* 내 글 관리 — 삭제 위, 수정 아래로 세로로 쌓는다.
            둘 다 "이 댓글을 어떻게 할지"라 본문 옆 한 자리에 모으는 편이 찾기 쉽다. */}
        {(isMine || isAdmin) && (
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={onDelete}
              aria-label={isMine ? "댓글 삭제" : "관리자 삭제"}
              title={isMine ? "삭제" : "관리자 삭제"}
              className={`transition-colors p-1 ${
                isMine
                  ? "text-muted-foreground hover:text-red-500"
                  : "text-red-500/70 hover:text-red-500"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {/* 수정은 본인 것만 — 관리자도 남의 글 내용은 못 고친다(RPC가 막는다) */}
            {isMine && !editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.content);
                  setEditing(true);
                }}
                aria-label="댓글 수정"
                title="수정"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
