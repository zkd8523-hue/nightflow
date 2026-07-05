"use client";

import { MapPin } from "lucide-react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { LiveIntroModal } from "@/components/chat/LiveIntroModal";
import { useAreaVerification } from "@/hooks/useAreaVerification";
import { ROOM_LABEL } from "@/lib/chat/areas";

/**
 * 와글 페이지 (Migration 413 이후)
 * - 채팅방: "서울" 단일 통합 (기존 all=잡담 방 재활용)
 * - LIVE 캐러셀 내부에서 지역별 pill 필터 (강남/홍대/이태원)
 * - 인증 배지는 헤더 우측에 유지
 */
export default function ChatPage() {
  const { activeAreas, refresh: refreshVerifications } = useAreaVerification();
  const verifiedBadge = activeAreas[0]?.area ?? null;

  return (
    <div className="max-w-lg mx-auto bg-[#0B0A11] pb-24">
      <LiveIntroModal />

      {/* 헤더: 서울 라벨 + 인증 배지 (지역 탭 제거됨) */}
      {verifiedBadge && (
        <div className="sticky top-[52px] z-20 bg-[#0B0A11]/95 backdrop-blur-sm border-b border-neutral-800 flex items-center justify-end px-3 py-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-300 text-[11px] font-bold">
            <MapPin className="w-3 h-3" />
            {ROOM_LABEL[verifiedBadge]} 인증됨
          </span>
        </div>
      )}

      <ChatRoom
        room="all"
        onAreaVerified={() => {
          // 서울 통합 방이라 방 전환 필요 없음. 인증만 갱신.
          refreshVerifications();
        }}
      />
    </div>
  );
}
