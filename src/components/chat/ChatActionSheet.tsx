"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Copy,
  Type,
  MessageCircle,
  Share2,
  Trash2,
  Flag,
} from "lucide-react";
import {
  CHAT_REACTION_EMOJIS,
  type ChatMessage,
  type ChatReactionEmoji,
  type ChatReactionSummary,
} from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessage;
  /** 본인 메시지 여부 */
  isMine: boolean;
  /** admin은 남의 글도 삭제 가능 (RLS는 Migration 284에서 이미 허용) */
  canDelete?: boolean;
  /** 로그인 여부 */
  isLoggedIn: boolean;
  /** 내가 누른 이모지 집계 */
  reactionSummary?: ChatReactionSummary;
  onReact?: (emoji: ChatReactionEmoji) => void;
  onCopy?: () => void;
  onSelectCopy?: () => void;
  onOpenReplies?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onRequireLogin?: () => void;
}

/**
 * 카톡식 길게 누름 액션 시트
 * 상단: 이모지 반응 (6개)
 * 하단: 복사 / 선택복사 / 답글 / 공유 / 삭제 or 신고
 */
export function ChatActionSheet({
  open,
  onOpenChange,
  message,
  isMine,
  canDelete,
  isLoggedIn,
  reactionSummary,
  onReact,
  onCopy,
  onSelectCopy,
  onOpenReplies,
  onShare,
  onDelete,
  onReport,
  onRequireLogin,
}: Props) {
  function requireAuth(fn?: () => void) {
    if (!isLoggedIn) {
      onRequireLogin?.();
      onOpenChange(false);
      return;
    }
    fn?.();
    onOpenChange(false);
  }

  const hasContent = (message.content ?? "").length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl p-0 pb-4 max-h-[60vh]"
      >
        {/* 이모지 반응 가로 행 */}
        <div className="px-4 pt-5 pb-3 border-b border-neutral-800">
          <div className="flex items-center justify-around">
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const mine = reactionSummary?.mine.has(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    if (!isLoggedIn) {
                      onRequireLogin?.();
                      onOpenChange(false);
                      return;
                    }
                    onReact?.(emoji);
                    onOpenChange(false);
                  }}
                  className={`w-11 h-11 flex items-center justify-center rounded-full text-[22px] transition-all active:scale-90 ${
                    mine ? "bg-amber-500/20 ring-1 ring-amber-400" : ""
                  }`}
                  aria-label={`${emoji} 반응`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>

        {/* 액션 메뉴 */}
        <div className="py-1">
          {hasContent && (
            <ActionRow
              icon={<Copy className="w-5 h-5" />}
              label="복사"
              onClick={() => {
                onCopy?.();
                onOpenChange(false);
              }}
            />
          )}
          {hasContent && (
            <ActionRow
              icon={<Type className="w-5 h-5" />}
              label="선택 복사"
              onClick={() => {
                onSelectCopy?.();
                onOpenChange(false);
              }}
            />
          )}
          <ActionRow
            icon={<MessageCircle className="w-5 h-5" />}
            label="답글"
            onClick={() => requireAuth(onOpenReplies)}
          />
          <ActionRow
            icon={<Share2 className="w-5 h-5" />}
            label="공유"
            onClick={() => requireAuth(onShare)}
          />
          {!isMine && (
            <ActionRow
              icon={<Flag className="w-5 h-5" />}
              label="신고"
              tone="warning"
              onClick={() => requireAuth(onReport)}
            />
          )}
          {(isMine || canDelete) && (
            <ActionRow
              icon={<Trash2 className="w-5 h-5" />}
              label="삭제"
              tone="danger"
              onClick={() => {
                onDelete?.();
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger" | "warning";
}) {
  const colorClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
        ? "text-amber-400"
        : "text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-neutral-800/60 active:bg-neutral-800 transition-colors ${colorClass}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}
