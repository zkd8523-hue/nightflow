"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Send, Trash2, MessageSquarePlus, Users, Lock, ImagePlus, X } from "lucide-react";
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
const MAX_TITLE = 40;

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
 * 공연 댓글 — Migration 598.
 *
 * 2층 구조다: 기본은 자유 댓글이고, 원하면 "같이 갈 사람" 채팅방을 만들어
 * 댓글로 올린다. 방 실체는 와글 인프라(chat_messages)를 그대로 쓴다.
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
  const { comments, reload, removeLocal } = useEventComments(eventId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [withRoom, setWithRoom] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    const trimmed = input.trim();
    // 사진만 올리는 댓글도 허용한다 (DB의 event_comments_not_empty와 같은 기준).
    // 단 채팅방은 이름이 있어야 하므로 본문을 요구한다.
    if (sending || uploading) return;
    if (!trimmed && media.length === 0) return;
    if (withRoom && !roomTitle.trim()) {
      toast.error("방 이름을 적어주세요");
      return;
    }
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    setSending(true);
    const supabase = createClient();

    let roomId: string | null = null;

    // 방을 같이 만드는 경우 — 방을 먼저 만들고 그 id를 댓글에 매단다.
    // 순서가 반대면 방 생성이 실패했을 때 "방 없는 방 댓글"이 남는다.
    if (withRoom) {
      const title = roomTitle.trim().slice(0, MAX_TITLE);
      // room 키는 공연 id + 짧은 랜덤 — Migration 598의 CHECK 패턴과 맞춘다
      const suffix = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
      const { data: room, error: roomErr } = await supabase
        .from("event_chat_rooms")
        .insert({
          event_id: eventId,
          creator_id: user.id,
          room: `event:${eventId}:${suffix}`,
          title,
        })
        .select("id")
        .single();

      if (roomErr) {
        setSending(false);
        // 공연당 1인 1개 (UNIQUE) 위반
        if (roomErr.code === "23505") {
          toast.error("이 공연에는 이미 방을 만드셨어요");
        } else if (roomErr.code === "42P01") {
          toast.error("마이그레이션 미적용 (598)");
        } else {
          toast.error("방을 만들지 못했습니다");
        }
        return;
      }
      roomId = room.id;
    }

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      author_id: user.id,
      content: trimmed,
      media,
      room_id: roomId,
    });

    setSending(false);

    if (error) {
      // 도배 방지 트리거는 RAISE EXCEPTION 메시지를 그대로 돌려준다
      if (error.code === "42P01") {
        toast.error("마이그레이션 미적용 (598)");
      } else {
        toast.error(error.message || "댓글을 남기지 못했습니다");
      }
      return;
    }

    // INSERT Realtime이 늦거나 끊겨도 내 글은 바로 보여야 한다
    reload();

    setInput("");
    setRoomTitle("");
    setMedia([]);
    setWithRoom(false);
  }

  async function handlePickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const room = CHAT_MEDIA_MAX_COUNT - media.length;
    if (room <= 0) {
      toast.error(`사진은 ${CHAT_MEDIA_MAX_COUNT}장까지 올릴 수 있어요`);
      return;
    }
    setUploading(true);
    // 한도를 넘긴 건 조용히 버리지 않고 알려준다
    const picked = Array.from(files);
    if (picked.length > room) {
      toast.error(`${room}장만 추가했어요 (최대 ${CHAT_MEDIA_MAX_COUNT}장)`);
    }
    const uploaded: ChatMediaItem[] = [];
    for (const f of picked.slice(0, room)) {
      // uploadChatMedia가 용량·형식 에러 토스트를 직접 띄운다
      const item = await uploadChatMedia(f, user.id);
      if (item) uploaded.push(item);
    }
    if (uploaded.length > 0) setMedia((prev) => [...prev, ...uploaded]);
    setUploading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("event_comments").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    // Realtime DELETE를 기다리지 않고 바로 지운다 (본인 화면 즉시 반영)
    removeLocal(id);
    toast.success("삭제되었습니다");
  }

  // 지난 공연에 댓글도 없으면 섹션 자체를 그리지 않는다 — 입력창도 없어서
  // "댓글" 제목만 덩그러니 남는다.
  if (isPast && comments.length === 0) return null;

  return (
    <section>
      <h2 className="text-[17px] font-black mb-2">
        댓글
        {comments.length > 0 && (
          <span className="ml-1.5 text-muted-foreground">{comments.length}</span>
        )}
      </h2>

      {/* 댓글이 없으면 카드 자체를 안 그린다 — 빈 안내문이 자리만 먹고,
          바로 아래 입력창이 이미 무엇을 하는 곳인지 말해준다. */}
      {comments.length > 0 && (
        <div className="rounded-2xl bg-card border border-border">
          <ul>
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                isMine={!!user && c.author_id === user.id}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 지난 공연은 읽기 전용 — 입력창을 아예 안 그린다 */}
      {!isPast && (
        <div className="mt-2 rounded-2xl bg-card border border-border p-3 space-y-2.5">
          {withRoom && (
            <input
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value.slice(0, MAX_TITLE))}
              placeholder="방 이름 (예: 11시쯤 갈 사람)"
              className="w-full bg-muted/40 rounded-xl px-3 py-2.5 text-[14px] font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-amber"
            />
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
                withRoom
                  ? "어떤 사람을 구하는지 적어주세요"
                  : "이 공연에 대한 느낌을 알려주세요"
              }
              className="flex-1 resize-none bg-muted/40 rounded-xl px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-amber max-h-28"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && media.length === 0) || sending || uploading}
              aria-label="댓글 등록"
              className="shrink-0 w-10 h-10 rounded-xl bg-brand-amber text-black flex items-center justify-center disabled:opacity-40 transition-opacity"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* 첨부 줄 — 사진과 채팅방을 나란히 둔다.
              채팅방 하나만 있으면 그게 유일한 부가 행동처럼 보여 누르기 부담스럽다. */}
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

            <button
              type="button"
              onClick={() => setWithRoom((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold transition-colors ${
                withRoom
                  ? "text-brand-amber"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
              {withRoom ? "채팅방 취소" : "채팅방"}
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
  onDelete,
}: {
  comment: EventComment;
  isMine: boolean;
  onDelete: () => void;
}) {
  const name = comment.author?.display_name ?? "알 수 없음";
  const room = comment.room;

  return (
    <li className="px-4 py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-2.5">
        {comment.author?.profile_image ? (
          <Image
            src={comment.author.profile_image}
            alt=""
            width={28}
            height={28}
            className="w-7 h-7 rounded-full object-cover shrink-0"
          />
        ) : (
          <span className="w-7 h-7 rounded-full bg-muted shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-bold truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {timeShort(comment.created_at)}
            </span>
          </div>
          {comment.content && (
            <p className="text-[14px] mt-0.5 whitespace-pre-wrap break-words">
              {comment.content}
            </p>
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

          {/* 방을 올린 댓글이면 카드가 따라붙는다 */}
          {room && (
            <Link
              href={`/chat/${encodeURIComponent(room.room)}`}
              className="mt-2 flex items-center gap-2.5 rounded-xl bg-muted/40 border border-border px-3 py-2.5 hover:bg-muted/70 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-brand-amber/15 flex items-center justify-center shrink-0">
                {room.is_closed ? (
                  <Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Users className="w-4 h-4 text-brand-amber" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold truncate">
                  {room.title}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {room.is_closed ? "마감된 방" : "채팅방 들어가기"}
                </span>
              </span>
            </Link>
          )}
        </div>

        {isMine && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="댓글 삭제"
            className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors p-1"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}
