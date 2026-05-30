"use client";

import { useState, useEffect } from "react";
import { X, ZoomIn } from "lucide-react";
import type { TablePosition, TableType } from "@/types/database";

interface FloorPlanViewerProps {
  floorPlanUrl: string;
  positions: TablePosition[];
  highlightLabel: string | null;
}

function getViewerMarkerStyle(type: TableType, isHighlighted: boolean) {
  if (isHighlighted) {
    return "bg-amber-500 border-amber-300 text-black shadow-amber-500/40 shadow-lg";
  }
  // 비선택 마커를 타입 무관하게 매우 희미하게 (비교 심리 방지)
  return "bg-white/5 border-white/8 text-white/15";
}

export function FloorPlanViewer({
  floorPlanUrl,
  positions,
  highlightLabel,
}: FloorPlanViewerProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isZoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsZoomed(false);
    };
    document.addEventListener("keydown", onKey);
    // 모달 열릴 때 배경 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isZoomed]);

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setIsZoomed(true)}
          aria-label="테이블 위치 크게 보기"
          className="relative rounded-xl overflow-hidden border border-neutral-800 group block w-full cursor-zoom-in"
        >
          <img
            src={floorPlanUrl}
            alt="클럽 플로어맵"
            className="w-full h-auto block select-none"
            draggable={false}
          />

          {positions.map((marker) => {
            const isHighlighted = highlightLabel === marker.label;
            return (
              <div
                key={marker.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${isHighlighted ? "z-20" : "z-10"}`}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              >
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border-2 transition-all ${getViewerMarkerStyle(marker.type, isHighlighted)}`}
                >
                  <span className="text-[10px] font-black leading-none">
                    {marker.label}
                  </span>
                </div>
                {isHighlighted && (
                  <div className="absolute inset-0 -m-1 rounded-full border-2 border-amber-400/60 animate-pulse pointer-events-none" />
                )}
              </div>
            );
          })}

          {/* 확대 힌트 배지 */}
          <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-full opacity-90 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="w-3 h-3 text-white" />
            <span className="text-[10px] font-bold text-white">크게 보기</span>
          </div>
        </button>

        {highlightLabel && (
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs text-amber-400 font-bold">
              {highlightLabel}
            </span>
            <span className="text-[10px] text-neutral-500">테이블 위치</span>
          </div>
        )}
      </div>

      {/* 확대 모달 */}
      {isZoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="테이블 위치 확대 보기"
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ touchAction: "pinch-zoom" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(false);
            }}
            aria-label="닫기"
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          <div
            className="relative max-w-full max-h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: "pinch-zoom" }}
          >
            <img
              src={floorPlanUrl}
              alt="클럽 플로어맵 확대"
              className="block max-w-none w-auto h-auto"
              style={{ maxHeight: "85vh" }}
              draggable={false}
            />

            {positions.map((marker) => {
              const isHighlighted = highlightLabel === marker.label;
              return (
                <div
                  key={marker.id}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${isHighlighted ? "z-20" : "z-10"}`}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                >
                  <div
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border-2 ${getViewerMarkerStyle(marker.type, isHighlighted)}`}
                  >
                    <span className="text-xs font-black leading-none">
                      {marker.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {highlightLabel && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm text-amber-400 font-bold">
                {highlightLabel}
              </span>
              <span className="text-xs text-neutral-400">테이블 위치</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
