"use client";

// 제안서(주류 제안 요청)에서 파트너가 구성을 적다가 "메뉴판 보기"로 여는 주대 사진 전체화면.
// DrinkMenuViewer 라이트박스와 같은 모양·제스처(핀치/더블탭 줌, 1배일 때 좌우 스와이프)를
// 쓴다 — 확대 이미지는 그쪽 LightboxImage를 그대로 가져온다(2026-09-30).

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { LightboxImage } from "@/components/clubs/DrinkMenuViewer";

export function MenuPhotosOverlay({
  urls,
  clubName,
  onClose,
}: {
  urls: string[];
  clubName: string | null;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const hasMultiple = urls.length > 1;

  // ESC + 좌우 키 + body 스크롤 잠금 — DrinkMenuViewer 라이트박스와 같다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(urls.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, urls.length]);

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center overscroll-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${clubName ?? "클럽"} 메뉴판`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="닫기"
        className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm hover:bg-muted text-foreground"
      >
        <X className="w-5 h-5" strokeWidth={2.5} />
      </button>

      {hasMultiple && idx > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIdx((i) => Math.max(0, i - 1));
          }}
          aria-label="이전 사진"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm hover:bg-muted text-foreground"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasMultiple && idx < urls.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIdx((i) => Math.min(urls.length - 1, i + 1));
          }}
          aria-label="다음 사진"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm hover:bg-muted text-foreground"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      {hasMultiple && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-4 z-30 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm text-foreground text-[12px] font-bold">
          {idx + 1} / {urls.length}
        </div>
      )}

      <div
        className="relative z-0 w-full h-full max-w-5xl flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <LightboxImage
          key={idx}
          src={urls[idx]}
          alt={`${clubName ?? "클럽"} 메뉴판 ${idx + 1}`}
          onSwipePrev={idx > 0 ? () => setIdx((i) => Math.max(0, i - 1)) : undefined}
          onSwipeNext={idx < urls.length - 1 ? () => setIdx((i) => Math.min(urls.length - 1, i + 1)) : undefined}
        />
      </div>
    </div>
  );
}
