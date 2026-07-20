"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, Plus, Zap } from "lucide-react";
import { useChatShots } from "@/hooks/useChatShots";
import type { ChatShot, VerifiableArea } from "@/types/database";
import { ShotViewerSheet } from "./ShotViewerSheet";
import { getViewedShotIds, markShotViewed } from "@/lib/chat/viewedShots";
import { areaToRegion, type ChatRegionCode } from "@/lib/chat/areas";

// 클럽 미지정 LIVE 라벨 폴백 — 닉네임 대신 지역 (캐러셀은 "어디가 핫한가"용)
const AREA_KR: Record<string, string> = { gangnam: "강남", hongdae: "홍대", itaewon: "이태원" };

interface Props {
  /** (하위호환) 필터 파라미터 — Migration 404 이후 무시됨 */
  areas?: VerifiableArea[];
  /** 현재 보고 있는 광역 채팅방 — 이 지역 LIVE를 앞으로 정렬 (Migration 421) */
  currentRoom?: ChatRegionCode;
  /** 특정 클럽 페이지 컨텍스트 — 그 club_id LIVE만 로드 */
  clubId?: string;
  /** "SHOT 올리기" 버튼 표시 여부 */
  showComposeButton?: boolean;
  onComposeClick?: () => void;
  currentUserId?: string;
  currentUserProfile?: { profile_image: string | null; display_name: string | null } | null;
  /** 헤더 부제 멘트 (기본: 와글 문구). 홈 등에서 커스텀 */
  subtitle?: string;
  /** 마지막 LIVE까지 다 보면 이 경로로 유도(엔드카드). 홈 캐러셀 전용 */
  endCardTo?: string;
  /** LIVE 라벨 행 우측에 넣을 노드 (와글: 지역 필터). 세로 공간 절약용 */
  headerRight?: ReactNode;
  /** 원 지름(px). 홈=60 기본, LIVE 탭은 조금 크게 */
  size?: number;
}

/**
 * 와글 SHOT 통합 캐러셀 (Migration 421)
 *  - area pill 필터 제거. 정렬만: 현재 방 지역 → 다른 지역 → 이미 본 것
 *  - LIVE 그룹 슬롯: 클럽 지정된 LIVE만 모아서 첫 자리에 노출
 *  - 클럽 페이지에서는 clubId로 필터
 */
