"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Zap, RotateCcw } from "lucide-react";

interface Props {
  open: boolean;
  file: File;
  previewUrl: string;
  /** 클럽 지정 시 표시(스탬프 안내) */
  clubName?: string | null;
  uploading?: boolean;
  onClose: () => void;
  onRetake: () => void;
  onPost: (caption: string) => void;
}

/**
 * 촬영 결과 풀스크린 편집 화면 (인스타 스토리식).
 * - 미디어 풀스크린 미리보기
 * - 하단 캡션 오버레이 입력
 * - 우측 상단 X(닫기)
 * - 하단 [다시 촬영] [게시하기]
 */
export function LiveEditView({
  open,
  file,
  previewUrl,
  clubName,
  uploading = false,
  onClose,
  onRetake,
  onPost,
}: Props) {
  const [caption, setCaption] = useState("");

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isImage = file.type.startsWith("image/");

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black flex flex-col">
      {/* 미디어 풀스크린 */}
      <div className="absolute inset-0">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="미리보기"
            className="w-full h-full object-contain"
          />
        ) : (
          <video
            src={previewUrl}
            className="w-full h-full object-contain"
            autoPlay
            loop
            muted
            playsInline
          />
        )}
      </div>

      {/* 상단: 닫기 + 클럽 배지 */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>
        {clubName && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/90 text-white text-[12px] font-black">
            <Zap className="w-3 h-3 fill-white" />
            📍 {clubName}
          </span>
        )}
      </div>

      {/* 하단: 캡션 + 액션 (그라데이션 위) */}
      <div className="relative z-10 mt-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-6 px-4 space-y-3">
        {/* 캡션 입력 */}
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="캡션을 추가해보세요..."
          maxLength={200}
          enterKeyHint="done"
          className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-3 text-white text-[15px] placeholder:text-white/50 focus:outline-none focus:border-white/40"
        />

        {/* 액션 버튼 — 게시하기(주요, 좌) + 다시 촬영(우) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPost(caption)}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full bg-white text-black text-[15px] font-black active:scale-95 transition-transform disabled:opacity-70"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                올리는 중...
              </>
            ) : (
              <>게시하기</>
            )}
          </button>
          <button
            type="button"
            onClick={onRetake}
            disabled={uploading}
            className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-white/15 backdrop-blur text-white text-[14px] font-bold active:scale-95 transition-transform disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            다시 촬영
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
