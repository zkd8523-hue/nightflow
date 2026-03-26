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
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const touchActiveRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  const THRESHOLD = 80;

  // Keep refs in sync
  useEffect(() => { pullDistanceRef.current = pullDistance; }, [pullDistance]);
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  // 브라우저 네이티브 pull-to-refresh 충돌 방지
  useEffect(() => {
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.documentElement.style.overscrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      // 스크롤이 최상단일 때만 활성화 (소수점 오차 허용)
      if (window.scrollY <= 1 && e.touches.length > 0) {
        startYRef.current = e.touches[0].clientY;
        touchActiveRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchActiveRef.current || isRefreshingRef.current) return;
      if (window.scrollY > 1) {
        touchActiveRef.current = false;
        setPullDistance(0);
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const distance = touch.clientY - startYRef.current;

      if (distance > 0) {
        e.preventDefault();
        const clamped = Math.min(distance, THRESHOLD * 1.5);
        pullDistanceRef.current = clamped;
        setPullDistance(clamped);
      }
    };

    const handleTouchEnd = async () => {
      if (!touchActiveRef.current) return;
      touchActiveRef.current = false;

      const dist = pullDistanceRef.current;
      if (dist >= THRESHOLD && !isRefreshingRef.current) {
        setIsRefreshing(true);
        isRefreshingRef.current = true;
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          isRefreshingRef.current = false;
        }
      }
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []); // 빈 dependency — 리스너 한 번만 등록, ref로 최신값 참조

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
            className={`transition-transform ${isRefreshing ? "animate-spin" : ""}`}
            style={{
              transform: `rotate(${refreshProgress * 180}deg)`,
            }}
          />
          <span className="text-xs font-medium">
            {isRefreshing
              ? "새로고침 중..."
              : pullDistance >= THRESHOLD
                ? "손을 놓아 새로고침"
                : "당겨서 새로고침"}
          </span>
        </div>
      )}

      {/* 콘텐츠 */}
      <div style={{ marginTop: `${pullDistance * 0.5}px` }}>{children}</div>
    </div>
  );
}
