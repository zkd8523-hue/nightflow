"use client";

import { useState } from "react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { type ChatRegionCode } from "@/lib/chat/areas";
import { useChatComposerStore } from "@/stores/useChatComposerStore";

/**
 * 와글 페이지 (Migration 421)
 * - 초기 런칭: '수도권' 단일방. 라벨로 소속감을 주되, 콘텐츠는 한 방에 밀집시켜
 *   각 방이 텅 비어 보이는 역효과를 피한다. (거의 모든 클럽·글이 수도권)
 * - 부산·광주 등 실제 콘텐츠 밀도가 생기면 LAUNCH_REGIONS에 한 줄씩 추가 →
 *   자동으로 다지역 탭 선택 UI가 된다.
 */
const LAUNCH_REGIONS: { code: ChatRegionCode; label: string }[] = [
  { code: "sudogwon", label: "수도권" },
  { code: "gyeongsang", label: "경상권" },
  // 밀도 생기면 해제:
  // { code: "jeolla", label: "전라권" },
];

export default function ChatPage() {
  const [room, setRoom] = useState<ChatRegionCode>(LAUNCH_REGIONS[0].code);
  // 입력 포커스 시 BottomNav가 숨으므로 그 56px만큼 채팅 영역 확장
  const composerFocused = useChatComposerStore((s) => s.focused);

  return (
    <div
      className={`max-w-lg mx-auto bg-background flex flex-col overflow-hidden ${
        composerFocused
          ? "h-[calc(100dvh-env(safe-area-inset-bottom))]"
          : "h-[calc(100dvh-56px-env(safe-area-inset-bottom))]"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* 지역 필터 — 채팅 상단 우측에 배치 (세로 공간 절약, 컴팩트 크기) */}
      <ChatRoom
        room={room}
        regionFilter={
          <div className="flex items-center gap-1">
            {LAUNCH_REGIONS.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => setRoom(r.code)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-black transition-colors ${
                  room === r.code
                    ? "bg-inverse text-inverse-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
