"use client";

import { useRef, useState } from "react";

const ENGAGE_PX = 8; // 이만큼 가로로 움직이면 스와이프 시작 (시간 조건 없음)
const TRIGGER_PX = 48; // 이만큼 밀고 놓으면 답글
const MAX_PX = 80; // 고무줄 한계

/**
 * 밀어서 답글 (인스타 DM식) — 와글/LIVE·조각 단체방 공용.
 *
 * 시간 개념 없음: 손대자마자 가로로 8px만 움직이면 따라온다.
 * - 포인터 캡처 필수. 없으면 손가락이 짧은 말풍선 밖으로 나가는 순간
 *   move/up이 끊겨 스와이프가 아예 성립하지 않는다.
 * - touch-action: pan-y 로 세로 스크롤은 브라우저에 넘긴다.
 */
export function useSwipeToReply(opts: {
  isMine: boolean;
  onReply: () => void;
  /** 길게누름 등 다른 제스처 취소 (손가락이 조금이라도 움직이면 호출) */
  onMoveCancel?: () => void;
}) {
  const { isMine, onReply, onMoveCancel } = opts;
  const [dragX, setDragX] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipingRef = useRef(false);
  const movedRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 캡처 불가 환경(일부 데스크톱 브라우저)에서도 기본 동작은 유지
    }
    startRef.current = { x: e.clientX, y: e.clientY };
    swipingRef.current = false;
    movedRef.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = startRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!movedRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      movedRef.current = true;
      onMoveCancel?.(); // 움직이면 길게누름 포기 → "꾹 눌러야 되는" 느낌 제거
    }
    if (!swipingRef.current) {
      if (Math.abs(dx) < ENGAGE_PX || Math.abs(dx) <= Math.abs(dy)) return;
      swipingRef.current = true;
    }
    // 말풍선 반대 방향으로만 (내 글은 왼쪽, 상대 글은 오른쪽)
    const raw = isMine ? Math.min(0, dx) : Math.max(0, dx);
    setDragX(Math.sign(raw) * Math.min(MAX_PX, Math.abs(raw)));
  }

  function finish() {
    const triggered = Math.abs(dragX) >= TRIGGER_PX;
    startRef.current = null;
    swipingRef.current = false;
    setDragX(0);
    if (triggered) onReply();
    return triggered;
  }

  return {
    dragX,
    /** 스와이프 중인지 — 뒤따르는 탭(더블탭 좋아요 등) 무시용 */
    isSwiping: () => swipingRef.current,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onPointerLeave: () => {
        // 캡처 중이면 밖으로 나가도 계속 (up에서 마무리)
        if (!swipingRef.current) finish();
      },
    },
    style: {
      transform: dragX ? `translateX(${dragX}px)` : undefined,
      transition: swipingRef.current ? "none" : "transform 160ms ease-out",
      touchAction: "pan-y" as const,
    },
  };
}