export function ShotCarousel({
  areas,
  currentRoom,
  clubId,
  showComposeButton,
  onComposeClick,
  endCardTo,
  currentUserId,
  currentUserProfile,
  headerRight,
  size = 60,
}: Props) {
  const router = useRouter();
  const { shots, loading, toggleLike } = useChatShots(areas, currentUserId, clubId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    setViewedSet(getViewedShotIds());
  }, [shots]);

  // 정렬: (1) 안 본 것 우선 → (2) 현재 방 지역 매치 우선 → (3) 최신순 보존
  //   "현재 채팅방 지역 → 다른 지역 → 이미 본 것"
  const sortedShots = useMemo(() => {
    const withRank = shots.map((s, i) => ({
      s,
      i,
      viewed: viewedSet.has(s.id),
      regionMatch:
        currentRoom && s.club?.area
          ? areaToRegion(s.club.area) === currentRoom
          : false,
    }));
    withRank.sort((a, b) => {
      if (a.viewed !== b.viewed) return a.viewed ? 1 : -1;
      if (a.regionMatch !== b.regionMatch) return a.regionMatch ? -1 : 1;
      return a.i - b.i;
    });
    return withRank.map((r) => r.s);
  }, [shots, viewedSet, currentRoom]);

  // 그룹 키 — 남의 LIVE는 "클럽 단위"(클럽 없으면 작성자), 내 LIVE는 하나("me")로 묶음.
  //  → 같은 유저가 여러 클럽에 올려도 클럽별로 다른 원. 같은 클럽 여러 유저는 한 원("그 클럽 지금 분위기").
  const groupKeyOf = useCallback(
    (s: ChatShot) => {
      if (currentUserId && s.author_id === currentUserId) return "me";
      // 클럽은 이름+지역 기준으로 묶음 — 같은 이름의 중복 클럽 레코드(다른 id)도 한 원으로.
      if (s.club?.name)
        return `c:${s.club.name.trim().toLowerCase()}|${s.club.area ?? ""}`;
      return s.club_id ? `c:${s.club_id}` : `u:${s.author_id}`;
    },
    [currentUserId]
  );

  // 클럽별 그룹 (인스타 스토리식) + 같은 그룹 shot이 연속되도록 재정렬.
  // 대표 썸네일 = 그 그룹의 첫(정렬 우선) shot. 탭하면 그 그룹 첫 shot index로 뷰어 오픈.
  // 뷰어는 그룹 연속 정렬된 groupedShots를 순차 재생 → 한 클럽이 끝나면 다음 그룹으로.
  const { userGroups, groupedShots } = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, ChatShot[]>();
    sortedShots.forEach((s) => {
      const k = groupKeyOf(s);
      if (!buckets.has(k)) {
        buckets.set(k, []);
        order.push(k);
      }
      buckets.get(k)!.push(s);
    });
    const flat: ChatShot[] = [];
    const grps: {
      key: string;
      rep: ChatShot;
      firstIndex: number;
      count: number;
      allViewed: boolean;
    }[] = [];
    order.forEach((k) => {
      const arr = buckets.get(k)!;
      grps.push({
        key: k,
        rep: arr[0],
        firstIndex: flat.length,
        count: arr.length,
        allViewed: arr.every((s) => viewedSet.has(s.id)),
      });
      flat.push(...arr);
    });
    return { userGroups: grps, groupedShots: flat };
  }, [sortedShots, viewedSet, groupKeyOf]);

  const displayShots = groupedShots;

  // 뷰어용 shots 스냅샷 — 뷰어가 열린 동안엔 배열을 고정한다.
  // 재생 중 markViewed가 viewedSet을 바꿔 정렬이 재계산되면 index가 다른 shot을
  // 가리키거나 범위를 벗어나 뷰어가 통째로 닫히던 버그를 막는다.
  const viewerSnapshotRef = useRef<ChatShot[] | null>(null);
  if (viewerIndex === null) {
    viewerSnapshotRef.current = null; // 닫혀있으면 스냅샷 해제
  } else if (viewerSnapshotRef.current === null) {
    viewerSnapshotRef.current = displayShots; // 열리는 순간 1회 고정
  }
  const viewerShots = viewerSnapshotRef.current ?? displayShots;

  // 홈(showComposeButton=false): 로딩 중/빈 상태엔 아예 숨김 (빈 스켈레톤 원 안 보이게).
  // 실제 LIVE가 로드되면 그때 나타남. 와글(showComposeButton=true)은 그대로 노출.
  if (!showComposeButton && shots.length === 0) return null;

  // 내 LIVE 그룹 (인스타처럼: 내 원 = 내 라이브 보기, + 배지 = 게시)
  // 내 shot은 클럽 무관하게 "me" 그룹 하나로 묶임.
  const myGroup = currentUserId
    ? userGroups.find((g) => g.key === "me")
    : undefined;
  const otherGroups = userGroups.filter((g) => g.key !== "me");

  return (
    <div className="px-3 pt-1 pb-1 border-b border-neutral-900 bg-[#0B0A11]">
      <div className="flex items-center justify-between gap-2 mb-0.5 px-1">
        <div className="flex items-center gap-1.5 shrink-0">
          <Zap className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          <span className="text-[12px] font-black text-red-400">LIVE</span>
        </div>
        {headerRight}
      </div>
      <div className="flex items-start gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {showComposeButton && (
          <div className="shrink-0 flex flex-col items-center gap-1" style={{ width: size }}>
            <div className="relative" style={{ width: size, height: size }}>
              {/* 원 탭 — 내 LIVE 있으면 보기, 없으면 게시 */}
              <button
                type="button"
                onClick={() => {
                  if (myGroup) {
                    markShotViewed(myGroup.rep.id);
                    setViewedSet((prev) => new Set(prev).add(myGroup.rep.id));
                    setViewerIndex(myGroup.firstIndex);
                  } else {
                    onComposeClick?.();
                  }
                }}
                className="block" style={{ width: size, height: size }}
                aria-label={myGroup ? "내 LIVE 보기" : "LIVE 올리기"}
              >
                {myGroup ? (
                  <ShotThumb shot={myGroup.rep} isMine isViewed={myGroup.allViewed} size={size} />
                ) : (
                  <div className="rounded-full p-[2px] bg-neutral-700" style={{ width: size, height: size }}>
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-900 border-2 border-[#0B0A11]">
                      {currentUserProfile?.profile_image ? (
                        <Image src={currentUserProfile.profile_image} alt="" fill sizes={`${size}px`} className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-[18px] font-black">
                          {(currentUserProfile?.display_name ?? "나").charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </button>
              {/* + 배지 — 항상 게시(카메라) */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onComposeClick?.(); }}
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-amber-500 ring-2 ring-[#0B0A11] flex items-center justify-center active:scale-90 transition-transform"
                aria-label="LIVE 올리기"
              >
                <Plus className="w-3 h-3 text-black" strokeWidth={3} />
              </button>
            </div>
            <span className="text-[10px] truncate w-full text-center font-bold text-neutral-400">
              {myGroup ? "내 라이브" : " "}
            </span>
          </div>
        )}

        {otherGroups.map((group) => {
          const shot = group.rep;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                markShotViewed(shot.id);
                setViewedSet((prev) => new Set(prev).add(shot.id));
                setViewerIndex(group.firstIndex);
              }}
              className="shrink-0 flex flex-col items-center gap-1"
              style={{ width: size }}
            >
              <ShotThumb
                size={size}
                shot={shot}
                isMine={shot.author_id === currentUserId}
                isViewed={group.allViewed}
              />
              <span
                className={`text-[10px] truncate w-full text-center font-bold ${
                  group.allViewed ? "text-neutral-600" : "text-neutral-300"
                }`}
              >
                {shot.club?.name ??
                  (shot.area ? AREA_KR[shot.area] : null) ??
                  "익명"}
              </span>
            </button>
          );
        })}

        {loading &&
          shots.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="shrink-0 rounded-full bg-neutral-900 animate-pulse"
              style={{ width: size, height: size }}
            />
          ))}
      </div>

      <ShotViewerSheet
        shots={viewerShots}
        index={viewerIndex}
        onIndexChange={(idx) => {
          // 본 것 기록만 하고, 뷰어가 참조하는 배열(viewerShots)은 스냅샷이라 안 바뀜
          if (idx !== null && viewerShots[idx]) {
            markShotViewed(viewerShots[idx].id);
            setViewedSet((prev) => new Set(prev).add(viewerShots[idx].id));
          }
          setViewerIndex(idx);
        }}
        currentUserId={currentUserId}
        onToggleLike={toggleLike}
        endCardTo={endCardTo}
        onRequireLogin={() => router.push("/login?redirect=/chat")}
      />
    </div>
  );
}

function ShotThumb({
  shot,
  isMine,
  isViewed,
  size = 60,
}: {
  shot: ChatShot;
  isMine: boolean;
  isViewed: boolean;
  size?: number;
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
    <div className={`relative rounded-full p-[2px] ${ringClass}`} style={{ width: size, height: size }}>
      <div className="relative w-full h-full rounded-full overflow-hidden bg-neutral-900 border-2 border-[#0B0A11]">
        {shot.media_type === "image" ? (
          <Image
            src={shot.media_url}
            alt=""
            fill
            sizes={`${size}px`}
            className="object-cover"
          />
        ) : (
          <>
            <video
              // #t=0.1 — 모바일 WebView는 preload만으론 첫 프레임을 안 그린다.
              // 미디어 프래그먼트로 0.1초 지점을 지정해 첫 프레임을 강제 표시.
              src={`${shot.media_url}#t=0.1`}
              className="w-full h-full object-cover pointer-events-none"
              muted
              playsInline
              preload="metadata"
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white text-[9px]">
                ▶
              </div>
            </div>
          </>
        )}
      </div>
      {/* 좋아요 수 배지 숨김 — 뷰어와 동일한 이유(초기엔 낮은 숫자가 역효과) */}
    </div>
  );
}
