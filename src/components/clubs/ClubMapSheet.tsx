"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import { Flag } from "lucide-react";
import { FavoriteButton } from "@/components/auctions/FavoriteButton";
import { getOpeningStatus } from "@/lib/clubs/openingStatus";

interface ClubItem {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
  drink_menu_url?: string | null;
  operating_hours?: string | null;
  entry_fee_detail?: string | null;
}

interface Props {
  clubs: ClubItem[];
  activeCountMap: Record<string, number>;
  hotdealMap?: Record<string, string>;
  selectedClubId: string | null;
  onCardClick: (clubId: string) => void;
  /** "상세 보기" 버튼 클릭 시 호출 — 시트로 클럽 상세 모달 띄움 */
  onDetailClick?: (clubId: string) => void;
  /** 시트가 차지하는 viewport 비율 (0~1) */
  onHeightChange?: (ratio: number) => void;
  /** 좌표 미등록으로 지도에 표시 못한 클럽 수 */
  unmappedCount?: number;
  /** 데스크탑 우측 클럽 상세 패널 열림 여부 — 시트 우측에 패널만큼 padding 부여 */
  detailPanelOpen?: boolean;
}

// 3단계 스냅 포인트 (viewport 높이 비율)
const SNAP_POINTS = {
  minimized: 0.13, // 헤더 + 첫 카드 일부만
  collapsed: 0.26, // 첫 카드(상세 보기까지) + 둘째 카드 첫 줄 살짝
  expanded: 0.78,  // 전체 리스트 보기
};

export type Snap = keyof typeof SNAP_POINTS;

export interface ClubMapSheetHandle {
  setSnap: (s: Snap) => void;
}

