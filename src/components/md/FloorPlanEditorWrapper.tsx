"use client";

import { useState } from "react";
import { FloorPlanEditor } from "./FloorPlanEditor";
import { Clock } from "lucide-react";

interface FloorPlanEditorWrapperProps {
  userId: string;
  initialFloorPlanUrl: string | null;
  onSave: (floorPlanUrl: string | null) => void;
}

export function FloorPlanEditorWrapper({
  userId,
  initialFloorPlanUrl,
  onSave,
}: FloorPlanEditorWrapperProps) {
  const [skipped, setSkipped] = useState(false);

  if (skipped) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <span>플로어맵 등록 (선택)</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 flex flex-col items-center gap-3">
          <p className="text-sm text-neutral-400 text-center">
            플로어맵 등록을 건너뛰었습니다.
          </p>
          <p className="text-[11px] text-amber-500/70 text-center">
            플로어맵이 있는 경매는 입찰률이 더 높아요!
          </p>
          <p className="text-[11px] text-neutral-600 text-center">
            승인 후 MD 대시보드에서 언제든 등록할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setSkipped(false)}
            className="text-xs text-amber-500 font-bold hover:text-amber-400 transition-colors mt-1"
          >
            지금 등록하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-white font-bold">
          <span>플로어맵 등록 (선택)</span>
        </div>
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs font-bold transition-all"
        >
          <Clock className="w-3.5 h-3.5" />
          나중에 하기
        </button>
      </div>
      <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3 space-y-1">
        <p className="text-[11px] text-neutral-400 font-bold">선택 등록 안내</p>
        <p className="text-[10px] text-neutral-500">• 클럽 플로어맵 이미지를 업로드해주세요</p>
        <p className="text-[10px] text-neutral-500">• 테이블 위치를 배치하면 경매 시 표시됩니다</p>
        <p className="text-[10px] text-neutral-500">• 승인 후 대시보드에서 수정 가능합니다</p>
      </div>
      <FloorPlanEditor
        targetId={userId}
        targetType="user"
        initialFloorPlanUrl={initialFloorPlanUrl}
        onSave={onSave}
      />
    </div>
  );
}
