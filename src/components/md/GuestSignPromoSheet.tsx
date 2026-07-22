"use client";

import { X } from "lucide-react";

interface GuestSignPromoSheetProps {
  onClose: () => void;
  onSnooze: () => void;
  onOpenGuestSign: () => void;
}

/**
 * 파트너 접속 시, 소속 클럽의 이번 주 게스트 간판이 비어있으면 노출하는 참여 유도 팝업.
 * 화면 중앙 모달(다이얼로그) 형태.
 * X(닫기): 이번 세션만 안 보이고 다음 접속 때 다시 뜸.
 * "1주일간 보지않기": localStorage에 만료 시각을 저장해 7일간 재노출 안 함.
 */
export function GuestSignPromoSheet({ onClose, onSnooze, onOpenGuestSign }: GuestSignPromoSheetProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-3xl bg-card border border-border p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-end">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0 -mr-2 -mt-2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="text-center space-y-2 -mt-4">
          <p className="text-2xl font-black text-brand-amber leading-snug">
            게스트 간판 OPEN 🎉
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            &quot;오늘 어디갈래?&quot; 홈 화면 상단에 노출되어
            <br />
            방문자가 인스타, 오픈채팅으로 연락할 수 있어요.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onOpenGuestSign}
            className="w-full rounded-full bg-inverse text-inverse-foreground font-bold text-[13px] py-2.5"
          >
            둘러보기
          </button>
          <button
            onClick={onSnooze}
            className="w-full text-[12px] text-muted-foreground hover:text-foreground font-bold py-1"
          >
            1주일간 보지않기
          </button>
        </div>
      </div>
    </div>
  );
}
