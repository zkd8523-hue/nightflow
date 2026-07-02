"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, Plus, Zap } from "lucide-react";
import { useChatShots } from "@/hooks/useChatShots";
import type { ChatShot, VerifiableArea } from "@/types/database";
import { ShotViewerSheet } from "./ShotViewerSheet";
import { getViewedShotIds, markShotViewed } from "@/lib/chat/viewedShots";

interface Props {
  /** (하위호환) 필터 파라미터 — Migration 404 이후 무시됨 */
  areas?: VerifiableArea[];
  /** 사용자 인증 area — 매치되는 SHOT을 앞으로 정렬 */
  userArea?: VerifiableArea | null;
  /** 특정 클럽 페이지 컨텍스트 — 그 club_id LIVE만 로드 */
  clubId?: string;
  /** "SHOT 올리기" 버튼 표시 여부 */
  showComposeButton?: boolean;
  onComposeClick?: () => void;
  currentUserId?: string;
  currentUserProfile?: { profile_image: string | null; display_name: string | null } | null;
}

/**
 * 와글 SHOT 통합 캐러셀 (Migration 404 이후)
 *  - 방 필터 X, 사용자 area 매치 SHOT을 앞으로 정렬
 *  - LIVE 그룹 슬롯: 클럽 지정된 LIVE만 모아서 첫 자리에 노출
 *  - 클럽 페이지에서는 clubId로 필터
 */
export function ShotCarousel({
  areas,
  userArea,
  clubId,
  showComposeButton,
  onComposeClick,
  currentUserId,
  currentUserProfile,
}: Props) {
  const router = useRouter();
  const { shots, loading, toggleLike } = useChatShots(areas, currentUserId, clubId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(false);

  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    setViewedSet(getViewedShotIds());
  }, [shots]);

  // 통합 정렬: (1) 안 본 것 우선 → (2) 사용자 area 매치 우선 → (3) 최신순 보존
  const sortedShots = useMemo(() => {
    const withRank = shots.map((s, i) => ({
      s,
      i,
      viewed: viewedSet.has(s.id),
      areaMatch: userArea ? s.area === userArea : false,
    }));
    withRank.sort((a, b) => {
      if (a.viewed !== b.viewed) return a.viewed ? 1 : -1;
      if (a.areaMatch !== b.areaMatch) return a.areaMatch ? -1 : 1;
      return a.i - b.i;
    });
    return withRank.map((r) => r.s);
  }, [shots, viewedSet, userArea]);

  // LIVE(클럽 지정)만 별도 배열 — 그룹 슬롯 썸네일 + LIVE 모드 뷰어용
  const liveShots = useMemo(
    () => sortedShots.filter((s) => s.club_id !== null),
    [sortedShots]
  );

  const displayShots = liveMode ? liveShots : sortedShots;

  if (!loading && shots.length === 0 && !showComposeButton) return null;

  return (
    <div className="px-3 py-2.5 border-b border-neutral-900 bg-[#0B0A11]">
      <div className="flex items-baseline gap-1.5 mb-2 px-1">
        <span className="text-[12px] font-bold text-amber-400">🥃 SHOT</span>
        <span className="text-[11px] text-neutral-500">
          — 9시간만 남기는 지금 이 순간
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {showComposeButton && (
          <button
            type="button"
            onClick={onComposeClick}
            className="shrink-0 w-16"
            aria-label="SHOT 올리기"
          >
            <div className="relative w-16 h-16">
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
              <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-amber-500 ring-2 ring-[#0B0A11] flex items-center justify-center">
                <Plus className="w-3 h-3 text-black" strokeWidth={3} />
              </span>
            </div>
          </button>
        )}

        {/* LIVE 그룹 슬롯 — 클럽 페이지 컨텍스트가 아닐 때만, LIVE가 1개 이상 있을 때 */}
        {!clubId && liveShots.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setLiveMode(true);
              markShotViewed(liveShots[0].id);
              setViewedSet((prev) => new Set(prev).add(liveShots[0].id));
              setViewerIndex(0);
            }}
            className="shrink-0 w-16 flex flex-col items-center gap-1"
            aria-label="LIVE 모아보기"
          >
            <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-red-500 via-pink-500 to-amber-500">
              <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-900 border-2 border-[#0B0A11]">
                {liveShots[0].media_type === "image" ? (
                  <Image
                    src={liveShots[0].media_url}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <video
                    src={liveShots[0].media_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                <div className="absolute inset-0 bg-black/25" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black leading-none">
                    <Zap className="w-2.5 h-2.5 fill-white" />
                    LIVE
                  </span>
                </div>
              </div>
            </div>
            <span className="text-[10px] truncate w-full text-center font-bold text-red-400">
              LIVE
            </span>
          </button>
        )}

        {sortedShots.map((shot, idx) => {
          const isViewed = viewedSet.has(shot.id);
          return (
            <button
              key={shot.id}
              type="button"
              onClick={() => {
                setLiveMode(false);
                markShotViewed(shot.id);
                setViewedSet((prev) => new Set(prev).add(shot.id));
                setViewerIndex(idx);
              }}
              className="shrink-0 w-16 flex flex-col items-center gap-1"
            >
              <ShotThumb
                shot={shot}
                isMine={shot.author_id === currentUserId}
                isViewed={isViewed}
              />
              <span
                className={`text-[10px] truncate w-full text-center font-bold ${
                  isViewed ? "text-neutral-600" : "text-neutral-300"
                }`}
              >
                {shot.author?.display_name ?? "익명"}
              </span>
            </button>
          );
        })}

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
        shots={displayShots}
        index={viewerIndex}
        onIndexChange={(idx) => {
          if (idx !== null && displayShots[idx]) {
            markShotViewed(displayShots[idx].id);
            setViewedSet((prev) => new Set(prev).add(displayShots[idx].id));
          }
          if (idx === null) setLiveMode(false);
          setViewerIndex(idx);
        }}
        currentUserId={currentUserId}
        onToggleLike={toggleLike}
        onRequireLogin={() => router.push("/login?redirect=/chat")}
      />
    </div>
  );
}

function ShotThumb({
  shot,
  isMine,
  isViewed,
}: {
  shot: ChatShot;
  isMine: boolean;
  isViewed: boolean;
}) {
  // LIVE(클럽 지정)는 red-amber, 일반은 인스타 스토리 그라데이션, 본 SHOT은 회색
  const isLive = shot.club_id !== null;
  const ringClass = isViewed
    ? "bg-neutral-700"
    : isLive
      ? "bg-gradient-to-br from-red-500 via-pink-500 to-amber-500"
      : isMine
        ? "bg-gradient-to-br from-amber-400 to-amber-600"
        : "bg-gradient-to-br from-[#A78BFA] to-[#C084FC]";
  return (
    <div className={`relative w-16 h-16 rounded-full p-[2px] ${ringClass}`}>
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
      {isLive && (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center gap-0.5 text-[8px] font-black bg-red-500 text-white px-1 py-0.5 rounded-full border border-[#0B0A11] leading-none">
          <Zap className="w-2 h-2 fill-white" />
          LIVE
        </span>
      )}
      {shot.like_count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center gap-0.5 text-[8px] font-black bg-red-500 text-white px-1 py-0.5 rounded-full border border-[#0B0A11] leading-none">
          <Heart className="w-2 h-2 fill-white" />
          {shot.like_count}
        </span>
      )}
    </div>
  );
}
