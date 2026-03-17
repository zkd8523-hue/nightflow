"use client";

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
  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-neutral-800">
        <img
          src={floorPlanUrl}
          alt="클럽 플로어맵"
          className="w-full h-auto block select-none pointer-events-none"
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
      </div>

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
  );
}
