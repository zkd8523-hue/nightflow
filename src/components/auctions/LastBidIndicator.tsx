"use client";

import { useEffect, useState, memo } from "react";
import dayjs from "dayjs";

interface LastBidIndicatorProps {
  lastBidTime: string | null;
}

/**
 * 마지막 입찰 경과 시간 표시 컴포넌트
 *
 * 데이터 소스: bids[0].created_at (최근 입찰 시간)
 * 매초 업데이트하여 "X초 전 입찰" 또는 "X분 전 입찰" 표시
 * 경쟁 심리 자극 및 FOMO 유발
 */
export const LastBidIndicator = memo(function LastBidIndicator({ lastBidTime }: LastBidIndicatorProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!lastBidTime) return;

    const updateElapsed = () => {
      const seconds = dayjs().diff(dayjs(lastBidTime), "second");

      if (seconds < 60) {
        setElapsed(`${seconds}초 전 입찰`);
      } else {
        const mins = Math.floor(seconds / 60);
        setElapsed(`${mins}분 전 입찰`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [lastBidTime]);

  if (!lastBidTime || !elapsed) return null;

  return (
    <div className="text-xs text-neutral-500 font-medium">
      {elapsed}
    </div>
  );
});
