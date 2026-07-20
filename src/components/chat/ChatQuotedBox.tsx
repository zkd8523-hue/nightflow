"use client";

import Image from "next/image";
import { MapPin } from "lucide-react";
import { ROOM_LABEL } from "@/lib/chat/areas";
import type { ChatMessage } from "@/types/database";

interface Props {
  quoted: NonNullable<ChatMessage["quoted_message"]>;
}

/**
 * 인용 박스 — 공유된 원본 메시지를 본문 위에 작게 표시
 * 카톡 답장 인용 박스 패턴
 */
export function ChatQuotedBox({ quoted }: Props) {
  const author = quoted.author;
  const displayName = author?.display_name ?? "익명";

  return (
    <div className="mb-1 pl-2 border-l-2 border-[#7C3AED]/60 bg-card/50 rounded-r-md py-1.5 pr-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        {/* 작은 아바타 */}
        <div className="relative w-4 h-4 rounded-full overflow-hidden bg-muted shrink-0">
          {author?.profile_image ? (
            <Image
              src={author.profile_image}
              alt=""
              fill
              sizes="16px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-foreground/50 text-[8px] font-black">
              {displayName.charAt(0)}
            </div>
          )}
        </div>
        <span className="text-[11px] font-bold text-foreground/80 truncate">
          {displayName}
        </span>
        {quoted.author_area && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-green-500/15 text-money text-[9px] font-bold leading-none">
            <MapPin className="w-2 h-2" />
            {ROOM_LABEL[quoted.author_area]}
          </span>
        )}
      </div>
      {quoted.is_deleted ? (
        <p className="text-[12px] text-muted-foreground italic">
          삭제된 메시지
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground line-clamp-2 break-words">
          {quoted.content}
          {quoted.media && quoted.media.length > 0 && (
            <span className="ml-1 text-muted-foreground">
              [📷 {quoted.media.length}]
            </span>
          )}
        </p>
      )}
    </div>
  );
}
