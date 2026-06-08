"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";

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
        role="dialog"
        aria-modal="true"
        aria-label="클럽 상세"
      >
        <div
          className="relative w-full h-[92vh] bg-[#0A0A0A] overflow-hidden rounded-t-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <SheetHeader clubId={clubId} onClose={onClose} />
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
        {/* 패널 외부 좌측 floating 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="fixed top-20 right-[calc(min(480px,100vw)+16px)] lg:right-[calc(min(560px,100vw)+16px)] z-[201] w-10 h-10 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md text-white hover:bg-black/90 shadow-lg"
        >
          <X className="w-5 h-5" />
        </button>
        {/* 우측 사이드 패널 — 검색바 영역(상단 ~64px) 아래에서 시작 */}
        <aside
          className="fixed top-16 right-0 h-[calc(100vh-4rem)] w-full max-w-[480px] lg:max-w-[560px] z-[200] bg-[#0A0A0A] border-l border-t border-neutral-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 rounded-tl-2xl overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="클럽 상세"
        >
          <SheetHeader clubId={clubId} onClose={onClose} />
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

function SheetHeader({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-900 bg-[#0A0A0A] flex-shrink-0">
      <span className="ml-1 text-[12px] font-bold text-neutral-400">클럽 상세</span>
      <div className="flex items-center gap-1">
        <Link
          href={`/clubs/${clubId}`}
          onClick={(e) => e.stopPropagation()}
          aria-label="새 페이지로 열기"
          className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-400 px-2 py-1 rounded-full hover:bg-neutral-900"
        >
          새 페이지로 열기
          <ExternalLink className="w-3 h-3" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
