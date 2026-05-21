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
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const touchActiveRef = useRef(false);
  // 가로 스크롤 영역(data-no-pull-refresh)에서 터치 시작 시:
  // - "pending" → 첫 8px 움직임으로 방향 판정 대기
  // - "horizontal" → body fixed로 페이지 세로 잠금 (가로 스크롤만 허용)
  // 세로 우세 시 락 안 걸고 일반 pull-to-refresh로 진입
  const lockStateRef = useRef<"pending" | "horizontal" | null>(null);
  const lockedScrollYRef = useRef<number | null>(null);
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
    const lockPageScroll = () => {
      if (lockedScrollYRef.current !== null) return;
      const y = window.scrollY;
      lockedScrollYRef.current = y;
      const body = document.body;
      body.style.position = "fixed";
      body.style.top = `-${y}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    };

    const unlockPageScroll = () => {
      const y = lockedScrollYRef.current;
      if (y === null) return;
      const body = document.body;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, y);
      lockedScrollYRef.current = null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      // 가로 스크롤 영역에서 시작된 터치 — 방향 판정 대기
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-pull-refresh]")) {
        lockStateRef.current = "pending";
        return;
      }
      // 일반 영역: 페이지 최상단일 때만 pull-to-refresh 활성화
      if (window.scrollY <= 1) {
        touchActiveRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // 가로 스크롤 영역에서 시작된 제스처: 방향 판정
      if (lockStateRef.current === "pending") {
        const t = e.touches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - startXRef.current);
        const dy = Math.abs(t.clientY - startYRef.current);
        const THRESH = 8;
        if (dx < THRESH && dy < THRESH) return; // 아직 미정
        if (dx > dy) {
          // 가로 우세 → body fixed 락
          lockStateRef.current = "horizontal";
          lockPageScroll();
        } else {
          // 세로 우세 → 락 해제하고 일반 pull-to-refresh로 진입
          lockStateRef.current = null;
          if (window.scrollY <= 1) {
            touchActiveRef.current = true;
          }
        }
      }
      // 가로 락 상태: body가 fixed라 세로 못 움직임, native 가로 스크롤만 동작
      if (lockStateRef.current === "horizontal") return;

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
      lockStateRef.current = null;
      unlockPageScroll();
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
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      // 언마운트 시 body 락이 남아있으면 정리
      if (lockedScrollYRef.current !== null) {
        const y = lockedScrollYRef.current;
        const body = document.body;
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        window.scrollTo(0, y);
        lockedScrollYRef.current = null;
      }
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
