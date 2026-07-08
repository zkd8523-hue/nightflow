"use client";

import { useState } from "react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { LiveIntroModal } from "@/components/chat/LiveIntroModal";
import { type ChatRegionCode } from "@/lib/chat/areas";

/**
 * 와글 페이지 (Migration 421)
 * - 초기 런칭: '수도권' 단일방. 라벨로 소속감을 주되, 콘텐츠는 한 방에 밀집시켜
 *   각 방이 텅 비어 보이는 역효과를 피한다. (거의 모든 클럽·글이 수도권)
 * - 부산·광주 등 실제 콘텐츠 밀도가 생기면 LAUNCH_REGIONS에 한 줄씩 추가 →
 *   자동으로 다지역 탭 선택 UI가 된다.
 * - LIVE 캐러셀은 이미 전국 통합 (Migration 420).
 */
const LAUNCH_REGIONS: { code: ChatRegionCode; label: string }[] = [
  { code: "sudogwon", label: "수도권" },
  { code: "gyeongsang", label: "경상권" },
  // 밀도 생기면 해제:
  // { code: "jeolla", label: "전라권" },
];

export default function ChatPage() {
  const [room, setRoom] = useState<ChatRegionCode>(LAUNCH_REGIONS[0].code);

  return (
    <div className="max-w-lg mx-auto bg-[#0B0A11] pb-24">
      <LiveIntroModal />

      {/* 지역 라벨 — 소속감(수도권). LAUNCH_REGIONS가 늘면 탭 선택 UI로 확장 */}
      <div className="sticky top-[52px] z-20 bg-[#0B0A11]/95 backdrop-blur-sm border-b border-neutral-800 flex items-center gap-1.5 px-3 py-2">
        {LAUNCH_REGIONS.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => setRoom(r.code)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-black transition-colors ${
              room === r.code
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ChatRoom room={room} />
    </div>
  );
}
