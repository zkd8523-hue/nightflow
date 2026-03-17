"use client";

import { useState } from "react";
import type { TablePosition, TableType } from "@/types/database";
import { MapPin } from "lucide-react";

interface FloorPlanSelectorProps {
  floorPlanUrl: string;
  positions: TablePosition[];
  selectedLabel: string | null;
  onSelect: (label: string, type: TableType) => void;
}

function getMarkerStyle(type: TableType, isSelected: boolean) {
  if (isSelected) {
    return "bg-amber-500 border-amber-300 text-black scale-125 shadow-amber-500/50 shadow-lg";
  }
  switch (type) {
    case "VIP":
      return "bg-purple-500/40 border-purple-500/60 text-purple-300";
    case "Premium":
      return "bg-amber-500/30 border-amber-500/50 text-amber-400/70";
    default:
      return "bg-white/20 border-white/30 text-white/60";
  }
}

export function FloorPlanSelector({
  floorPlanUrl,
  positions,
  selectedLabel,
  onSelect,
}: FloorPlanSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
        <p className="text-[11px] text-amber-400 font-bold">
          테이블을 터치하여 선택하세요
        </p>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-neutral-800">
        <img
          src={floorPlanUrl}
          alt="클럽 플로어맵"
          className="w-full h-auto block select-none pointer-events-none"
          draggable={false}
        />

        {positions.map((marker) => {
          const isSelected = selectedLabel === marker.label;

          return (
            <button
              key={marker.id}
              type="button"
              className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center ${isSelected ? "z-20" : "z-10"}`}
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              onClick={() => onSelect(marker.label, marker.type)}
            >
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full border-2 cursor-pointer transition-all duration-200 ${getMarkerStyle(marker.type, isSelected)}`}
              >
                <span className="text-[10px] font-black leading-none">
                  {marker.label}
                </span>
              </div>
              {isSelected && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {selectedLabel && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <MapPin className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-amber-400 font-bold">
            선택: {selectedLabel}
          </span>
        </div>
      )}
    </div>
  );
}
