"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CornerDownRight, MapPin, MessageCircle, SmilePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ROOM_LABEL } from "@/lib/chat/areas";
import { ChatMediaGrid } from "./ChatMediaGrid";
import { ChatContentText } from "./ChatContentText";
import { ChatQuotedBox } from "./ChatQuotedBox";
import { ChatSharedPuzzleCard } from "./ChatSharedPuzzleCard";
import { ChatActionSheet } from "./ChatActionSheet";
import { UserPeekSheet } from "@/components/users/UserPeekSheet";
import { ChatShareSheet } from "./ChatShareSheet";
import type {
  ChatMessage,
  ChatReactionEmoji,
  ChatReactionSummary,
} from "@/types/database";
import type { ReplyPreview } from "@/hooks/useChatReplyPreviews";
import { useSwipeToReply } from "@/hooks/useSwipeToReply";

function timeShort(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

interface Props {
  message: ChatMessage;
  currentUserId?: string;
  isLoggedIn: boolean;
  reactionSummary?: ChatReactionSummary;
  /** 피드 인라인 답글 미리보기 — 부모의 최근 답글 1~2개 + 총 개수 (카톡식) */
  replyPreview?: ReplyPreview;
  onReact?: (emoji: ChatReactionEmoji) => void;
  onOpenReplies?: (message: ChatMessage) => void;
  onChange?: () => void;
  onRequireLogin?: () => void;
  hideReplyButton?: boolean;
  groupedWithPrev?: boolean;
}

const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 300;

export function ChatMessageItem({
  message,
  currentUserId,
  isLoggedIn,
  reactionSummary,
  replyPreview,
  onReact,
  onOpenReplies,
  onChange,
  onRequireLogin,
  hideReplyButton,
  groupedWithPrev,
}: Props) {
  const isMine = !!currentUserId && message.author_id === currentUserId;
  const author = message.author;
  const displayName = author?.display_name ?? "익명";
  // 프사/이름 탭 → 바로 이동하지 않고 미리보기 팝업(정보 + 메시지/프로필 선택)

  const [peekOpen, setPeekOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lastTapAtRef = useRef<number>(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressing(false);
  }

  // 밀어서 답글 — 와글/LIVE·조각 단체방 공용 훅
  const swipe = useSwipeToReply({
    isMine,
    onReply: () => {
      longPressTriggeredRef.current = true; // 뒤따르는 탭(더블탭 좋아요) 무시
      onOpenReplies?.(message);
    },
    onMoveCancel: clearLongPress,
  });
  const dragX = swipe.dragX;

  function handlePointerDown(e: React.PointerEvent) {
    swipe.handlers.onPointerDown(e);
    longPressTriggeredRef.current = false;
    setPressing(true);
    clearTimeout(longPressTimerRef.current ?? undefined);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActionOpen(true);
      setPressing(false);
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    clearLongPress();
    swipe.handlers.onPointerUp();
  }

  function handlePointerLeave() {
    if (swipe.isSwiping()) return;
    clearLongPress();
    swipe.handlers.onPointerLeave();
  }

  function handleTap() {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapAtRef.current < DOUBLE_TAP_MS) {
      if (!isLoggedIn) {
        onRequireLogin?.();
        lastTapAtRef.current = 0;
        return;
      }
      onReact?.("❤️");
      lastTapAtRef.current = 0;
    } else {
      lastTapAtRef.current = now;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      toast.success("복사했어요");
    } catch {
      toast.error("복사 실패");
    }
  }

  function handleSelectCopy() {
    const el = bodyRef.current?.querySelector<HTMLElement>(
      "[data-chat-body-text]"
    );
    if (!el) {
      toast.error("선택할 텍스트가 없어요");
      return;
    }
    el.style.userSelect = "text";
    (el.style as CSSStyleDeclaration).webkitUserSelect = "text";
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    toast.info("드래그해서 원하는 부분만 복사하세요");
  }

  async function handleDelete() {
    if (!confirm("이 메시지를 삭제할까요?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", message.id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
    onChange?.();
  }

  async function handleReport() {
    const reason = prompt(
      "신고 사유를 간단히 적어주세요 (스팸/욕설/광고 등)"
    );
    if (!reason || reason.trim().length < 2) return;
    const supabase = createClient();
    const { error } = await supabase.from("chat_message_reports").insert({
      message_id: message.id,
      reporter_id: currentUserId,
      reason: "other",
      message: reason.trim(),
    });
    if (error) {
      if (error.code === "23505") {
        toast.error("이미 신고하신 메시지입니다");
      } else {
        toast.error("신고 처리에 실패했습니다");
      }
      return;
    }
    toast.success("신고가 접수되었습니다");
  }

  const visibleReactions = reactionSummary
    ? Object.entries(reactionSummary.counts).filter(([, n]) => n > 0)
    : [];

  const hasReactionCounts = visibleReactions.length > 0;
  const hasReplyCount = !hideReplyButton && message.reply_count > 0;

  return (
    <div
      className={`group/msg relative px-4 hover:bg-[#1A1424]/60 transition-colors ${
        groupedWithPrev ? "pt-0.5 pb-1" : "pt-2 pb-2"
      } ${pressing ? "bg-[#1A1424]/80" : ""}`}
    >
      <div className={`flex items-start gap-2 ${isMine ? "justify-end" : ""}`}>
        {/* 아바타 — 내 글은 카톡처럼 표시하지 않음 */}
        {isMine ? null : groupedWithPrev ? (
          <div className="w-9 shrink-0" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => setPeekOpen(true)}
            className="relative w-9 h-9 rounded-full overflow-hidden bg-neutral-800 shrink-0 hover:opacity-80 transition-opacity"
            aria-label={`${displayName} 프로필 보기`}
          >
            {author?.profile_image ? (
              <Image
                src={author.profile_image}
                alt={displayName}
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-[13px] font-black">
                {displayName.charAt(0)}
              </div>
            )}
          </button>
        )}

        <div className={`min-w-0 ${isMine ? "flex flex-col items-end" : "flex-1"}`}>
          {!groupedWithPrev && !isMine && (
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap mb-0.5">
              <button
                type="button"
                onClick={() => setPeekOpen(true)}
                className="text-[13px] font-medium text-neutral-300 truncate hover:underline"
              >
                {displayName}
                {isMine && (
                  <span className="ml-1 text-[11px] text-amber-400 font-bold">
                    나
                  </span>
                )}
              </button>
              {message.author_area && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-300 text-[10px] font-bold leading-none">
                  <MapPin className="w-2.5 h-2.5" />
                  {ROOM_LABEL[message.author_area]}
                </span>
              )}
              <span className="text-[11px] text-neutral-500 shrink-0">
                · {timeShort(message.created_at)}
              </span>
            </div>
          )}

          {/* 본문 + 인라인 액션 — 카톡 스타일 (말풍선 옆에 작은 아이콘) */}
          <div className={`relative flex items-end gap-1 ${isMine ? "flex-row-reverse" : ""}`}>
            {/* 밀어서 답글 — 끄는 동안 반대편에 아이콘이 드러남 */}
            {dragX !== 0 && (
              <span
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                  isMine ? "right-0" : "left-0"
                }`}
                style={{ opacity: Math.min(1, Math.abs(dragX) / 56) }}
              >
                <CornerDownRight className="w-4 h-4 text-neutral-400" />
              </span>
            )}
            {/* 본문 + 미디어 — 더블탭/길게누름 영역 */}
            <div
              ref={bodyRef}
              className={`relative touch-manipulation min-w-0 flex flex-col ${
                isMine ? "items-end" : "items-start"
              }`}
              onClick={handleTap}
              onPointerDown={handlePointerDown}
              onPointerMove={swipe.handlers.onPointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={handlePointerLeave}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                WebkitUserSelect: "none",
                userSelect: "none",
                ...swipe.style,
              }}
            >
              {/* 인용된 원본 (공유) */}
              {message.quoted_message && (
                <div className="max-w-[85%]">
                  <ChatQuotedBox quoted={message.quoted_message} />
                </div>
              )}

              <ChatMediaGrid items={message.media ?? []} />
              {/* 조각 공유는 본문을 카드 안에 넣어 한 덩어리로 보인다 (말풍선 분리 X) */}
              {message.content && !message.shared_puzzle_id && (
                <div>
                  <ChatContentText
                    content={message.content}
                    clubTags={message.club_tags ?? []}
                    className={`inline-block max-w-full px-3 py-1.5 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words transition-colors ${
                      isMine
                        ? "rounded-tr-sm bg-amber-400 text-black"
                        : "rounded-tl-sm bg-white text-black"
                    } ${pressing ? (isMine ? "bg-amber-300" : "bg-neutral-200") : ""}`}
                    data-chat-body-text
                  />
                </div>
              )}
              {/* 공유된 조각 카드 (Migration 471) */}
              {message.shared_puzzle_id && (
                <ChatSharedPuzzleCard
                  puzzleId={message.shared_puzzle_id}
                  caption={message.content}
                />
              )}
            </div>

            {/* 반응(❤️ 등) — 말풍선 오른쪽 하단 인라인 (세로 공간 절약) */}
            {hasReactionCounts && (
              <div className="flex items-center gap-0.5 shrink-0 mb-0.5 flex-wrap">
                {visibleReactions.map(([emoji, count]) => {
                  const mine = reactionSummary?.mine.has(
                    emoji as ChatReactionEmoji
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        if (!isLoggedIn) {
                          onRequireLogin?.();
                          return;
                        }
                        onReact?.(emoji as ChatReactionEmoji);
                      }}
                      className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[11px] transition-colors ${
                        mine ? "text-amber-300" : "text-neutral-400 hover:text-white"
                      }`}
                      aria-label={`${emoji} ${count}개`}
                    >
                      <span>{emoji}</span>
                      <span className="font-bold">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 인라인 액션 — 데스크탑(md+)만, hover 시 노출 */}
            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 mb-0.5">
              {!hideReplyButton && (
                <button
                  type="button"
                  onClick={() => onOpenReplies?.(message)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors"
                  aria-label="답글"
                  title="답글"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!isLoggedIn) {
                    onRequireLogin?.();
                    return;
                  }
                  setActionOpen(true);
                }}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-neutral-500 hover:text-amber-400 hover:bg-neutral-900 transition-colors"
                aria-label="이모지 반응 추가"
                title="이모지 반응"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              {/* 본인 글 삭제 (웹 hover — 모바일은 길게 누르기) */}
              {isMine && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition-colors"
                  aria-label="삭제"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 답글 카운트 행 — 반응은 말풍선 옆으로 이동, 여기선 답글 버튼만 */}
          {!hideReplyButton &&
            hasReplyCount &&
            !(replyPreview && replyPreview.preview.length > 0) && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenReplies?.(message)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
                  aria-label="답글 보기"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="font-bold">답글 {message.reply_count}</span>
                </button>
              </div>
            )}

          {/* 답글 배지 (카톡식 ↳ 댓글 N) — 누르면 답글 스레드 열림 */}
          {!hideReplyButton && replyPreview && replyPreview.total > 0 && (
            <button
              type="button"
              onClick={() => onOpenReplies?.(message)}
              className="mt-1.5 inline-flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-full bg-neutral-800/90 text-neutral-300 text-[11px] font-bold hover:bg-neutral-700 transition-colors"
              aria-label="답글 보기"
            >
              <CornerDownRight className="w-3 h-3 text-neutral-500" />
              답글 {replyPreview.total}
            </button>
          )}
        </div>
      </div>

      {/* 프사/이름 탭 시 프로필 미리보기 (메시지 보내기 / 프로필 보러가기) */}
      {peekOpen && (
        <UserPeekSheet
          open={peekOpen}
          onOpenChange={setPeekOpen}
          userId={message.author_id}
          fallbackName={displayName}
          fallbackImage={author?.profile_image ?? null}
          currentUserId={currentUserId}
          onRequireLogin={onRequireLogin}
        />
      )}

      {/* 길게 누름 시 액션 시트 */}
      <ChatActionSheet
        open={actionOpen}
        onOpenChange={setActionOpen}
        message={message}
        isMine={isMine}
        isLoggedIn={isLoggedIn}
        reactionSummary={reactionSummary}
        onReact={(emoji) => onReact?.(emoji)}
        onCopy={handleCopy}
        onSelectCopy={handleSelectCopy}
        onOpenReplies={() => onOpenReplies?.(message)}
        onShare={() => setShareOpen(true)}
        onDelete={handleDelete}
        onReport={handleReport}
        onRequireLogin={onRequireLogin}
      />

      {/* 공유 시트 */}
      <ChatShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        source={message}
        currentUserId={currentUserId}
        onShared={onChange}
      />
    </div>
  );
}
