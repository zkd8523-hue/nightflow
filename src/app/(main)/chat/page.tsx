"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { useAreaVerification } from "@/hooks/useAreaVerification";
import {
  CHAT_ROOMS,
  ROOM_LABEL,
  type ChatRoomCode,
} from "@/lib/chat/areas";

export default function ChatPage() {
  const [active, setActive] = useState<ChatRoomCode>("all");
  const { activeAreas, refresh: refreshVerifications } = useAreaVerification();

  // 어느 탭이든 인증된 지역이 있으면 항상 표시 (한 번에 한 지역만 인증 정책)
  const verifiedBadge = activeAreas[0]?.area ?? null;

  // 페이지 진입 후 인증 로드 완료 시 인증 지역으로 1회 자동 전환
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (verifiedBadge) {
      setActive(verifiedBadge);
      autoSelectedRef.current = true;
    }
  }, [verifiedBadge]);

  return (
    <div className="max-w-lg mx-auto bg-[#0B0A11] pb-24">
      {/* 글로벌 헤더에서 와글 제목/부제 표시 — 여기는 탭 + 인증 배지만 sticky */}
      <nav className="sticky top-[52px] z-20 bg-[#0B0A11]/95 backdrop-blur-sm border-b border-neutral-800 flex items-center gap-1 overflow-x-auto px-3 py-2 no-scrollbar">
        {CHAT_ROOMS.map((r) => {
          const selected = active === r.code;
          return (
            <button
              key={r.code}
              onClick={() => setActive(r.code)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                selected
                  ? "bg-gradient-to-r from-[#A78BFA] to-[#C084FC] text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          );
        })}

        {/* 인증 배지 — 현재 탭 기준 인증 상태 노출 */}
        {verifiedBadge && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-300 text-[11px] font-bold">
            <MapPin className="w-3 h-3" />
            {ROOM_LABEL[verifiedBadge]} 인증됨
          </span>
        )}
      </nav>

      <ChatRoom
        room={active}
        onAreaVerified={(detected) => {
          // 인증된 지역의 채팅방으로 자동 전환 + ChatPage 인증 상태도 즉시 갱신
          setActive(detected);
          refreshVerifications();
        }}
      />
    </div>
  );
}
