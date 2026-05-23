"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flag, Wine } from "lucide-react";
import { getTagsByGroup } from "@/lib/clubs/tags";
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
  selectedClubId: string | null;
  onCardClick: (clubId: string) => void;
  /** 시트가 차지하는 viewport 비율 (0~1) */
  onHeightChange?: (ratio: number) => void;
}

// 2단계 스냅 포인트 (viewport 높이 비율)
const SNAP_POINTS = {
  collapsed: 0.38, // 큰 카드 1개 정확히 보임 (여기어때 패턴)
  expanded: 0.78,  // 전체 리스트 보기
};

type Snap = keyof typeof SNAP_POINTS;

export function ClubMapSheet({
  clubs,
  activeCountMap,
  selectedClubId,
  onCardClick,
  onHeightChange,
}: Props) {
  const [snap, setSnap] = useState<Snap>("collapsed");
  const [dragOffset, setDragOffset] = useState(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartSnap = useRef<Snap>("collapsed");

  const listRef = useRef<HTMLDivElement | null>(null);

  const snapRatio = SNAP_POINTS[snap];

  useEffect(() => {
    onHeightChange?.(snapRatio);
  }, [snapRatio, onHeightChange]);

  // 선택된 카드로 자동 스크롤
  useEffect(() => {
    if (!selectedClubId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-club-id="${selectedClubId}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedClubId, snap]);

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
    if (Math.abs(dy) > 80) {
      closest = dy < 0 ? "expanded" : "collapsed";
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
      className="absolute left-0 right-0 bottom-0 bg-[#1C1C1E] rounded-t-3xl shadow-2xl border-t border-neutral-800 z-20 flex flex-col"
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
        <p className="text-[13px] text-neutral-400 font-bold">
          {clubs.length}곳
        </p>
        <button
          type="button"
          onClick={() => setSnap(snap === "expanded" ? "collapsed" : "expanded")}
          className="text-[11px] text-neutral-500 font-medium"
        >
          {snap === "expanded" ? "축소" : "전체 보기"}
        </button>
      </div>

      <div
        ref={listRef}
        data-no-pull-refresh
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
                isSelected={selectedClubId === c.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 카드 전체가 상세 페이지 링크. 한 카드에 정보 압축. 구분선은 divide-y로 부모에서. */
function DetailCard({
  club,
  flagCount,
  isSelected,
}: {
  club: ClubItem;
  flagCount: number;
  isSelected: boolean;
}) {
  const genres = getTagsByGroup(club.tags || [], "genre");
  const genreLine = genres.slice(0, 2).map((g) => `#${g.label}`).join(" ");
  const opening = getOpeningStatus(club.operating_hours);

  return (
    <Link
      href={`/clubs/${club.id}`}
      data-club-id={club.id}
      className={`flex gap-3 items-start p-3 transition-colors ${
        isSelected ? "bg-neutral-800/60" : "hover:bg-neutral-900/60"
      }`}
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0">
        {club.thumbnail_url ? (
          <Image
            src={club.thumbnail_url}
            alt={club.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[24px] font-black text-white/30">
            {club.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-white text-[15px] font-black truncate">
          {club.name}
        </p>

        {/* Line 2: 영업 상태 · 지역 */}
        <div className="flex items-center gap-1.5 text-[12px] font-medium">
          {opening === "open" && (
            <span className="inline-flex items-center gap-1 text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              영업중
            </span>
          )}
          {opening === "closed" && (
            <span className="inline-flex items-center gap-1 text-neutral-500">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              영업종료
            </span>
          )}
          {opening !== "unknown" && <span className="text-neutral-700">·</span>}
          <span className="text-neutral-500 truncate">{club.area || "기타"}</span>
        </div>

        {/* Line 3: 장르 · 입장료 */}
        {(genreLine || club.entry_fee_detail) && (
          <p className="text-neutral-400 text-[11px] font-medium truncate">
            {genreLine}
            {genreLine && club.entry_fee_detail && (
              <span className="text-neutral-700 mx-1.5">·</span>
            )}
            {club.entry_fee_detail && (
              <span className="text-neutral-300">{club.entry_fee_detail}</span>
            )}
          </p>
        )}

        {/* Line 4: 깃발 · 주대표 */}
        {(flagCount > 0 || club.drink_menu_url) && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {flagCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                <Flag className="w-3 h-3" />
                깃발 {flagCount}
              </span>
            )}
            {club.drink_menu_url && (
              <span className="inline-flex items-center gap-1 bg-neutral-800 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                <Wine className="w-3 h-3" />
                주대표
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
