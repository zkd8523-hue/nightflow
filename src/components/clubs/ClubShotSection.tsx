"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { useChatShots } from "@/hooks/useChatShots";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ShotViewerSheet } from "@/components/chat/ShotViewerSheet";
import { getViewedShotIds, markShotViewed } from "@/lib/chat/viewedShots";

interface Props {
  clubId: string;
  clubName: string;
  clubAreaKr?: string | null;
}

/** 업로드 경과 시간 — <1분 "방금", <60분 "N분 전", 그 이상 "N시간 전" */
function agoText(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 60_000) return "방금";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

/**
 * 클럽 상세 페이지 LIVE 섹션 — 보기 전용 (대표 이미지 바로 아래).
 *   - useChatShots(clubId=…) → 그 클럽 LIVE만 로드 (12h 휘발)
 *   - 게시는 와글에서 클럽 태그로 (여기선 + 버튼 없음)
 *   - LIVE 없으면 섹션 숨김
 */
export function ClubShotSection({ clubId }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { shots, toggleLike } = useChatShots(undefined, user?.id, clubId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    setViewedSet(getViewedShotIds());
  }, [shots]);

  if (shots.length === 0) return null;

  return (
    <section className="px-3 py-3 border-b border-neutral-900 bg-[#0A0A0A]">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Zap className="w-3.5 h-3.5 text-red-400 fill-red-400" />
        <span className="text-[12px] font-black text-white">LIVE</span>
        <span className="text-[11px] text-neutral-500">
          — 지금 이 클럽의 분위기
        </span>
      </div>

      <div className="flex items-start gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {shots.map((shot, idx) => {
          const viewed = viewedSet.has(shot.id);
          return (
            <button
              key={shot.id}
              type="button"
              onClick={() => {
                markShotViewed(shot.id);
                setViewedSet((prev) => new Set(prev).add(shot.id));
                setViewerIndex(idx);
              }}
              className="shrink-0 w-[72px] flex flex-col items-center gap-1"
            >
              <div
                className={`relative w-[72px] h-[72px] rounded-full p-[2px] ${
                  viewed
                    ? "bg-neutral-700"
                    : "bg-gradient-to-br from-red-500 via-pink-500 to-amber-500"
                }`}
              >
                <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-900 border-2 border-[#0A0A0A]">
                  {shot.media_type === "image" ? (
                    <Image
                      src={shot.media_url}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                  ) : (
                    <video
                      src={`${shot.media_url}#t=0.1`}
                      className="w-full h-full object-cover pointer-events-none"
                      muted
                      playsInline
                      preload="metadata"
                      controls={false}
                      disablePictureInPicture
                      controlsList="nodownload nofullscreen noremoteplayback"
                    />
                  )}
                </div>
              </div>
              {/* 업로드 시간 */}
              <span
                className={`text-[10px] truncate w-full text-center font-bold ${
                  viewed ? "text-neutral-600" : "text-neutral-400"
                }`}
              >
                {agoText(shot.created_at)}
              </span>
            </button>
          );
        })}
      </div>

      <ShotViewerSheet
        shots={shots}
        index={viewerIndex}
        onIndexChange={(idx) => {
          if (idx !== null && shots[idx]) {
            markShotViewed(shots[idx].id);
            setViewedSet((prev) => new Set(prev).add(shots[idx].id));
          }
          setViewerIndex(idx);
        }}
        currentUserId={user?.id}
        onToggleLike={toggleLike}
        onRequireLogin={() => router.push(`/login?redirect=/clubs/${clubId}`)}
      />
    </section>
  );
}
