"use client";

import { useState } from "react";
import Image from "next/image";
import { Heart, Plus } from "lucide-react";
import { useChatShots } from "@/hooks/useChatShots";
import { ROOM_LABEL } from "@/lib/chat/areas";
import type { ChatShot, VerifiableArea } from "@/types/database";
import { ShotViewerSheet } from "./ShotViewerSheet";

interface Props {
  /** 표시할 area 필터. 비우거나 undefined면 전체(잡담방) */
  areas?: VerifiableArea[];
  /** "SHOT 올리기" 버튼 표시 여부 (지역방에서만) */
  showComposeButton?: boolean;
  onComposeClick?: () => void;
  currentUserId?: string;
  currentUserProfile?: { profile_image: string | null; display_name: string | null } | null;
}

/**
 * 와글 SHOT 가로 캐러셀 — 메시지 리스트 위에 표시
 * 인스타 스토리 스타일
 */
export function ShotCarousel({
  areas,
  showComposeButton,
  onComposeClick,
  currentUserId,
  currentUserProfile,
}: Props) {
  const { shots, loading, toggleLike } = useChatShots(areas, currentUserId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // SHOT이 하나도 없고 컴포즈 버튼도 안 보일 거면 렌더 안 함
  if (!loading && shots.length === 0 && !showComposeButton) return null;

  return (
    <div className="px-3 py-2.5 border-b border-neutral-900 bg-[#0B0A11]">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {showComposeButton && (
          <button
            type="button"
            onClick={onComposeClick}
            className="shrink-0 w-16"
            aria-label="SHOT 올리기"
          >
            <div className="relative w-16 h-16">
              {/* 본인 프로필 이미지 (인스타 '내 스토리' 패턴) */}
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-neutral-900 border-2 border-neutral-800">
                {currentUserProfile?.profile_image ? (
                  <Image
                    src={currentUserProfile.profile_image}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40 text-[18px] font-black">
                    {(currentUserProfile?.display_name ?? "나").charAt(0)}
                  </div>
                )}
              </div>
              {/* 우하단 + 배지 (인스타 패턴) */}
              <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-amber-500 ring-2 ring-[#0B0A11] flex items-center justify-center">
                <Plus className="w-3 h-3 text-black" strokeWidth={3} />
              </span>
            </div>
          </button>
        )}

        {shots.map((shot, idx) => (
          <button
            key={shot.id}
            type="button"
            onClick={() => setViewerIndex(idx)}
            className="shrink-0 w-16 flex flex-col items-center gap-1"
          >
            <ShotThumb shot={shot} isMine={shot.author_id === currentUserId} />
            <span className="text-[10px] text-neutral-400 truncate w-full text-center font-bold">
              {shot.author?.display_name ?? "익명"}
            </span>
          </button>
        ))}

        {loading &&
          shots.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="shrink-0 w-16 h-16 rounded-full bg-neutral-900 animate-pulse"
            />
          ))}
      </div>

      <ShotViewerSheet
        shots={shots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        currentUserId={currentUserId}
        onToggleLike={toggleLike}
      />
    </div>
  );
}

function ShotThumb({ shot, isMine }: { shot: ChatShot; isMine: boolean }) {
  return (
    <div
      className={`relative w-16 h-16 rounded-full p-[2px] ${
        isMine
          ? "bg-gradient-to-br from-amber-400 to-amber-600"
          : "bg-gradient-to-br from-[#A78BFA] to-[#C084FC]"
      }`}
    >
      <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-900 border-2 border-[#0B0A11]">
        {shot.media_type === "image" ? (
          <Image
            src={shot.media_url}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <>
            <video
              src={shot.media_url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white text-[9px]">
                ▶
              </div>
            </div>
          </>
        )}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-black bg-black text-white px-1 py-0.5 rounded-full border border-[#0B0A11] leading-none">
        {ROOM_LABEL[shot.area].slice(0, 2)}
      </span>
      {shot.like_count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center gap-0.5 text-[8px] font-black bg-red-500 text-white px-1 py-0.5 rounded-full border border-[#0B0A11] leading-none">
          <Heart className="w-2 h-2 fill-white" />
          {shot.like_count}
        </span>
      )}
    </div>
  );
}
