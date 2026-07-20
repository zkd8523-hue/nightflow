"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Send, MapPin } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_ROOMS,
  ROOM_LABEL,
  type ChatRoomCode,
} from "@/lib/chat/areas";
import type { ChatMessage } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 공유할 원본 메시지 */
  source: ChatMessage | null;
  currentUserId?: string;
  onShared?: () => void;
}

/**
 * 카톡식 공유 시트 — 다른 와글방으로 메시지 인용 공유
 */
export function ChatShareSheet({
  open,
  onOpenChange,
  source,
  currentUserId,
  onShared,
}: Props) {
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomCode | null>(null);

  // Migration 421: 인증 없이 광역 3방 어디로든 공유 (원본 방 제외).
  const shareableRooms = CHAT_ROOMS.filter((r) => r.code !== source?.room);

  async function handleShare() {
    if (!source || !selectedRoom || !currentUserId || sending) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("chat_messages").insert({
      room: selectedRoom,
      author_id: currentUserId,
      content: comment.trim(),
      quoted_message_id: source.id,
    });
    if (error) {
      console.error("[ChatShareSheet] share error", error);
      if (error.message?.includes("RATE_LIMIT_INTERVAL")) {
        toast.error("5초 후에 다시 시도해주세요");
      } else if (
        error.code === "42501" ||
        error.message?.includes("row-level security")
      ) {
        toast.error("이 방에 글을 쓸 권한이 없어요");
      } else {
        toast.error(`공유 실패: ${error.message ?? "알 수 없는 오류"}`);
      }
      setSending(false);
      return;
    }
    toast.success(`${ROOM_LABEL[selectedRoom]}에 공유했어요`);
    setComment("");
    setSelectedRoom(null);
    setSending(false);
    onOpenChange(false);
    onShared?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl p-0 pb-6 max-h-[80vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[16px] text-left">
            어느 방으로 공유할까요?
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {shareableRooms.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-neutral-400">
                공유할 수 있는 방이 없어요
              </p>
              {source && source.room === "all" && (
                <p className="text-[11px] text-neutral-600 mt-1">
                  지역 인증을 하면 지역방으로 공유할 수 있어요
                </p>
              )}
              {source && source.room !== "all" && (
                <p className="text-[11px] text-neutral-600 mt-1">
                  지역방끼리는 공유할 수 없어요
                </p>
              )}
            </div>
          ) : (
            <>
              {/* 방 선택 */}
              <div className="space-y-1.5">
                {shareableRooms.map((r) => {
                  const selected = selectedRoom === r.code;
                  return (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setSelectedRoom(r.code)}
                      className={`w-full flex items-center gap-2 px-3 py-3 rounded-2xl border transition-colors ${
                        selected
                          ? "bg-amber-500/15 border-amber-500 text-amber-300"
                          : "bg-[#1C1C1E] border-neutral-800 text-neutral-300 hover:border-neutral-600"
                      }`}
                    >
                      <MapPin className="w-4 h-4" />
                      <span className="font-bold text-[14px]">
                        {r.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 한 마디 (선택) */}
              {selectedRoom && (
                <div className="space-y-1">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="한 마디 추가 (선택)"
                    rows={2}
                    maxLength={300}
                    className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-2xl px-3 py-2 text-white text-[14px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
                  />
                  <div className="text-right text-[10px] text-neutral-600">
                    {comment.length}/300
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 공유 버튼 */}
        {shareableRooms.length > 0 && (
          <div className="px-4 pt-2 border-t border-neutral-800 shrink-0">
            <button
              onClick={handleShare}
              disabled={!selectedRoom || sending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-black bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? "공유 중..." : "공유하기"}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
