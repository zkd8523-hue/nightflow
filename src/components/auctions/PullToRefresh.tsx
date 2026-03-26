"use client";

import { useRef, useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const documentRef = useRef<Document | null>(null);
  const startYRef = useRef(0);

  const THRESHOLD = 80; // 새로고침 트리거 거리

  // 브라우저 네이티브 pull-to-refresh 충돌 방지
  useEffect(() => {
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.documentElement.style.overscrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    // 클라이언트 환경에서만 실행
    if (typeof document === "undefined") return;
    documentRef.current = document;

    let currentTouchId: number | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      // 페이지 최상단에서만 활성화
      if (window.scrollY === 0 && e.touches.length > 0) {
        startYRef.current = e.touches[0].clientY;
        currentTouchId = e.touches[0].identifier;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (
        window.scrollY !== 0 ||
        isRefreshing ||
        currentTouchId === null ||
        e.touches.length === 0
      ) {
        return;
      }

      // 같은 터치 포인트 확인
      const touch = Array.from(e.touches).find(
        (t) => t.identifier === currentTouchId
      );
      if (!touch) return;

      const distance = touch.clientY - startYRef.current;

      if (distance > 0) {
        e.preventDefault();
        setPullDistance(Math.min(distance, THRESHOLD * 1.5));
      }
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      if (pullDistance >= THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      setPullDistance(0);
      currentTouchId = null;
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, onRefresh]);

  const refreshProgress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div className="relative">
      {/* 풀 투 리프레시 인디케이터 */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center gap-2 text-neutral-400 transition-all z-[60]"
          style={{
            height: `${pullDistance}px`,
            opacity: Math.min(pullDistance / THRESHOLD, 1),
            background: "rgba(26, 26, 26, 0.95)",
          }}
        >
          <RefreshCw
            size={16}
            className={`transition-transform ${
              isRefreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: `rotate(${refreshProgress * 180}deg)`,
            }}
          />
          <span className="text-xs font-medium">
            {isRefreshing
              ? "새로고침 중..."
              : pullDistance >= THRESHOLD
                ? "손을 놓아 새로고침"
                : "위로 당겨 새로고침"}
          </span>
        </div>
      )}

      {/* 콘텐츠 */}
      <div style={{ marginTop: `${pullDistance * 0.5}px` }}>{children}</div>
    </div>
  );
}
