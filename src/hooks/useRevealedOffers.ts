"use client";

import { useEffect, useState } from "react";

const STORAGE_PREFIX = "nightflow:revealed_offers";

export function useRevealedOffers(userId: string | null | undefined) {
  const [revealedSet, setRevealedSet] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIsLoaded(true);
      return;
    }
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRevealedSet(new Set(parsed));
        }
      }
    } catch {
      // localStorage 접근 실패 / JSON 파싱 실패 시 무시 (모두 잠금 상태로 시작)
    }
    setIsLoaded(true);
  }, [userId]);

  const hasRevealed = (offerId: string) => revealedSet.has(offerId);

  const markRevealed = (offerId: string) => {
    if (!userId) return;
    setRevealedSet((prev) => {
      if (prev.has(offerId)) return prev;
      const next = new Set(prev);
      next.add(offerId);
      try {
        localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify([...next]));
      } catch {
        // 저장 실패해도 메모리 상태는 유지
      }
      return next;
    });
  };

  return { isLoaded, hasRevealed, markRevealed };
}
