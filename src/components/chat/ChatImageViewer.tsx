"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ChatMediaItem } from "@/types/database";

interface Props {
  items: ChatMediaItem[];
  index: number;
  onClose: () => void;
}

/**
 * 채팅 이미지/영상 전체보기 — 인앱 뷰어.
 * 예전엔 <a target="_blank">라 앱에서 외부 브라우저가 떠버렸다.
 * 여기서 열고 닫으므로 대화 맥락을 잃지 않는다.
 */
export function ChatImageViewer({ items, index, onClose }: Props) {
  const [i, setI] = useState(index);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 열려 있는 동안 뒤 스크롤 잠금 + ESC/좌우 키
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      if (e.key === "ArrowRight") setI((v) => Math.min(items.length - 1, v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [items.length, onClose]);

  if (!mounted) return null;
  const item = items[i];
  if (!item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-black flex flex-col"
      onClick={onClose}
      role="dialog"
    >
      {/* 상단 바 */}
      <div
        className="flex items-center justify-between px-3 py-3 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
        {items.length > 1 && (
          <span className="text-[13px] font-bold text-white/70">
            {i + 1} / {items.length}
          </span>
        )}
        <span className="w-9" aria-hidden="true" />
      </div>

      {/* 본체 — 원본 비율 유지 */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2">
        {item.type === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={item.url}
            className="max-w-full max-h-full"
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* 여러 장이면 좌우 이동 */}
      {items.length > 1 && (
        <div
          className="flex items-center justify-center gap-6 py-4 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            aria-label="이전"
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setI((v) => Math.min(items.length - 1, v + 1))}
            disabled={i === items.length - 1}
            aria-label="다음"
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
