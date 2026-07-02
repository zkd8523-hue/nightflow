"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Zap, Plus } from "lucide-react";
import { useChatShots } from "@/hooks/useChatShots";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAreaVerification } from "@/hooks/useAreaVerification";
import { ShotViewerSheet } from "@/components/chat/ShotViewerSheet";
import { ShotCaptureSheet } from "@/components/chat/ShotCaptureSheet";
import { getViewedShotIds, markShotViewed } from "@/lib/chat/viewedShots";
import type { VerifiableArea } from "@/lib/chat/areas";

const AREA_KR_TO_CODE: Record<string, VerifiableArea> = {
  강남: "gangnam",
  홍대: "hongdae",
  이태원: "itaewon",
};

interface Props {
  clubId: string;
  clubName: string;
  clubAreaKr?: string | null; // "강남" | "홍대" | "이태원"
}

/**
 * 클럽 상세 페이지 SHOT 섹션 (Migration 341/404 이후)
 *   - useChatShots(clubId=…) → 그 클럽 LIVE만 로드
 *   - 인증된 area가 클럽 area와 일치하면 "첫 SHOT 올리기" CTA
 *   - 미인증 유저는 SHOT이 없으면 섹션 자체를 숨김
 */
export function ClubShotSection({ clubId, clubName, clubAreaKr }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { isVerified } = useAreaVerification();
  const { shots, loading, toggleLike, addLocalShot } = useChatShots(
    undefined,
    user?.id,
    clubId
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    setViewedSet(getViewedShotIds());
  }, [shots]);

  const clubArea: VerifiableArea | null = useMemo(() => {
    if (!clubAreaKr) return null;
    return AREA_KR_TO_CODE[clubAreaKr] ?? null;
  }, [clubAreaKr]);

  const canPost = !!user && !!clubArea && isVerified(clubArea);

  // 빈 상태 + 미인증 유저 → 렌더 안 함
  if (!loading && shots.length === 0 && !canPost) return null;

  return (
    <section className="px-3 py-3 border-b border-neutral-900 bg-[#0B0A11]">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Zap className="w-3.5 h-3.5 text-red-400 fill-red-400" />
        <span className="text-[12px] font-black text-white">LIVE</span>
        <span className="text-[11px] text-neutral-500">
          — 지금 이 클럽 · 9시간 후 사라져요
        </span>
      </div>

      {/* 빈 상태 (인증 유저만 노출) */}
      {!loading && shots.length === 0 && canPost && (
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800 text-left active:scale-[0.98] transition"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 via-pink-500 to-amber-500 flex items-center justify-center shrink-0">
            <Plus className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-black text-white">
              지금 이 클럽에 계신가요?
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              첫 LIVE를 올려서 분위기를 전해주세요
            </div>
          </div>
        </button>
      )}

      {/* 카루셀 */}
      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {canPost && (
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="shrink-0 w-16"
              aria-label="LIVE 올리기"
            >
              <div className="relative w-16 h-16">
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-neutral-900 border-2 border-neutral-800">
                  {user?.profile_image ? (
                    <Image
                      src={user.profile_image}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40 text-[18px] font-black">
                      {(user?.display_name ?? "나").charAt(0)}
                    </div>
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-red-500 ring-2 ring-[#0B0A11] flex items-center justify-center">
                  <Plus className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              </div>
            </button>
          )}

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
                className="shrink-0 w-16 flex flex-col items-center gap-1"
              >
                <div
                  className={`relative w-16 h-16 rounded-full p-[2px] ${
                    viewed
                      ? "bg-neutral-700"
                      : "bg-gradient-to-br from-red-500 via-pink-500 to-amber-500"
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
                      <video
                        src={shot.media_url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] truncate w-full text-center font-bold ${
                    viewed ? "text-neutral-600" : "text-neutral-300"
                  }`}
                >
                  {shot.author?.display_name ?? "익명"}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
        onRequireLogin={() =>
          router.push(`/login?redirect=/clubs/${clubId}`)
        }
      />

      {user && (
        <ShotCaptureSheet
          open={composeOpen}
          onOpenChange={setComposeOpen}
          area={clubArea}
          userId={user.id}
          userProfile={{
            display_name: user.display_name ?? null,
            profile_image: user.profile_image ?? null,
          }}
          presetClub={{ id: clubId, name: clubName }}
          onPosted={addLocalShot}
        />
      )}
    </section>
  );
}
