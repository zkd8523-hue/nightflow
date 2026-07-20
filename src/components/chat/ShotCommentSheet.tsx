"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useChatShotComments } from "@/hooks/useChatShotComments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shotId: string | null;
  currentUserId?: string;
  onRequireLogin?: () => void;
}

const MAX_LEN = 300;

function timeShort(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

export function ShotCommentSheet({
  open,
  onOpenChange,
  shotId,
  currentUserId,
  onRequireLogin,
}: Props) {
  const { comments, loading } = useChatShotComments(open ? shotId : null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (comments.length > prevLenRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLenRef.current = comments.length;
  }, [comments.length]);

  useEffect(() => {
    if (open) {
      setInput("");
      prevLenRef.current = 0;
    }
  }, [open, shotId]);

  async function handleSend() {
    if (!shotId) return;
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("chat_shot_comments").insert({
      shot_id: shotId,
      author_id: currentUserId,
      content: trimmed,
    });
    if (error) {
      console.error("[ShotCommentSheet] insert error", error);
      if (error.code === "42P01" || error.code === "42703") {
        toast.error("댓글 마이그레이션 미적용 (325)");
      } else {
        toast.error(`댓글 작성 실패: ${error.message ?? ""}`);
      }
      setSending(false);
      return;
    }
    setInput("");
    setSending(false);
  }

  async function handleDelete(commentId: string) {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_shot_comments")
      .delete()
      .eq("id", commentId);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl p-0 max-h-[80vh] flex flex-col z-[110]"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[15px] text-left">
            댓글 {comments.length > 0 && `(${comments.length})`}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-neutral-500">
              불러오는 중...
            </div>
          ) : comments.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-neutral-400">아직 댓글이 없어요</p>
              <p className="text-[11px] text-neutral-600 mt-1">
                첫 댓글을 남겨보세요
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900">
              {comments.map((c) => {
                const isMine = c.author_id === currentUserId;
                return (
                  <li key={c.id} className="px-4 py-3 flex items-start gap-2">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      {c.author?.profile_image ? (
                        <Image
                          src={c.author.profile_image}
                          alt=""
                          fill
                          sizes="32px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/50 text-[11px] font-black">
                          {(c.author?.display_name ?? "익").charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-neutral-300 truncate">
                          {c.author?.display_name ?? "익명"}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          {timeShort(c.created_at)}
                        </span>
                      </div>
                      <p className="text-[14px] text-white mt-0.5 whitespace-pre-wrap break-words">
                        {c.content}
                      </p>
                    </div>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="shrink-0 p-1 text-neutral-500 hover:text-red-400"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
              <div ref={endRef} />
            </ul>
          )}
        </div>

        <div className="border-t border-neutral-800 bg-[#0A0A0A] px-3 py-2.5 shrink-0">
          {!currentUserId ? (
            <button
              onClick={onRequireLogin}
              className="w-full py-3 rounded-full text-[14px] font-black bg-white text-black"
            >
              로그인하고 댓글 달기
            </button>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="댓글 입력"
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
