"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Trash2, MapPin } from "lucide-react";
import { uploadImage } from "@/lib/utils/upload";

interface FloorPlanEditorProps {
  targetId: string;
  targetType: "club" | "user";
  initialFloorPlanUrl: string | null;
  onSave?: (floorPlanUrl: string | null) => void | Promise<void>;
}

export function FloorPlanEditor({
  targetId,
  targetType,
  initialFloorPlanUrl,
  onSave,
}: FloorPlanEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(initialFloorPlanUrl);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadImage(file, `floor-plans/${targetType}/${targetId}`, {
        maxWidth: 2048, // 플로어맵은 더 큰 해상도 유지
      });

      if (publicUrl) {
        await onSave?.(publicUrl);
        setFloorPlanUrl(publicUrl);
        toast.success("플로어맵이 업로드되었습니다.");
      }
    } catch {
      // onSave에서 이미 toast.error 처리됨
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFloorPlan = () => {
    setFloorPlanUrl(null);
    onSave?.(null);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-white font-bold mb-2">
        <MapPin className="w-4 h-4 text-amber-500" />
        <span>플로어맵</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {!floorPlanUrl ? (
        <div className="bg-[#1C1C1E] border border-dashed border-neutral-700 rounded-2xl p-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center gap-3 py-4 hover:opacity-80 transition-opacity"
          >
            {uploading ? (
              <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <Upload className="w-6 h-6 text-amber-500" />
              </div>
            )}
            <div className="text-center">
              <p className="text-sm text-white font-bold">
                {uploading ? "업로드 중..." : "플로어맵 이미지 업로드"}
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                클럽 평면도를 업로드해주세요
              </p>
              <p className="text-[10px] text-neutral-600 mt-0.5">
                5MB 이하 · JPG, PNG
              </p>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border-2 border-neutral-800">
            <img
              src={floorPlanUrl}
              alt="클럽 플로어맵"
              className="w-full h-auto block select-none pointer-events-none"
              draggable={false}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#1C1C1E] text-neutral-400 border border-neutral-800 hover:border-neutral-600 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              이미지 변경
            </button>

            <button
              type="button"
              onClick={removeFloorPlan}
              className="h-9 px-4 rounded-lg text-xs font-bold bg-[#1C1C1E] text-red-400 border border-neutral-800 hover:border-red-500/50 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              삭제
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
