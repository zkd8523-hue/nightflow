"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_PREFIX = "nightflow:revealed_offers";

/**
 * 시크릿 오퍼 긁기 결과 영속화.
 * - localStorage = 즉시 렌더용 캐시 (재방문 시 깜빡임 방지)
 * - puzzle_offer_reveals 테이블 = 진실의 원천 (multi-device 동기화)
 *
 * 흐름:
 *   mount → localStorage 즉시 hydrate → 백그라운드로 서버 fetch → 병합
 *   markRevealed → Set/localStorage 즉시 반영 → 서버 UPSERT (fire-and-forget)
 */
export function useRevealedOffers(userId: string | null | undefined) {
  const [revealedSet, setRevealedSet] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (!userId) {
      setRevealedSet(new Set());
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    const storageKey = `${STORAGE_PREFIX}:${userId}`;

    const fromLocal: string[] = (() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    if (fromLocal.length > 0) {
      setRevealedSet(new Set(fromLocal));
    }
    setIsLoaded(true);

    (async () => {
      try {
        const { data, error } = await supabaseRef.current
          .from("puzzle_offer_reveals")
          .select("offer_id")
          .eq("user_id", userId);

        if (cancelled) return;
        if (error || !data) return;

        const merged = new Set<string>(fromLocal);
        data.forEach((row) => merged.add(row.offer_id));

        setRevealedSet(merged);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...merged]));
        } catch {
          // ignore quota errors
        }
      } catch {
        // 서버 fetch 실패해도 localStorage 캐시로 동작
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hasRevealed = useCallback(
    (offerId: string) => revealedSet.has(offerId),
    [revealedSet]
  );

  const markRevealed = useCallback(
    (offerId: string) => {
      if (!userId) return;

      setRevealedSet((prev) => {
        if (prev.has(offerId)) return prev;
        const next = new Set(prev);
        next.add(offerId);
        try {
          localStorage.setItem(
            `${STORAGE_PREFIX}:${userId}`,
            JSON.stringify([...next])
          );
        } catch {
          // ignore
        }
        return next;
      });

      supabaseRef.current
        .from("puzzle_offer_reveals")
        .upsert(
          { user_id: userId, offer_id: offerId },
          { onConflict: "user_id,offer_id", ignoreDuplicates: true }
        )
        .then(({ error }) => {
          if (error) {
            console.error("[useRevealedOffers] upsert failed:", error);
          }
        });
    },
    [userId]
  );

  return { isLoaded, hasRevealed, markRevealed };
}