export const ClubMapSheet = forwardRef<ClubMapSheetHandle, Props>(function ClubMapSheet({
  clubs,
  activeCountMap,
  hotdealMap = {},
  selectedClubId,
  onCardClick,
  onDetailClick,
  onHeightChange,
  unmappedCount = 0,
  detailPanelOpen = false,
}, ref) {
  const [snap, setSnap] = useState<Snap>("collapsed");
  useImperativeHandle(ref, () => ({ setSnap }), []);
  const [dragOffset, setDragOffset] = useState(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartSnap = useRef<Snap>("collapsed");

  const listRef = useRef<HTMLDivElement | null>(null);

  const snapRatio = SNAP_POINTS[snap];

  useEffect(() => {
    onHeightChange?.(snapRatio);
  }, [snapRatio, onHeightChange]);

  // 선택된 카드로 자동 스크롤 — selectedClubId가 "새로 바뀔 때만".
  // snap(시트 높이) 변경 시엔 스크롤 위치 유지 (사용자가 스크롤한 위치 보존).
  useEffect(() => {
    if (!selectedClubId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-club-id="${selectedClubId}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedClubId]);

  // 드래그 핸들러
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartSnap.current = snap;
  }, [snap]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    setDragOffset(e.touches[0].clientY - dragStartY.current);
  }, []);

  const finishDrag = useCallback((dy: number) => {
    const vh = window.innerHeight;
    const currentRatio = SNAP_POINTS[dragStartSnap.current] - dy / vh;
    const entries = Object.entries(SNAP_POINTS) as [Snap, number][];
    let closest: Snap = "collapsed";
    let minDist = Infinity;
    for (const [key, val] of entries) {
      const dist = Math.abs(val - currentRatio);
      if (dist < minDist) {
        minDist = dist;
        closest = key;
      }
    }
    if (Math.abs(dy) > 100) {
      const order: Snap[] = ["minimized", "collapsed", "expanded"];
      const fromIdx = order.indexOf(dragStartSnap.current);
      const toIdx = dy < 0
        ? Math.min(order.length - 1, fromIdx + 1)
        : Math.max(0, fromIdx - 1);
      closest = order[toIdx];
    }
    setSnap(closest);
    setDragOffset(0);
    dragStartY.current = null;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current == null) return;
    finishDrag(dragOffset);
  }, [dragOffset, finishDrag]);

  // 마우스 드래그 (데스크톱)
  const mouseStartY = useRef<number | null>(null);
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartY.current = e.clientY;
    dragStartSnap.current = snap;
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (mouseStartY.current == null) return;
      setDragOffset(e.clientY - mouseStartY.current);
    };
    const onUp = () => {
      if (mouseStartY.current == null) return;
      finishDrag(dragOffset);
      mouseStartY.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragOffset, finishDrag]);

  const heightStyle = {
    height: `calc(${snapRatio * 100}vh - ${dragOffset}px)`,
    transition:
      dragStartY.current == null && mouseStartY.current == null
        ? "height 0.25s cubic-bezier(0.32, 0.72, 0, 1)"
        : "none",
  };

  return (
    <div
      ref={sheetRef}
      style={heightStyle}
      data-no-pull-refresh="strict"
      className={`absolute left-0 bottom-0 bg-[#1C1C1E] rounded-t-3xl shadow-2xl border-t border-neutral-800 z-20 flex flex-col transition-[right] duration-200 ${
        detailPanelOpen
          ? "right-0 md:right-[480px] lg:right-[560px]"
          : "right-0"
      }`}
    >
      {/* 드래그 핸들 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        className="flex-shrink-0 py-2.5 cursor-grab active:cursor-grabbing flex justify-center"
        style={{ touchAction: "none" }}
      >
        <div className="w-10 h-1 rounded-full bg-neutral-600" />
      </div>

      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 pb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[13px] text-neutral-400 font-bold flex-shrink-0">
            {clubs.length}곳
          </p>
          {unmappedCount > 0 && (
            <p className="text-[10px] text-neutral-600 truncate">
              좌표 미등록 {unmappedCount}곳 제외
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSnap(snap === "expanded" ? "collapsed" : "expanded")}
          className="text-[11px] text-neutral-500 font-medium flex-shrink-0"
        >
          {snap === "expanded" ? "지도 더보기" : "전체 보기"}
        </button>
      </div>

      <div
        ref={listRef}
        data-no-pull-refresh="strict"
        className="flex-1 overflow-y-auto"
        style={{ touchAction: "pan-y" }}
      >
        {clubs.length === 0 ? (
          <p className="text-center text-[12px] text-neutral-500 py-8">
            표시할 클럽이 없어요
          </p>
        ) : (
          <div className="divide-y divide-neutral-800">
            {clubs.map((c) => (
              <DetailCard
                key={c.id}
                club={c}
                flagCount={activeCountMap[c.id] || 0}
                hotdealText={hotdealMap[c.id]}
                isSelected={selectedClubId === c.id}
                onCardClick={onCardClick}
                onDetailClick={onDetailClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/** 카드 클릭 = 지도 panTo (탐색 흐름 유지). "상세 보기" = 시트 모달 (지도 안 끊김). */
function DetailCard({
  club,
  flagCount,
  hotdealText,
  isSelected,
  onCardClick,
  onDetailClick,
}: {
  club: ClubItem;
  flagCount: number;
  hotdealText?: string;
  isSelected: boolean;
  onCardClick: (clubId: string) => void;
  onDetailClick?: (clubId: string) => void;
}) {
  const opening = getOpeningStatus(club.operating_hours);

  // 카드 어디를 눌러도: 지도 panTo(위치 동기화) + 상세 모달 오픈
  const handleActivate = () => {
    onCardClick(club.id);
    if (onDetailClick) onDetailClick(club.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-club-id={club.id}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={`flex gap-3 items-center p-3 transition-colors cursor-pointer ${
        isSelected ? "bg-neutral-800/60" : "hover:bg-neutral-900/60"
      }`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0">
        {club.thumbnail_url ? (
          <Image
            src={club.thumbnail_url}
            alt={`${club.area ? `${club.area} ` : ""}${club.name} 클럽 사진`}
            fill
            sizes="80px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[24px] font-black text-white/30">
            {club.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
            <p className="text-white text-[15px] font-black truncate">
              {club.name}
            </p>
            <span className="text-[12px] font-medium text-neutral-500 flex-shrink-0">
              {club.area || "기타"}
            </span>
          </div>
          <span onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
            <FavoriteButton clubId={club.id} />
          </span>
        </div>

        {/* HOT DEAL 한 줄 (있을 때만) */}
        {hotdealText && (
          <div className="flex items-start gap-1.5 mt-1">
            <span className="text-[11px] leading-tight">🔥</span>
            <p className="text-amber-300 text-[12px] font-bold leading-snug line-clamp-2">
              {hotdealText}
            </p>
          </div>
        )}

        {/* Line 2: 영업 상태 */}
        <div className="flex items-center gap-1.5 text-[12px] font-medium">
          {opening === "open" ? (
            <span className="inline-flex items-center gap-1 text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              영업중
            </span>
          ) : opening === "closed" ? (
            <span className="inline-flex items-center gap-1 text-neutral-500">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              영업종료
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-neutral-600">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
              영업시간 준비중
            </span>
          )}
        </div>

        {/* Line 4: 깃발 (있을 때만) */}
        {flagCount > 0 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              <Flag className="w-3 h-3" />
              깃발 {flagCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
