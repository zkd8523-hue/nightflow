"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Send, Headset } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { SupportMessage } from "@/types/database";

interface SupportChatProps {
  /** admin 모드: 이 유저의 상담방에 답장. 없으면 본인 상담방(유저 모드). */
  adminViewUserId?: string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${m}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function SupportChat({ adminViewUserId }: SupportChatProps) {
  const { user, isLoading } = useCurrentUser();
  const [supabase] = useState(() => createClient());
  const isAdminMode = !!adminViewUserId;
  const threadUserId = adminViewUserId ?? user?.id ?? null;

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  const markRead = useCallback(async () => {
    try {
      await supabase.rpc("mark_support_read", {
        p_user_id: isAdminMode ? threadUserId : null,
      });
    } catch {
      /* 읽음 처리 실패는 무시 */
    }
  }, [supabase, isAdminMode, threadUserId]);

  // 초기 로드
  useEffect(() => {
    if (!threadUserId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_user_id", threadUserId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        logError(error, "Load support messages");
      } else {
        setMessages((data as SupportMessage[]) ?? []);
      }
      setLoading(false);
      markRead();
      scrollToBottom();
    })();
    return () => {
      cancelled = true;
    };
  }, [threadUserId, supabase, markRead, scrollToBottom]);

  // 실시간 구독
  useEffect(() => {
    if (!threadUserId) return;
    const channel = supabase
      .channel(`support:${threadUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_user_id=eq.${threadUserId}`,
        },
        (payload) => {
          const msg = payload.new as SupportMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          markRead();
          scrollToBottom();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadUserId, supabase, markRead, scrollToBottom]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (isAdminMode) {
        const { error } = await supabase.rpc("send_support_reply", {
          p_user_id: threadUserId,
          p_body: body,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("send_support_message", {
          p_body: body,
        });
        if (error) throw error;
      }
      setInput("");
      scrollToBottom();
    } catch (error: unknown) {
      logError(error, "Send support message");
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  // 유저 모드인데 비로그인
  if (!isAdminMode && !isLoading && !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
          <Headset className="w-8 h-8 text-blue-400" />
        </div>
        <p className="text-foreground/80 font-bold">로그인 후 운영팀과 바로 대화할 수 있어요</p>
        <Link
          href="/login?redirect=/contact"
          className="h-11 px-6 flex items-center bg-inverse text-inverse-foreground font-black rounded-2xl"
        >
          로그인
        </Link>
      </div>
    );
  }

  const myRole = isAdminMode ? "admin" : "user";
  let lastDay = "";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-border border-t-white rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Headset className="w-7 h-7 text-blue-400" />
            </div>
            <p className="text-[14px] text-foreground/80 font-bold">
              {isAdminMode ? "아직 대화가 없어요" : "운영팀에게 궁금한 점을 남겨주세요"}
            </p>
            {!isAdminMode && (
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                24시간 내 답변드려요
              </p>
            )}
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === myRole;
            const showDay = dayKey(m.created_at) !== lastDay;
            lastDay = dayKey(m.created_at);
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                      {dayKey(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"} items-end gap-1.5`}>
                  {mine && (
                    <span className="text-[10px] text-muted-foreground mb-0.5">
                      {fmtTime(m.created_at)}
                    </span>
                  )}
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-inverse text-inverse-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {!mine && (
                      <p className="text-[11px] font-bold text-blue-400 mb-0.5">
                        {m.sender_role === "admin" ? "운영팀" : "고객"}
                      </p>
                    )}
                    {m.body}
                  </div>
                  {!mine && (
                    <span className="text-[10px] text-muted-foreground mb-0.5">
                      {fmtTime(m.created_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 입력창 */}
      <div className="shrink-0 border-t border-border bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={isAdminMode ? "답장 보내기..." : "문의 내용을 입력하세요..."}
            className="flex-1 resize-none bg-card text-foreground text-[14px] rounded-2xl px-4 py-2.5 max-h-28 outline-none placeholder:text-muted-foreground border border-border focus:border-border"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 w-10 h-10 rounded-full bg-inverse text-inverse-foreground flex items-center justify-center disabled:opacity-30 transition-opacity"
            aria-label="보내기"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
