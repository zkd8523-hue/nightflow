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
        <div className="flex items-center gap-2 text-foreground font-bold mb-2">
          <span>플로어맵 등록 (선택)</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            플로어맵 등록을 건너뛰었습니다.
          </p>
          <p className="text-[11px] text-brand-amber dark:text-brand-amber/70 text-center">
            플로어맵이 있는 경매는 입찰률이 더 높아요!
          </p>
          <p className="text-[11px] text-muted-foreground text-center">
            승인 후 파트너 대시보드에서 언제든 등록할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setSkipped(false)}
            className="text-xs text-brand-amber font-bold hover:text-brand-amber transition-colors mt-1"
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
        <div className="flex items-center gap-2 text-foreground font-bold">
          <span>플로어맵 등록 (선택)</span>
        </div>
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-all"
        >
          <Clock className="w-3.5 h-3.5" />
          나중에 하기
        </button>
      </div>
      <div className="bg-muted/50 border border-border/50 rounded-lg p-3 space-y-1">
        <p className="text-[11px] text-muted-foreground font-bold">선택 등록 안내</p>
        <p className="text-[10px] text-muted-foreground">• 클럽 플로어맵 이미지를 업로드해주세요</p>
        <p className="text-[10px] text-muted-foreground">• 테이블 위치를 배치하면 경매 시 표시됩니다</p>
        <p className="text-[10px] text-muted-foreground">• 승인 후 대시보드에서 수정 가능합니다</p>
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
