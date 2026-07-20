"use client";

import { useState, useEffect, useRef } from "react";

/**
 * 서버에서 렌더된 목록 아이템(JSX 배열)을 처음 `initial`개만 그리고,
 * "더보기" 버튼 또는 하단 스크롤 도달 시 `step`개씩 추가로 그린다.
 * 데이터는 서버에서 전체를 받으므로 카운트·필터는 그대로 유지되고,
 * 무거운 카드 렌더링만 점진적으로 수행해 초기 렌더를 가볍게 한다.
 */
export function ProgressiveList({
  items,
  initial = 7,
  step = 10,
}: {
  items: React.ReactNode[];
  initial?: number;
  step?: number;
}) {
  const [visible, setVisible] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // items가 바뀌면(필터/정렬 변경) 처음부터 다시
  useEffect(() => {
    setVisible(initial);
  }, [items, initial]);

  const hasMore = visible < items.length;

  // 하단 sentinel이 보이면 자동으로 더 로드
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => Math.min(v + step, items.length));
        }
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, step, items.length]);

  return (
    <>
      {items.slice(0, visible)}
      {hasMore && (
        <div ref={sentinelRef} className="pt-2">
          <button
            type="button"
            onClick={() => setVisible((v) => Math.min(v + step, items.length))}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-muted text-foreground/80 border border-border hover:bg-muted transition-colors"
          >
            더보기 ({items.length - visible}건 남음)
          </button>
        </div>
      )}
    </>
  );
}
