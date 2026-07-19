"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { useDmThread } from "@/hooks/useDmThread";

interface Props {
  threadId: string;
  currentUserId?: string;
  onRequireLogin?: () => void;
}

/** 1:1 DM 방 — 요청/수락 상태 배너 + 대화 (accepted 일 때만 입력) */
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
  const { thread, messages, loading, send, respond } = useDmThread(threadId, currentUserId);
  const [input, setInput] = useState("");
  const [responding, setResponding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!currentUserId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-neutral-400 text-[14px]">
        로그인이 필요해요
        <button onClick={onRequireLogin} className="px-4 py-2 rounded-full bg-white text-black text-[13px] font-black">
          로그인
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="py-16 text-center text-neutral-500 text-[13px]">불러오는 중...</div>;
  }
  if (!thread) {
    return <div className="py-16 text-center text-neutral-500 text-[13px]">대화를 찾을 수 없어요</div>;
  }

  const isRecipient = thread.recipient_id === currentUserId;
  const isPending = thread.status === "pending";
  const isDeclined = thread.status === "declined";
  const isAccepted = thread.status === "accepted";
  const name = thread.counterpart?.display_name ?? "상대";

  async function handleRespond(accept: boolean) {
    setResponding(true);
    const ok = await respond(accept);
    setResponding(false);
    if (ok) toast.success(accept ? "수락했어요" : "신청을 거절했어요");
  }

  async function handleSend() {
    const body = input.trim();
    if (!body) return;
    setInput("");
    await send(body);
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[#0B0A11]">
      {/* 헤더 */}
      <div
        className="sticky top-0 z-20 bg-[#0B0A11]/95 backdrop-blur-sm border-b border-neutral-800 flex items-center gap-2 px-3 py-2.5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <button onClick={() => router.back()} aria-label="뒤로" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-900">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
          {thread.counterpart?.profile_image ? (
            <Image src={thread.counterpart.profile_image} alt="" fill sizes="32px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/60 text-[12px] font-black">
              {name.charAt(0)}
            </div>
          )}
        </div>
        <span className="text-white text-[15px] font-black truncate">{name}</span>
      </div>

      {/* 메시지 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
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
                  <span className="text-[11px] text-neutral-400 bg-neutral-800/70 rounded-full px-3 py-1">
                    {formatDateDivider(d)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex items-end gap-1.5 max-w-[80%] ${mine ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`px-3 py-2 rounded-2xl select-none ${
                      mine
                        ? "bg-white text-black rounded-br-md"
                        : "bg-[#1C1C1E] text-white rounded-bl-md"
                    }`}
                  >
                    <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                    {showTime && (
                      <span className="text-[10px] text-neutral-500 whitespace-nowrap">
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

      {/* 상태별 하단 */}
      {isDeclined ? (
        <div className="px-4 py-4 text-center text-[13px] text-neutral-500 border-t border-neutral-800">
          거절된 대화예요
        </div>
      ) : isPending && isRecipient ? (
        // 받은 신청 → 수락/거절
        <div className="px-4 py-3 border-t border-neutral-800 flex flex-col gap-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+10px)" }}>
          <p className="text-[12px] text-neutral-400 text-center">{name}님이 메시지를 신청했어요</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(false)}
              disabled={responding}
              className="flex-1 py-3 rounded-full border border-neutral-700 text-neutral-300 text-[14px] font-bold"
            >
              거절
            </button>
            <button
              onClick={() => handleRespond(true)}
              disabled={responding}
              className="flex-1 py-3 rounded-full bg-amber-500 text-black text-[14px] font-black"
            >
              수락하고 대화
            </button>
          </div>
        </div>
      ) : isPending && !isRecipient ? (
        // 보낸 신청 → 대기중
        <div className="px-4 py-4 text-center text-[13px] text-neutral-500 border-t border-neutral-800" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+14px)" }}>
          수락 대기중 — 상대가 수락하면 대화가 시작돼요
        </div>
      ) : isAccepted ? (
        // 대화 입력
        <div
          className="border-t border-neutral-800 flex items-center gap-2 px-3 py-2.5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+10px)" }}
        >
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
            rows={1}
            placeholder="메시지 보내기"
            className="flex-1 min-w-0 resize-none bg-[#1C1C1E] text-white text-[14px] rounded-2xl px-4 py-2.5 outline-none placeholder:text-neutral-600 max-h-28"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 rounded-full bg-white text-black shrink-0 disabled:opacity-30"
            aria-label="전송"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
