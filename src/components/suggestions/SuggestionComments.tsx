"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Send, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useSuggestionComments } from "@/hooks/useSuggestionComments";
import { formatRelativeTime } from "@/lib/utils/format";

interface Props {
  suggestionId: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onRequireLogin: () => void;
}

const MAX_LEN = 500;

export function SuggestionComments({
  suggestionId,
  currentUserId,
  isAdmin,
  onRequireLogin,
}: Props) {
  const { comments, loading } = useSuggestionComments(suggestionId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (!currentUserId) {
      onRequireLogin();
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("suggestion_comments").insert({
      suggestion_id: suggestionId,
      author_id: currentUserId,
      content: trimmed,
    });
    if (error) {
      console.error("[SuggestionComments] insert error", error);
      const raw = error.message ?? "";
      if (raw.startsWith("RATE_LIMIT_DUPLICATE:")) {
        toast.error(raw.replace("RATE_LIMIT_DUPLICATE:", "").trim());
      } else {
        toast.error(`댓글 작성 실패: ${raw}`);
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
      .from("suggestion_comments")
      .delete()
      .eq("id", commentId);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
  }

  return (
    <div className="mt-6">
      <h3 className="text-[13px] font-bold text-foreground/80 px-1 mb-2">
        댓글 {comments.length > 0 && `(${comments.length})`}
      </h3>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            불러오는 중...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-muted-foreground">아직 댓글이 없어요</p>
            <p className="text-[11px] text-muted-foreground mt-1">첫 댓글을 남겨보세요</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {comments.map((c) => {
              const isMine = c.author_id === currentUserId;
              const authorIsAdmin = c.author?.role === "admin";
              return (
                <li
                  key={c.id}
                  className={`px-4 py-3 flex items-start gap-2 ${
                    authorIsAdmin ? "bg-muted/30" : ""
                  }`}
                >
                  <Link
                    href={`/u/${c.author_id}`}
                    className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 hover:opacity-80 transition-opacity"
                    aria-label={`${c.author?.display_name ?? "익명"} 프로필`}
                  >
                    {c.author?.profile_image ? (
                      <Image
                        src={c.author.profile_image}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/50 text-[11px] font-black">
                        {(c.author?.display_name ?? "익").charAt(0)}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/u/${c.author_id}`}
                        className="text-[12px] font-bold text-foreground/80 truncate hover:text-foreground transition-colors"
                      >
                        {c.author?.display_name ?? "익명"}
                      </Link>
                      {authorIsAdmin && (
                        <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-brand-amber text-[10px] font-black">
                          <Shield className="w-2.5 h-2.5" />
                          관리자
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(c.created_at)}
                      </span>
                    </div>
                    <p className="text-[14px] text-foreground mt-0.5 whitespace-pre-wrap break-words">
                      {c.content}
                    </p>
                  </div>
                  {(isMine || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="shrink-0 p-1 text-muted-foreground hover:text-red-400"
                      aria-label="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 입력 */}
        <div className="border-t border-border px-3 py-2.5">
          {!currentUserId ? (
            <button
              onClick={onRequireLogin}
              className="w-full py-3 rounded-full text-[14px] font-black bg-inverse text-inverse-foreground"
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
                className="flex-1 bg-background border border-border rounded-2xl px-3 py-2 text-foreground text-[14px] placeholder:text-muted-foreground focus:outline-none focus:border-border resize-none max-h-32"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-inverse text-inverse-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors"
                aria-label="전송"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
