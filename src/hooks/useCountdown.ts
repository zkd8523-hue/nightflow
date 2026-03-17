"use client";

import { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";

/** 긴박감 레벨 (3단계) */
export type UrgencyLevel = 'normal' | 'warning' | 'critical';

/** 남은 시간(초)에 따른 긴박감 레벨 계산 */
export function getUrgencyLevel(seconds: number): UrgencyLevel {
  if (seconds > 300) return 'normal';    // 5분 이상
  if (seconds > 60) return 'warning';    // 1-5분
  return 'critical';                      // 1분 미만
}

/** 카운트다운 훅 결과 */
interface UseCountdownResult {
  remaining: number;
  level: UrgencyLevel;
  shouldFlash: boolean;
}

/** 카운트다운 훅: 남은 초, 긴박감 레벨, flip 애니메이션 트리거 반환 */
export function useCountdown(targetTime: string | null): UseCountdownResult {
  const calculateRemaining = (time: string | null) => {
    if (!time) return 0;
    const target = dayjs(time);
    return target.isValid() ? Math.max(0, target.diff(dayjs(), "second")) : 0;
  };

  const [remaining, setRemaining] = useState(() => calculateRemaining(targetTime));
  const [shouldFlash, setShouldFlash] = useState(false);
  const [prevTargetTime, setPrevTargetTime] = useState(targetTime);
  const prevRemainingRef = useRef(remaining);

  // targetTime이 변경되면 렌더링 중에 상태를 즉시 조정 (useEffect 대기 방지 및 경고 해결)
  if (targetTime !== prevTargetTime) {
    setPrevTargetTime(targetTime);
    const newRemaining = calculateRemaining(targetTime);
    setRemaining(newRemaining);
    prevRemainingRef.current = newRemaining;
  }

  useEffect(() => {
    const intervalId = setInterval(() => {
      const newRemaining = calculateRemaining(targetTime);
      const prev = prevRemainingRef.current;

      // 10초 단위에서 flip 애니메이션 트리거 (60초 이하만)
      if (
        newRemaining <= 60 &&
        newRemaining > 0 &&
        newRemaining % 10 === 0 &&
        prev !== newRemaining
      ) {
        setShouldFlash(true);
        setTimeout(() => setShouldFlash(false), 400);
      }

      setRemaining(newRemaining);
      prevRemainingRef.current = newRemaining;
    }, 1000);

    return () => clearInterval(intervalId);
  }, [targetTime]);

  const level = getUrgencyLevel(remaining);

  return { remaining, level, shouldFlash };
}
