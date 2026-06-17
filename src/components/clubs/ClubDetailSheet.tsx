"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

interface Props {
  clubId: string | null;
  onClose: () => void;
}

/**
 * 지도 탐색 흐름을 끊지 않기 위해 클럽 상세를 시트(iframe)로 띄운다.
 * - 기존 /clubs/{id} 페이지를 그대로 임베드 → SSR/SEO/JSON-LD 전부 재활용
 * - 닫으면 지도 그대로 → 다른 핀 비교 쉬움
 * - 공유/SEO용 외부 링크 버튼 별도 제공
 */
export function ClubDetailSheet({ clubId, onClose }: Props) {
  const open = !!clubId;

  // 모바일 바텀시트 아래로 드래그 → 닫기
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef(0);
  const draggingRef = useRef(false);

  const onDragStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
    draggingRef.current = true;
  };
  const onDragMove = (e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    // 아래로만 끌림
    setDragY(dy > 0 ? dy : 0);
  };
  const onDragEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // 120px 이상 끌면 닫기, 아니면 원위치
    if (dragY > 120) {
      onClose();
    }
    setDragY(0);
  };

  // 배경 스크롤 잠금: 모바일 풀스크린 모드에서만 (데스크탑은 지도 인터랙션 유지)
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return; // 데스크탑은 잠금 X
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !clubId) return null;

  return (
    <>
      {/* 모바일: 풀스크린 바텀시트 (md 미만). z-[200]으로 검색바 위. */}
      <div
        className="md:hidden fixed inset-0 z-[200] flex items-end bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        data-no-pull-refresh="strict"
        role="dialog"
        aria-modal="true"
        aria-label="클럽 상세"
      >
        <div
          className="relative w-full h-[92vh] bg-[#0A0A0A] overflow-hidden rounded-t-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translateY(${dragY}px)`,
            transition: draggingRef.current ? "none" : "transform 0.2s ease-out",
          }}
        >
          {/* 드래그 핸들 — 이 영역을 아래로 끌면 닫힘 */}
          <div
            className="flex-shrink-0 flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            onTouchCancel={onDragEnd}
          >
            <div className="w-10 h-1 rounded-full bg-neutral-700" />
          </div>
          {/* 클럽 이미지 좌상단 floating 뒤로가기 */}
          <BackButton onClose={onClose} />
          <iframe
            src={`/clubs/${clubId}?embedded=1`}
            title="클럽 상세"
            className="flex-1 w-full border-0 bg-[#0A0A0A]"
          />
        </div>
      </div>

      {/* 데스크탑(md+): 오른쪽 사이드 패널 (지도와 동시 인터랙션 가능).
          backdrop 없음 → 좌측 지도 영역 클릭/드래그/스크롤이 그대로 전달됨.
          z-[200]으로 ClubList 검색바(z-30)보다 위. */}
      <div className="hidden md:block">
        {/* 우측 사이드 패널 — 전체 높이를 덮어 검색바가 패널 위로 겹치지 않게 */}
        <aside
          className="fixed top-0 right-0 h-screen w-full max-w-[480px] lg:max-w-[560px] z-[200] bg-[#0A0A0A] border-l border-neutral-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="클럽 상세"
        >
          {/* 클럽 이미지 좌상단 floating 뒤로가기 */}
          <BackButton onClose={onClose} />
          <iframe
            src={`/clubs/${clubId}?embedded=1`}
            title="클럽 상세"
            className="flex-1 w-full border-0 bg-[#0A0A0A]"
          />
        </aside>
      </div>
    </>
  );
}

/** 클럽 이미지 좌상단에 떠 있는 뒤로가기 버튼 */
function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="뒤로가기"
      className="absolute top-3 left-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 active:scale-95 transition"
    >
      <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
    </button>
  );
}
