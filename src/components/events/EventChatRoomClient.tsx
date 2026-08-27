"use client";

import Link from "next/link";
import { ChatRoom } from "@/components/chat/ChatRoom";
import type { ChatRoomCode } from "@/lib/chat/areas";

/**
 * 공연 채팅방 (Migration 598).
 *
 * ChatRoom을 그대로 쓴다 — 도배 방지·이미지·답글·리액션·신고가 전부 딸려온다.
 * 방이 하나뿐이라 지역 필터는 없고, 대신 header 슬롯에 방 제목을 넣는다
 * (밖에서 헤더를 따로 그리면 ChatRoom의 뒤로가기와 두 줄로 겹친다).
 *
 * 라우트가 서버 컴포넌트라 이 조각만 클라이언트로 분리했다.
 */
export function EventChatRoomClient({
  room,
  title,
  eventTitle,
  backHref,
  isClosed,
}: {
  room: string;
  title: string;
  eventTitle: string | null;
  backHref: string;
  isClosed: boolean;
}) {
  return (
    <ChatRoom
      room={room as ChatRoomCode}
      header={
        <Link
          href={backHref}
          className="min-w-0 flex-1 group"
          aria-label={`${eventTitle ?? "공연"}으로 이동`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[14px] font-black truncate group-hover:text-brand-amber transition-colors">
              {title}
            </span>
            {isClosed && (
              <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                마감
              </span>
            )}
          </span>
          {/* 어느 공연 방인지 — 방 이름이 곧 댓글 본문이라 설명을 또 쓰면 같은 말이 두 번 나온다 */}
          <span className="block text-[11px] text-muted-foreground truncate">
            {eventTitle ?? ""}
          </span>
        </Link>
      }
    />
  );
}
