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
  const lockStateRef = useRef<"pending" | "horizontal" | "vertical-skip" | "vertical-pull" | null>(null);
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
    // iOS Safari에서 body position:fixed가 가로 스크롤 깨뜨림 → iOS는 락 skip
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const lockPageScroll = () => {
      if (isIOS) return; // iOS는 락 안 걸고 native 가로 스크롤에 맡김
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
      // no-pull 영역에서 시작된 터치 — 방향 판정 대기
      const target = e.target as HTMLElement | null;
      const noPull = target?.closest("[data-no-pull-refresh]");
      if (noPull) {
        // strict: 지도/세로 스크롤 시트 등 — 세로로 당겨도 절대 새로고침 안 함
        if (noPull.getAttribute("data-no-pull-refresh") === "strict") {
          lockStateRef.current = "vertical-skip";
          touchActiveRef.current = false;
          return;
        }
        // 기본(가로 캐러셀): 방향 판정 후 세로 당김이면 새로고침 허용
        lockStateRef.current = "pending";
        return;
      }
      // 일반 영역: 페이지 최상단일 때만 pull-to-refresh 활성화
      if (window.scrollY <= 1) {
        touchActiveRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // data-no-pull-refresh 영역에서 시작된 제스처: 방향 판정
      if (lockStateRef.current === "pending") {
        const t = e.touches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - startXRef.current);
        const dy = Math.abs(t.clientY - startYRef.current);
        const THRESH = 8;
        if (dx < THRESH && dy < THRESH) return; // 아직 미정
        if (dx > dy) {
          // 가로 우세 → body fixed 락 (가로 스크롤만 허용)
          lockStateRef.current = "horizontal";
          lockPageScroll();
        } else if (t.clientY - startYRef.current > 0 && window.scrollY <= 1) {
          // 세로 우세 + 아래로 당김 + 페이지 최상단:
          // 가로 캐러셀(홈 카드 등) 위에서 시작했더라도 세로로 당기면
          // 곧 페이지 전체를 당기는 동작 → 일반 pull-to-refresh로 진입.
          lockStateRef.current = "vertical-pull";
          touchActiveRef.current = true;
          const dist = t.clientY - startYRef.current;
          e.preventDefault();
          const clamped = Math.min(dist, THRESHOLD * 1.5);
          pullDistanceRef.current = clamped;
          setPullDistance(clamped);
          return;
        } else {
          // 세로 우세지만 위로 스크롤 중이거나 페이지가 이미 스크롤된 상태
          // → 시트/내부 세로 스크롤로 간주, pull-to-refresh 비활성
          lockStateRef.current = "vertical-skip";
          touchActiveRef.current = false;
        }
      }
      // 가로 락 / 세로 skip 상태: pull-to-refresh 비활성
      if (lockStateRef.current === "horizontal" || lockStateRef.current === "vertical-skip") return;

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
