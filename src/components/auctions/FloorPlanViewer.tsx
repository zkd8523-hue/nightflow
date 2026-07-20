"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { TablePosition, TableType } from "@/types/database";

interface FloorPlanViewerProps {
  floorPlanUrl: string;
  positions: TablePosition[];
  highlightLabel: string | null;
  showImage?: boolean;
}

function getViewerMarkerStyle(type: TableType, isHighlighted: boolean) {
  if (isHighlighted) {
    return "bg-amber-500 border-amber-300 text-black shadow-amber-500/40 shadow-lg";
  }
  // 비선택 마커를 타입 무관하게 매우 희미하게 (비교 심리 방지)
  return "bg-white/5 border-white/8 text-foreground/15";
}

export function FloorPlanViewer({
  floorPlanUrl,
  positions,
  highlightLabel,
  showImage = true,
}: FloorPlanViewerProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal SSR 가드
  useEffect(() => { setMounted(true); }, []);

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
        {showImage && (
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            aria-label="테이블 위치 크게 보기"
            className="relative rounded-xl overflow-hidden border border-border group block w-full cursor-zoom-in"
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
              <ZoomIn className="w-3 h-3 text-foreground" />
              <span className="text-[10px] font-bold text-foreground">크게 보기</span>
            </div>
          </button>
        )}

        {highlightLabel && (
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-brand-amber font-bold">
              {highlightLabel}
            </span>
          </div>
        )}
      </div>

      {/* 확대 모달 — Portal로 body 직속 렌더 (부모 transform/stacking 무시) */}
      {isZoomed && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="테이블 위치 확대 보기"
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center animate-in fade-in duration-150"
        >
          <div
            className="relative w-full h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={5}
              doubleClick={{ step: 1 }}
              pinch={{ step: 5 }}
              wheel={{ step: 0.2 }}
              panning={{ disabled: false }}
              centerOnInit
            >
              <TransformComponent
                wrapperClass="!w-full !h-full"
                contentClass="!w-full !h-full flex items-center justify-center"
              >
                <div className="relative">
                  <img
                    src={floorPlanUrl}
                    alt="클럽 플로어맵 확대"
                    className="block object-contain"
                    style={{ maxWidth: "100vw", maxHeight: "85vh" }}
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
              </TransformComponent>
            </TransformWrapper>
          </div>

          {/* 닫기 버튼 — 컨테이너 다음 형제로 두어 항상 위에 노출 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(false);
            }}
            aria-label="닫기"
            className="fixed top-4 right-4 z-[130] w-10 h-10 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>

          {highlightLabel && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-2 bg-black/80 backdrop-blur-sm px-4 py-2 rounded-full pointer-events-none shadow-lg">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm text-brand-amber font-bold">
                {highlightLabel}
              </span>
              <span className="text-xs text-muted-foreground">테이블 위치</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
