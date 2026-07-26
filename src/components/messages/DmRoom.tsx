"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { uploadChatMedia, type ChatMediaItem } from "@/lib/utils/uploadChatMedia";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { ArrowLeft, Send, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useComposerNavHide } from "@/hooks/useComposerNavHide";
import { useDmThread } from "@/hooks/useDmThread";
import type { DmMessage } from "@/types/dm";
import { ChatAttachMenu } from "@/components/chat/ChatAttachMenu";
import { SwipeToReply } from "@/components/chat/SwipeToReply";

interface Props {
  threadId: string;
  currentUserId?: string;
  onRequireLogin?: () => void;
}

/** 1:1 DM 방 — 수락 게이트 없이 바로 대화 (Migration 470) */
// ── 깃발 채팅(MessageRoom)과 동일한 날짜·시간 표기 ──────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isSameMinute(a: Date, b: Date) {
  return isSameDay(a, b) && a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
}
function formatTime(d: Date) {
  const h = d.getHours();
  const h12 = h % 12 || 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatDateDivider(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

export function DmRoom({ threadId, currentUserId, onRequireLogin }: Props) {
  const router = useRouter();
  const { thread, messages, loading, send } = useDmThread(threadId, currentUserId);
  // 입력 포커스 중엔 하단 네비를 숨겨 키보드와 겹치지 않게 (와글과 동일)
  const { focused: composerFocused, onFocus: onComposerFocus, onBlur: onComposerBlur } =
    useComposerNavHide();
  const [input, setInput] = useState("");
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  // 밀어서 답글 대상 (Migration 472)
  const [replyTarget, setReplyTarget] = useState<DmMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 입장/새 메시지 시 읽음 처리 (Migration 484 — 목록 N 뱃지 해제)
  // supabase-js 빌더는 lazy thenable이라 반드시 await 해야 요청이 나간다.
  useEffect(() => {
    if (loading || !currentUserId) return;
    (async () => {
      const { error } = await createClient().rpc("mark_dm_read", { p_thread_id: threadId });
      if (error) console.error("[mark_dm_read] failed", error);
    })();
  }, [threadId, currentUserId, loading, messages.length]);

  if (!currentUserId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground text-[14px]">
        로그인이 필요해요
        <button onClick={onRequireLogin} className="px-4 py-2 rounded-full bg-inverse text-inverse-foreground text-[13px] font-black">
          로그인
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="py-16 text-center text-muted-foreground text-[13px]">불러오는 중...</div>;
  }
  if (!thread) {
    return <div className="py-16 text-center text-muted-foreground text-[13px]">대화를 찾을 수 없어요</div>;
  }

  const name = thread.counterpart?.display_name ?? "상대";

  // 사진/카메라 첨부 — 조각 단체방(PartyChatRoom)과 동일 구현
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const slots = Math.max(0, 4 - media.length);
    const uploaded = (
      await Promise.all(files.slice(0, slots).map((f) => uploadChatMedia(f, currentUserId)))
    ).filter(Boolean) as ChatMediaItem[];
    if (uploaded.length) setMedia((prev) => [...prev, ...uploaded].slice(0, 4));
  }

  // 내 위치 — 첨부로 담지 않고 바로 전송 (사진과 섞을 이유가 없음)
  async function handleLocation(item: ChatMediaItem) {
    await send("", [item]);
  }

  async function handleSend() {
    const body = input.trim();
    if (!body && media.length === 0) return;
    setInput("");
    const sentMedia = media;
    const replyId = replyTarget?.id ?? null;
    setMedia([]);
    setReplyTarget(null);
    await send(body, sentMedia, replyId);
  }

  return (
    // 하단 네비(56px)를 띄운 채로 대화 — 와글(/chat)과 동일한 높이 계산.
    // 입력 포커스 시엔 네비가 숨으므로 그만큼 대화 영역을 넓힌다.
    <div
      className={`max-w-lg mx-auto bg-background flex flex-col overflow-hidden ${
        composerFocused
          ? "h-[calc(100dvh-env(safe-area-inset-bottom))]"
          : "h-[calc(100dvh-56px-env(safe-area-inset-bottom))]"
      }`}
    >
      {/* 헤더 */}
      <div
        className="shrink-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2 px-3 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <button onClick={() => router.back()} aria-label="뒤로" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
          {thread.counterpart?.profile_image ? (
            <Image src={thread.counterpart.profile_image} alt="" fill sizes="32px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-foreground/60 text-[12px] font-black">
              {name.charAt(0)}
            </div>
          )}
        </div>
        <span className="text-foreground text-[15px] font-black truncate">{name}</span>
      </div>

      {/* 메시지 */}
      <div className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {messages.map((m, i) => {
          const mine = m.sender_id === currentUserId;
          const d = new Date(m.created_at);
          const prev = i > 0 ? messages[i - 1] : null;
          const showDate = !prev || !isSameDay(new Date(prev.created_at), d);
          const next = i < messages.length - 1 ? messages[i + 1] : null;
          // 같은 사람·같은 분의 연속 메시지는 마지막 것만 시간 표시 (카톡식)
          const showTime =
            !next ||
            next.sender_id !== m.sender_id ||
            !isSameMinute(new Date(next.created_at), d);
          return (
            <Fragment key={m.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                    {formatDateDivider(d)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex items-end gap-1.5 max-w-[80%] ${mine ? "flex-row-reverse" : ""}`}
                >
                  <SwipeToReply isMine={mine} onReply={() => setReplyTarget(m)}>
                  <div
                    className={`px-3 py-2 rounded-2xl select-none ${
                      mine
                        ? "bg-amber-400 text-black rounded-br-md"
                        : "bg-card text-white rounded-bl-md"
                    }`}
                  >
                    {m.reply_to && (
                      <div
                        className={`mb-1 pl-2 border-l-2 text-[12px] truncate ${
                          mine
                            ? "border-black/30 text-black/60"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {messages.find((x) => x.id === m.reply_to)?.content ??
                          "삭제된 메시지"}
                      </div>
                    )}
                    {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                    {m.content && (
                      <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    )}
                  </div>
                  </SwipeToReply>
                  <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                    {showTime && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatTime(d)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력 — 수락 게이트 없이 항상 노출 (Migration 470) */}
      <div className="shrink-0 bg-background border-t border-border">
          {replyTarget && (
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="flex-1 min-w-0 pl-2 border-l-2 border-amber-400">
                <p className="text-[11px] font-bold text-brand-amber">답글</p>
                <p className="text-[12px] text-muted-foreground truncate">
                  {replyTarget.content || "사진"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0"
                aria-label="답글 취소"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {media.length > 0 && (
            <div className="flex gap-2 px-3 pt-3 overflow-x-auto">
              {media.map((m, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden bg-card">
                  {m.type === "image" ? (
                    <Image src={m.url} alt="" fill className="object-cover" sizes="56px" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  )}
                  <button
                    onClick={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 grid place-items-center"
                  >
                    <X className="w-2.5 h-2.5 text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 px-3 py-3">
          <ChatAttachMenu onFiles={handleFiles} onLocation={handleLocation} />
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
            onFocus={onComposerFocus}
            onBlur={onComposerBlur}
            rows={1}
            placeholder="메시지 보내기"
            className="flex-1 min-w-0 resize-none bg-card text-foreground text-[14px] rounded-2xl border border-border px-4 py-2.5 outline-none placeholder:text-muted-foreground max-h-28"
          />
          <button
            onClick={handleSend}
            disabled={input.trim().length === 0 && media.length === 0}
            className="p-2.5 rounded-full bg-inverse text-inverse-foreground shrink-0 disabled:opacity-30"
            aria-label="전송"
          >
            <Send className="w-4 h-4" />
          </button>
          </div>
      </div>
    </div>
  );
}
