"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useChatReplies } from "@/hooks/useChatReplies";
import { useChatReactions } from "@/hooks/useChatReactions";
import { ChatMessageItem } from "./ChatMessageItem";
import type { ChatMessage } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 부모 메시지 — 시트 상단에 미리보기 */
  parent: ChatMessage | null;
  /** 답글 후 상위 ChatRoom의 카운트 리프레시 트리거 */
  onChange?: () => void;
}

const MAX_LEN = 500;

export function ChatReplySheet({
  open,
  onOpenChange,
  parent,
  onChange,
}: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { replies, loading, reload } = useChatReplies(open ? parent?.id ?? null : null);

  // 부모 + 답글 reaction 한꺼번에
  const reactionIds = open && parent
    ? [parent.id, ...replies.map((r) => r.id)]
    : [];
  const { summaries, toggle } = useChatReactions(reactionIds, user?.id);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (replies.length > prevLenRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLenRef.current = replies.length;
  }, [replies.length]);

  // 시트 열릴 때마다 리셋
  useEffect(() => {
    if (open) {
      setInput("");
      prevLenRef.current = 0;
    }
  }, [open, parent?.id]);

  async function handleSend() {
    if (sending || !parent) return;
    const trimmed = input.trim();
    if (trimmed.length < 1) return;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return;
    }
    if (!user) {
      router.push(`/login?redirect=/chat`);
      return;
    }

    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("chat_messages").insert({
      room: parent.room,
      author_id: user.id,
      content: trimmed,
      parent_id: parent.id,
    });
    if (error) {
      console.error("[ChatReplySheet] send error", error);
      if (error.message?.includes("RATE_LIMIT_INTERVAL")) {
        toast.error("5초 후에 다시 시도해주세요");
      } else if (error.message?.includes("RATE_LIMIT_DUPLICATE")) {
        toast.error("직전과 같은 내용은 보낼 수 없어요");
      } else if (error.message?.includes("RATE_LIMIT_PER_MINUTE")) {
        toast.error("1분에 10개까지만 보낼 수 있어요");
      } else if (
        error.code === "42501" ||
        error.message?.includes("row-level security")
      ) {
        toast.error("답글 권한이 없어요");
      } else {
        toast.error(`답글 전송 실패: ${error.message ?? "알 수 없는 오류"}`);
      }
      setSending(false);
      return;
    }
    setInput("");
    setSending(false);
    // 부모의 reply_count는 useChatMessages realtime 핸들러가 옵티미스틱 +1 처리하므로
    // ChatRoom의 reload는 호출하지 않음 — 호출 시 메시지 리스트가 "불러오는 중..."으로 깜빡임
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0B0A11] border-neutral-800 rounded-t-3xl p-0 max-h-[90vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[15px] text-left">
            답글
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-[#0B0A11]">
          {/* A: 부모 메시지 강조 박스 — 살짝 보랏빛 배경 + 두꺼운 하단 보더 */}
          {parent && (
            <div className="bg-[#1A1424]/40 border-b-4 border-[#2D1B3D]">
              <ChatMessageItem
                message={parent}
                currentUserId={user?.id}
                isLoggedIn={!!user}
                reactionSummary={summaries.get(parent.id)}
                onReact={(emoji) => toggle(parent.id, emoji)}
                onChange={onChange}
                hideReplyButton
              />
            </div>
          )}

          {/* B: 답글 N개 헤더 — 명확한 분리 */}
          {!loading && replies.length > 0 && (
            <div className="px-4 pt-3 pb-1 text-[13px] font-bold text-neutral-400">
              답글 {replies.length}개
            </div>
          )}

          {/* 답글 목록 */}
          {loading ? (
            <div className="py-10 text-center text-[13px] text-neutral-500">
              불러오는 중...
            </div>
          ) : replies.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-neutral-400">아직 답글이 없어요</p>
              <p className="text-[11px] text-neutral-600 mt-1">
                첫 답글을 남겨보세요!
              </p>
            </div>
          ) : (
            /* C: 답글 좌측 인덴트로 위계 시각화 */
            <div className="pl-6 divide-y divide-neutral-900">
              {replies.map((m) => (
                <ChatMessageItem
                  key={m.id}
                  message={m}
                  currentUserId={user?.id}
                  isLoggedIn={!!user}
                  reactionSummary={summaries.get(m.id)}
                  onReact={(emoji) => toggle(m.id, emoji)}
                  onChange={reload}
                  hideReplyButton
                />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* 입력바 */}
        <div className="border-t border-neutral-800 bg-[#0A0A0A] px-3 py-2.5 shrink-0">
          {!user ? (
            <button
              onClick={() => router.push(`/login?redirect=/chat`)}
              className="w-full py-3 rounded-full text-[14px] font-black bg-white text-black"
            >
              로그인하고 답글 달기
            </button>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // 한글 IME 조합 중 Enter는 조합 확정용 — 전송 막기
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="답글을 입력하세요"
                rows={1}
                maxLength={MAX_LEN}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 text-white text-[14px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none max-h-32"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
                aria-label="전송"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
